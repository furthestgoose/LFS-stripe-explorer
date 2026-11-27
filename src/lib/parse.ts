import type { Layout, StripeExtent } from "./types";

export interface ParsedStripeInfo {
  layout: Layout;
  stripes: StripeExtent[];
}

type RawNode = Record<string, unknown>;

interface RawLine {
  indent: number;
  key: string;
  value: string | null;
}

/** Splits text into indent/key/value triples, ignoring comments and blanks. */
function preprocessLines(text: string): RawLine[] {
  const lines: RawLine[] = [];
  for (const line of text.split("\n")) {
    const noComment = line.split("#")[0];
    if (!noComment.trim()) continue;
    // Tolerates YAML list markers ("- 0: {...}") and inline flow maps; flow
    // entries become pseudo-nodes so nested stripes remain discoverable.
    // Indentation depth only matters relative to neighbours, so odd indents
    // (seen from some lfs builds) parse fine.
    const match = noComment.match(/^(\s*)(?:-\s+)?(?:([A-Za-z0-9_]+)\s*:?\s*)?([\{].*)?$/);
    const keyMatch = noComment.match(/^(\s*)(?:-\s+)?([A-Za-z0-9_]+):\s*(.*?)\s*$/);
    if (!match && !keyMatch) continue;
    let value: string | null = null;
    let indent = match ? match[1].length : 0;
    let key = match?.[2] ?? "";
    if (keyMatch) {
      indent = keyMatch[1].length;
      key = keyMatch[2];
      value = keyMatch[3];
    } else if (match) {
      value = match[3];
    }
    if (value === "" || value === "~" || value === "''" || value === '""') {
      value = null;
    }
    // lmm_* keys are emitted at file scope; indent noise must not bury them.
    if (key.startsWith("lmm_")) {
      lines.push({ indent: 0, key, value });
      continue;
    }
    if (value && value.trim().startsWith("{")) {
      const inner = value.trim().slice(1, -1);
      lines.push({ indent, key, value: null });
      for (const pair of inner.split(",")) {
        const pm = pair.trim().match(/^([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
        if (pm) {
          lines.push({ indent: indent + 2, key: pm[1], value: pm[2] || null });
        }
      }
      continue;
    }
    lines.push({ indent, key, value });
  }
  return lines;
}

function toInt(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toBytes(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (/^[+-]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  const m = trimmed.match(/^([\d.]+)\s*([KMGT])?/i);
  if (!m) return 0;
  const n = Number.parseFloat(m[1]);
  const mult: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  const key = (m[2] ?? "").toUpperCase();
  const factor = mult[key];
  if (Number.isNaN(n) || factor === undefined) return 0;
  return Math.trunc(n * factor);
}


const OFFSET_KEY_RE = /^stripe[o_.]?(offset|offsets|object_id|objs_id|obj_id|oid|object|objs|idx|index|ost|ost_idx)$/i;

/**
 * Finds the key carrying OST ids on a stripe node. Real lfs builds differ:
 * plain raid0 uses "stripe_offset" (or "stripe_idx"/"stripe_index"); some
 * emit "oid"/"idx" pairs; "stripe_ost" appears for single-OST layouts.
 * Falls back to any "oid" key since it is unambiguous on stripe nodes.
 */
function findOffsetKey(obj: RawNode): string | undefined {
  const keys = Object.keys(obj);
  return (
    keys.find((k) => OFFSET_KEY_RE.test(k)) ??
    keys.find((k) => k.startsWith("stripe") && /idx$/i.test(k)) ??
    keys.find((k) => /(^|_)obj_id$/.test(k) || k.endsWith("_ost_idx")) ??
    keys.find((k) => k === "oid")
  );
}

function collectStripeNodes(node: unknown, out: RawNode[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectStripeNodes(item, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as RawNode;
  const lmmKeys = Object.keys(obj).filter((k) => /^lmm_/.test(k));
  if (lmmKeys.length === Object.keys(obj).length) return;
  const offsetKey = findOffsetKey(obj);
  if (offsetKey) out.push(obj);
  for (const value of Object.values(obj)) collectStripeNodes(value, out);
}


function buildTree(lines: RawLine[]): RawNode {
  const root: RawNode = {};
  const stack: Array<{ indent: number; node: RawNode }> = [{ indent: -1, node: root }];
  for (const line of lines) {
    let targetNode: RawNode | string;
    while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].node;
    if (line.value === null) {
      const child: RawNode = {};
      targetNode = child;
    } else {
      targetNode = line.value;
    }
    const existing = parent[line.key];
    if (existing === undefined) {
      parent[line.key] = targetNode;
    } else if (Array.isArray(existing)) {
      existing.push(targetNode);
    } else {
      parent[line.key] = [existing, targetNode];
    }
    if (line.value === null) {
      stack.push({ indent: line.indent, node: targetNode as RawNode });
    }
  }
  return root;
}


interface ComponentRow {
  ost: number;
  mirror: number;
  start: number | null;
  end: number | null;
}

function readCount(node: RawNode, keys: string[]): number | null {
  for (const key of keys) {
    const value = node[key];
    if (value === undefined || value === null) continue;
    const n = toInt(value as string | number);
    if (n !== 0 || String(value).trim() === "0") return n;
  }
  return null;
}

export function parseGetstripeYaml(text: string): ParsedStripeInfo | null {
  const lines = preprocessLines(text);
  if (!lines.length) return null;

  const root = buildTree(lines);

  const componentNodes: RawNode[] = [];
  collectStripeNodes(root, componentNodes);

  const components: ComponentRow[] = componentNodes.flatMap((node): ComponentRow[] => {
    const mirrorKey = ["mirror_id", "mirror", "mirrored_id"].find((k) => node[k] !== undefined);
    const mirror = mirrorKey ? toInt(node[mirrorKey]) : -1;
    const offsetKey = findOffsetKey(node);
    const rawOffsets = offsetKey ? node[offsetKey] : undefined;
    const offsets = Array.isArray(rawOffsets)
      ? rawOffsets.map((v) => toInt(v))
      : typeof rawOffsets === "string" && rawOffsets.includes(",")
        ? // Wide layouts may list every component's OST on one line.
          rawOffsets.split(",").map((v) => toInt(v.trim()))
        : [toInt(rawOffsets)];
    const start = readCount(node, ["stripe_start", "start_extent", "start", "fc_start"]);
    let end = readCount(node, ["stripe_end", "end_extent", "end", "fc_end"]);
    if (end !== null && end < 0) {
      end = 1_000_000_000; 
    }
    return offsets.map((ost) => ({ ost, mirror, start, end }));
  });

  if (!components.length) {
    const textRows = extractComponentsFromText(text);
    if (textRows.length) {
      return { layout: deriveLayoutFromText(text), stripes: textRows };
    }
  }

  const layout = deriveLayoutFromText(text);
  const stripes: StripeExtent[] = [];
  let cursor = 0;
  for (const row of components) {
    const start = row.start ?? cursor;
    const end = row.end !== null ? row.end : start + 1;
    stripes.push({ start: Math.max(start, 0), end: Math.max(end, start + 1), ost: row.ost, mirror: row.mirror });
    cursor = row.end ?? end;
  }
  if (!stripes.length && layout.type === "raid0" && layout.stripe_count > 0) {
    for (let i = 0; i < Math.min(layout.stripe_count, 1024); i++) {
      stripes.push({ start: i, end: i + 1, ost: -1, mirror: -1 });
    }
  }
  return { layout, stripes };
}

function extractComponentsFromText(text: string): StripeExtent[] {
  const rows: StripeExtent[] = [];
  const re = /ost\s*>\s*(\d+)\s*:\s*oid\s*[-=]?\s*(\d+)\s*[:.]?\s*(?:idx\s*[:=]?\s*)?(\d+)/gi;
  let m: RegExpExecArray | null = re.exec(text);
  let cursor = 0;
  while (m !== null) {
    const ost = Number.parseInt(m[1], 10);
    if (!Number.isNaN(ost) && ost >= 0) {
      rows.push({ start: cursor, end: cursor + 1, ost, mirror: -1 });
      cursor += 1;
    }
    m = re.exec(text);
  }
  return rows;
}

function deriveLayoutFromText(text: string): Layout {
  const lower = text.toLowerCase();
  const poolMatch = text.match(/lmm_pool_name\s*:\s*([^\s#]+)/i);
  const pool = poolMatch ? poolMatch[1] : null;
  const sizeMatch = text.match(/lmm_stripe_size\s*:\s*([^\s#]+)/i);
  const stripeSize = sizeMatch ? toBytes(sizeMatch[1]) : 0;

  const mirrors = (lower.match(/mirror_id\s*:/g) || []).length;
  const mirrored = /mirrored|mirror_count\s*:\s*[1-9]/.test(lower);
  if (mirrored || mirrors > 0) {
    return {
      type: "raid1",
      mirror_count: Math.max(mirrors, 1),
      sub_overrides: collectSubOverrides(text),
    };
  }

  const countMatch = text.match(/lmm_stripe_count\s*:\s*(-?\d+)/i);
  const count = countMatch ? Number.parseInt(countMatch[1], 10) : 0;
  if (/layout_variant\s*:\s*progressive/i.test(lower) || /-2\b/.test(countMatch?.[1] ?? "")) {
    return { type: "raid1", mirror_count: 1, sub_overrides: collectSubOverrides(text) };
  }
  return { type: "raid0", stripe_count: count || 1, stripe_size: stripeSize, pool };
}

type SubOverride = { start: number; end: number; stripe_count: number; stripe_size: number; pool: string | null };

function collectSubOverrides(text: string): SubOverride[] {
  const overrides: SubOverride[] = [];
  const re = /(?:^|\n)\s*-\s*\n?\s*start(?:_extent)?\s*:\s*(\d+)\s*\n\s*end(?:_extent)?\s*:\s*(\d+)(?:\s*\n\s*stripe_count\s*:\s*(-?\d+))?(?:\s*\n\s*stripe_size\s*:\s*([^\s#]+))?/gi;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const start = Number.parseInt(m[1], 10);
    const end = Number.parseInt(m[2], 10);
    const stripeCount = m[3] ? Number.parseInt(m[3], 10) : -1;
    const stripeSize = m[4] ? toBytes(m[4]) : -1;
    overrides.push({
      start,
      end,
      stripe_count: stripeCount,
      stripe_size: stripeSize,
      pool: null,
    });
    m = re.exec(text);
  }
  return overrides;
}

export function parseLegacyOutput(text: string): ParsedStripeInfo {
  const stripes: StripeExtent[] = [];
  const re = /ost\s*>\s*(\d+)\s*:\s*oid\s*[-=]?\s*(\d+)\s*(?:id?x\s*[-=]?\s*)?(\d+)/gi;
  let m: RegExpExecArray | null = re.exec(text);
  let cursor = 0;
  while (m !== null) {
    const ost = Number.parseInt(m[1], 10);
    if (!Number.isNaN(ost) && ost >= 0) {
      stripes.push({ start: cursor, end: cursor + 1, ost, mirror: -1 });
      cursor += 1;
    }
    m = re.exec(text);
  }
  return { layout: { type: "raid0", stripe_count: stripes.length || 1, stripe_size: 0, pool: null }, stripes };
}


export function inferOstCount(stripes: StripeExtent[]): number {
  const max = stripes.reduce((acc, s) => Math.max(acc, s.ost), -1);
  return max >= 0 ? max + 1 : 0;
}

export function expandComponent(component: StripeExtent): number[] {
  const out: number[] = [];
  for (let i = component.start; i < component.end; i++) {
    out.push(component.ost);
  }
  out.length = Math.max(out.length, 1);
  return out;
}
