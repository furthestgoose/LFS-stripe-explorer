import type { ScanResult } from "@/lib/types";

function fmtBytes(n: number): string {
  if (!n) return "0";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
}

export function fmtBytesExport(n: number): string {
  return fmtBytes(n);
}

export default function StatsCards({ result }: { result: ScanResult }) {
  const { stats } = result;
  const cards = [
    { label: "Files", value: stats.files.toLocaleString() },
    { label: "Stripes", value: stats.totalStripes.toLocaleString() },
    { label: "OSTs in use", value: stats.ostCount.toLocaleString() },
    { label: "Total size", value: fmtBytes(stats.totalSize) },
    { label: "Balance", value: `${stats.balancePct.toFixed(1)}%` },
    { label: "Min/max per OST", value: `${stats.minPerOST} / ${stats.maxPerOST}` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{c.label}</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
