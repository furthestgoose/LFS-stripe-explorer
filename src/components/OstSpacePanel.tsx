"use client";

import { useState } from "react";
import type { ScanResult, FileStripeInfo } from "@/lib/types";
import { buildRebalanceSuggestions, RebalanceSuggestion, formatBytes, pct } from "@/lib/rebalance";

/**
 * Per-OST capacity (from `lfs df`) with layout-balance context, plus copy-paste
 * migration suggestions for the hottest OSTs when the cluster is unbalanced.
 */
export default function OstSpacePanel({ result }: { result: ScanResult }) {
  const space = result.ostSpace;
  if (!space?.length) return null;
  const scanOSTs = new Set((result.ostProfile?.perOST ?? []).map((r) => r.index));
  const usage = new Map<number, FileStripeInfo[]>();
  for (const f of result.files) {
    for (const s of f.stripes) {
      if (s.ost >= 0) {
        const list = usage.get(s.ost) ?? [];
        list.push(f);
        usage.set(s.ost, list);
      }
    }
  }
  const suggestions = buildRebalanceSuggestions(result);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        OST capacity &amp; balance <span className="font-normal text-zinc-500">(lfs df)</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="px-2 py-1">OST</th>
              <th className="px-2 py-1">capacity</th>
              <th className="px-2 py-1">used %</th>
              <th className="px-2 py-1">free</th>
              <th className="px-2 py-1">inodes</th>
              <th className="px-2 py-1">scanned files</th>
              <th className="px-2 py-1">data</th>
            </tr>
          </thead>
          <tbody>
            {space.map((s) => {
              const files = usage.get(s.index) ?? [];
              return (
                <tr key={s.name} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1 font-mono text-xs">
                    {s.name}
                    {!scanOSTs.has(s.index) && <span className="ml-1 text-zinc-400">(not in scan)</span>}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{formatBytes(s.totalK * 1024)}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className={pct(s.usePct) >= 80 ? "h-2 bg-red-600" : pct(s.usePct) >= 60 ? "h-2 bg-amber-500" : "h-2 bg-emerald-600"}
                          style={{ width: `${Math.min(100, pct(s.usePct))}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs">{pct(s.usePct)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{formatBytes(s.freeK * 1024)}</td>
                  <td className="px-2 py-1 font-mono text-xs">
                    {s.inodesTotal != null ? `${s.inodesUsed?.toLocaleString()}/${s.inodesTotal.toLocaleString()} (${pct(s.inodesTotal ? (s.inodesUsed! / s.inodesTotal) * 100 : 0)}%)` : "n/a"}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{files.length}</td>
                  <td className="px-2 py-1 font-mono text-xs">
                    {formatBytes(files.reduce((acc, f) => acc + f.size, 0))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {suggestions.length > 0 && (
        <RebalanceSuggestions suggestions={suggestions} />
      )}
    </section>
  );
}

interface RebalanceSuggestionsProps {
  suggestions: RebalanceSuggestion[];
}

function RebalanceSuggestions({ suggestions }: RebalanceSuggestionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      <button type="button" onClick={() => setOpen(!open)} className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {open ? "▾" : "▸"} Rebalance suggestions ({suggestions.reduce((a, s) => a + s.files.length, 0)} commands for {suggestions.length} OST(s))
      </button>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        Preview only — verify flags with `lfs migrate --help` on your cluster before running; this tool does not execute anything.
      </p>
      {open && (
        <div className="mt-2 space-y-3">
          {suggestions.map((s) => (
            <div key={s.index}>
              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {s.label}
              </div>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-100 p-2 font-mono text-[11px] leading-4 dark:bg-zinc-800">
{s.files.map((f) => f.command).join("\n")}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
