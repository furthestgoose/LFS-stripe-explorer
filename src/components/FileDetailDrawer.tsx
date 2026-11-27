"use client";

import { useState } from "react";
import type { FileStripeInfo, StripeExtent } from "@/lib/types";
import { adviseFile, type Advice } from "@/lib/advisor";
import { formatBytes } from "@/lib/rebalance";

const FIRST_STRIPE_ROWS = 12;

/**
 * Per-file drill-down: layout, the full stripe extent table, and the verbatim
 * `lfs getstripe --yaml` output captured at scan time. Reused by the file table
 * and the stripe map.
 */
export default function FileDetailDrawer({ file, onClose }: { file: FileStripeInfo; onClose: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const advice = adviseFile(file);
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
        {advice && <Advisory advice={advice} />}
        <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-zinc-500">stripes</h4>
        <div className="mb-4 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                <th className="px-2 py-1">#</th><th className="px-2 py-1">start</th><th className="px-2 py-1">end</th>
                <th className="px-2 py-1">offset</th><th className="px-2 py-1">length</th>
                <th className="px-2 py-1">OST</th><th className="px-2 py-1">mirror</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? file.stripes : file.stripes.slice(0, FIRST_STRIPE_ROWS)).map((s, i) => (
                <tr key={i} className="border-t border-zinc-100 font-mono dark:border-zinc-800">
                  <td className="px-2 py-1">{i}</td>
                  <td className="px-2 py-1">{fmtHex(s.start)}</td>
                  <td className="px-2 py-1">{s.end >= EOF_SENTINEL ? "EOF" : fmtHex(s.end)}</td>
                  <td className="px-2 py-1">{formatBytes(s.start)}</td>
                  <td className="px-2 py-1">{formatBytes(stripeLength(s, file))}</td>
                  <td className="px-2 py-1">{s.ost < 0 ? "unplaced" : s.ost}</td>
                  <td className="px-2 py-1">{s.mirror < 0 ? "-" : s.mirror}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {file.stripes.length > FIRST_STRIPE_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {showAll ? "show fewer" : `show all ${file.stripes.length} stripes`}
            </button>
          )}
        </div>
        <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500">raw lfs getstripe</h4>
        <pre className="max-h-72 overflow-auto rounded bg-zinc-100 p-3 font-mono text-[11px] leading-4 dark:bg-zinc-800">{file.raw}</pre>
      </div>
    </div>
  );
}

const EOF_SENTINEL = 100000000;

/**
 * Advisory card: what looks off about this layout and — when the file has
 * placed stripes — a ready-to-run `lfs migrate` that applies the suggested one.
 */
function Advisory({ advice }: { advice: Advice }) {
  return (
    <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">advisory</span>
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
          {advice.label}
        </span>
      </div>
      <p className="mb-2 text-sm text-amber-900 dark:text-amber-100">{advice.detail}</p>
      {advice.command && (
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={advice.command} />
          <span className="font-mono text-xs text-amber-950 dark:text-amber-100">{advice.command}</span>
        </div>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => setDone(true)).catch(() => {})}
      className="shrink-0 rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

function fmtHex(n: number): string {
  return "0x" + n.toString(16);
}

/** Byte length of one stripe extent, honoring the EOF clamp in the parser. */
function stripeLength(s: StripeExtent, file: FileStripeInfo): number {
  const end = Math.min(s.end, file.size);
  return Math.max(1, end - s.start);
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
