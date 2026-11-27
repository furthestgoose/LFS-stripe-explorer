import type { FileStripeInfo, Layout } from "./types";
import { formatBytes } from "./rebalance";

export type AdviceKind =
  | "overstriped-tiny"
  | "overstriped-small"
  | "wide-mirrors"
  | "oversized-mirrors"
  | "hot-single-ost";

export interface Advice {
  kind: AdviceKind;
  /** Short human label, e.g. "overstriped". */
  label: string;
  detail: string;
  /** Optional `lfs setstripe` command to apply a saner layout. */
  command: string | null;
}

/** Whole bytes of one stripe unit, for sanity-checking width thresholds. */
function stripeUnitBytes(l: Layout): number {
  if (l.type === "raid0") return l.stripe_size || 1024 ** 2;
  if (l.type === "raid1") {
    const first = l.sub_overrides[0];
    return first ? first.stripe_size || 1024 ** 2 : 1024 ** 2;
  }
  return 1024 ** 2;
}

/** Number of distinct stripes a file of this size writes under this layout. */
function stripesUsed(file: FileStripeInfo): number {
  if (file.stripes.length > 0) return file.stripes.length;
  // Unplaced files still write a full stripe per OST the layout rotates over.
  return Math.max(1, Math.ceil(file.size / stripeUnitBytes(file.layout)));
}

export function adviseFile(file: FileStripeInfo): Advice | null {
  const l = file.layout;
  const placed = file.stripes.filter((s) => s.ost >= 0);
  const oneCopyBytes = l.type === "raid1" ? file.size / Math.max(1, l.mirror_count) : file.size;

  if (l.type === "raid0" && l.stripe_count >= 2) {
    const unplaced = placed.length === 0;
    const wideEnough = file.size >= 2 * l.stripe_count * l.stripe_size;
    if (!wideEnough && (
      (unplaced && file.size >= 0 && file.size < l.stripe_size) ||
      (!unplaced && file.size < l.stripe_size)
    )) {
      // File never fills even one stripe: only worth restriping if the size is
      // permanent (appending won't naturally use the extra OSTs anyway).
      return {
        kind: "overstriped-tiny",
        label: "overstriped",
        detail: `${formatBytes(file.size)} on a ${l.stripe_count}-OST ${formatBytes(l.stripe_size)}-stripe layout uses at most 1 stripe`,
        command: commandIfPlaced(file, "1M", "1"),
      };
    }
    if (
      !unplaced &&
      file.size < l.stripe_count * l.stripe_size &&
      stripesUsed(file) < l.stripe_count &&
      file.size >= 1024 ** 2
    ) {
      return {
        kind: "overstriped-small",
        label: "overstriped",
        detail: `only ${stripesUsed(file)} of ${l.stripe_count} stripes used — spread over ${placed.length} OSTs`,
        command: commandIfPlaced(file, sizeFlagFor(l), String(neededCount(file))),
      };
    }
  }

  if (l.type === "raid1") {
    if (l.mirror_count >= 4 && file.size / l.mirror_count < 1024 ** 2) {
      return {
        kind: "wide-mirrors",
        label: "wide mirrors",
        detail: `${l.mirror_count} copies of a ${formatBytes(file.size)} file wastes ~${formatBytes((l.mirror_count - 1) * file.size)}`,
        command: commandIfPlaced(file, "1M", null, "2"),
      };
    }
    if (
      l.mirror_count >= 2 &&
      oneCopyBytes / l.mirror_count >= 8 * 1024 ** 3 &&
      file.size < 64 * 1024 ** 3
    ) {
      return {
        kind: "oversized-mirrors",
        label: "mirror candidate",
        detail: `large single-layout file that may deserve protection (or a PFL: protect the tail)`,
        command: null,
      };
    }
  }

  if (placed.length === 1 && file.size >= 8 * 1024 ** 3) {
    return {
      kind: "hot-single-ost",
      label: "hot single OST",
      detail: `${formatBytes(file.size)} pinned to OST ${placed[0].ost}`,
      command: commandIfPlaced(file, sizeFlagFor(l), "2"),
    };
  }

  return null;
}

/** Scan a result set, returning only the files that earned an advice badge. */
export function collectAdvice(files: FileStripeInfo[]): Array<{ file: FileStripeInfo; advice: Advice }> {
  const out: Array<{ file: FileStripeInfo; advice: Advice }> = [];
  for (const f of files) {
    const a = adviseFile(f);
    if (a) out.push({ file: f, advice: a });
  }
  return out;
}

export function adviceSummary(entries: Array<{ advice: Advice }>): Array<{ label: string; count: number }> {
  const counts = new Map<AdviceKind, number>();
  for (const { advice } of entries) counts.set(advice.kind, (counts.get(advice.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => ({ label: LABELS[kind], count }));
}

const LABELS: Record<AdviceKind, string> = {
  "overstriped-tiny": "overstriped (< 1 stripe)",
  "overstriped-small": "overstriped",
  "wide-mirrors": "wide mirrors",
  "oversized-mirrors": "mirror candidate",
  "hot-single-ost": "hot single OST",
};

function neededCount(file: FileStripeInfo): string {
  // Leave one stripe of headroom so a modest append does not re-trigger advice.
  return String(Math.max(1, stripesUsed(file) + 1));
}

function sizeFlagFor(l: Layout): string {
  const unit = stripeUnitBytes(l);
  return unit % (1024 ** 2) === 0 && unit >= 1024 ** 2 ? `${unit / 1024 ** 2}M` : "1M";
}

function commandIfPlaced(file: FileStripeInfo, sizeFlag: string | null, count: string | null, mirrors: string | null = null): string | null {
  if (!file.stripes.some((s) => s.ost >= 0)) return null;
  if (mirrors) return `lfs migrate --mirror-count ${mirrors} '${file.path}'`;
  const flags = sizeFlag ? `--stripe-size ${sizeFlag} ` : "";
  return `lfs migrate ${flags}--stripe-count ${count} '${file.path}'`;
}
