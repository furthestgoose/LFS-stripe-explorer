import type { ScanResult } from "./types";
import { topOsts, type TreeNode } from "./tree";

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(header: string[], rows: string[][]): string {
  return (
    [
      header.map(csvField).join(","),
      ...rows.map((r) => r.map(csvField).join(",")),
    ].join("\n") + "\n"
  );
}

function layoutLabel(file: ScanResult["files"][number]): string {
  const l = file.layout;
  if (l.type === "raid0")
    return `raid0 count=${l.stripe_count} size=${l.stripe_size}`;
  if (l.type === "raid1") return `raid1 mirrors=${l.mirror_count}`;
  return `${l.type}`;
}

export function filesCsv(result: ScanResult): string {
  const header = [
    "path",
    "size_bytes",
    "size_human",
    "layout",
    "stripe_count",
    "stripe_size",
    "stripes_used",
    "osts",
  ];
  const rows = result.files.map((f) => {
    const osts = [
      ...new Set(f.stripes.filter((s) => s.ost >= 0).map((s) => s.ost)),
    ]
      .sort((a, b) => a - b)
      .join(";");
    const raid0 = f.layout.type === "raid0" ? f.layout : null;
    return [
      f.path,
      String(f.size),
      formatSize(f.size),
      layoutLabel(f),
      String(raid0?.stripe_count ?? ""),
      String(raid0?.stripe_size ?? ""),
      String(f.stripes.length),
      osts,
    ];
  });
  return toCsv(header, rows);
}

export function treeCsv(result: ScanResult, tree: TreeNode[]): string {
  const header = ["dir", "files", "bytes", "stripes", "OSTs"];
  const rows = tree.map((n) => [
    n.path || ".",
    String(n.files),
    String(n.bytes),
    String(n.stripes),
    topOsts(n, 8)
      .map((o) => `${o.ost}:${o.count}`)
      .join(";"),
  ]);
  return toCsv(header, rows);
}

export function treeOstCsv(result: ScanResult, tree: TreeNode[]): string {
  const header = ["dir", "ost", "count"];
  const rows: string[][] = [];
  for (const n of tree) {
    for (const { ost, count } of Object.entries(n.ostCount)
      .map(([o, c]) => ({ ost: Number(o), count: c }))
      .sort((a, b) => a.ost - b.ost)) {
      rows.push([n.path || ".", String(ost), String(count)]);
    }
  }
  return toCsv(header, rows);
}

export function scanJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

function formatSize(n: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
}
