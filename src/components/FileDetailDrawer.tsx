"use client";

import type { FileStripeInfo } from "@/lib/types";
import { formatBytes } from "@/lib/rebalance";

/**
 * Per-file drill-down: layout, the full stripe extent table, and the verbatim
 * `lfs getstripe --yaml` output captured at scan time. Reused by the file table
 * and the stripe map.
 */
export default function FileDetailDrawer({ file, onClose }: { file: FileStripeInfo; onClose: () => void }) {
  const placed = file.stripes.filter((s) => s.ost >= 0);
  const perOst = new Map<number, number>();
  for (const s of placed) perOst.set(s.ost, (perOst.get(s.ost) ?? 0) + Math.max(1, s.end - s.start));
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="break-all font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{file.path}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="close">
            ✕
          </button>
        </div>
        <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-zinc-500">size</dt><dd className="font-mono">{formatBytes(file.size)}</dd></div>
          <div><dt className="text-zinc-500">layout</dt><dd className="font-mono">{describeLayout(file)}</dd></div>
          <div><dt className="text-zinc-500">stripes</dt><dd className="font-mono">{file.stripes.length}</dd></div>
          <div>
            <dt className="text-zinc-500">bytes per OST</dt>
            <dd className="font-mono text-xs">
              {[...perOst.entries()].sort((a, b) => a[0] - b[0]).map(([ost, units]) => `OST ${ost}: ${formatBytes(units * stripeSizeOf(file))}`).join(" · ") || "unplaced"}
            </dd>
          </div>
        </dl>
        <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500">stripes</h4>
        <div className="mb-4 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="px-2 py-1">#</th><th className="px-2 py-1">start</th><th className="px-2 py-1">end</th>
                <th className="px-2 py-1">OST</th><th className="px-2 py-1">mirror</th>
              </tr>
            </thead>
            <tbody>
              {file.stripes.map((s, i) => (
                <tr key={i} className="border-t border-zinc-100 font-mono dark:border-zinc-800">
                  <td className="px-2 py-1">{i}</td>
                  <td className="px-2 py-1">{s.start}</td>
                  <td className="px-2 py-1">{s.end > 100000000 ? "EOF" : s.end}</td>
                  <td className="px-2 py-1">{s.ost < 0 ? "unplaced" : s.ost}</td>
                  <td className="px-2 py-1">{s.mirror < 0 ? "-" : s.mirror}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500">raw lfs getstripe</h4>
        <pre className="max-h-72 overflow-auto rounded bg-zinc-100 p-3 font-mono text-[11px] leading-4 dark:bg-zinc-800">{file.raw}</pre>
      </div>
    </div>
  );
}

function stripeSizeOf(file: FileStripeInfo): number {
  if (file.layout.type === "raid0") return file.layout.stripe_size || 1048576;
  return 1048576;
}

function describeLayout(file: FileStripeInfo): string {
  const l = file.layout;
  if (l.type === "raid0") return `raid0 count=${l.stripe_count} size=${l.stripe_size}`;
  if (l.type === "raid1") return `raid1 mirrors=${l.mirror_count}`;
  return l.type;
}
