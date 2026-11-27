"use client";

import type { ScanResult } from "@/lib/types";

/** Horizontal bars: component count per OST (sorted by OST index). */
export default function OstBalanceChart({ result }: { result: ScanResult }) {
  const rows = result.ostProfile?.perOST ?? [];
  const max = Math.max(1, ...rows.map((r) => r.countBytes));
  if (!rows.length) return null;
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">OST balance (components per OST)</h2>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.index} className="flex items-center gap-2">
            <div className="w-24 shrink-0 truncate font-mono text-xs text-zinc-500" title={result.ostNames?.[r.index] ?? `OST ${r.index}`}>
              {result.ostNames?.[r.index] ?? `OST ${r.index}`}
            </div>
            <div className="h-4 flex-1 rounded-sm bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-4 rounded-sm bg-cyan-600"
                style={{ width: `${(r.countBytes / max) * 100}%` }}
                title={`${r.countBytes} components, ${r.weightedBytes} weighted bytes`}
              />
            </div>
            <div className="w-16 shrink-0 text-right font-mono text-xs text-zinc-500">{r.countBytes}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span>gini: {(result.ostProfile.countGini ?? 0).toFixed(3)}</span>
        <span>CV: {(result.ostProfile.countCV ?? 0).toFixed(3)}</span>
        <span>count↔bytes r: {(result.ostProfile.countVsBytesCorrelation ?? 0).toFixed(3)}</span>
      </div>
    </section>
  );
}
