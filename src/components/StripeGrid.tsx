"use client";

import { useMemo, useState } from "react";
import type { FileStripeInfo, ScanResult } from "@/lib/types";

interface Props {
  result: ScanResult;
}

const PALETTE = [
  "#0e7490", "#c026d3", "#65a30d", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#4d7c0f", "#b45309", "#991b1b", "#6d28d9",
];

function ostColor(ostIndex: number): string {
  return PALETTE[ostIndex % PALETTE.length];
}

/** Grid: one row per OST, one cell per stripe the file has on that OST. */
export default function StripeGrid({ result }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FileStripeInfo | null>(null);

  const ostIndices = useMemo(() => {
    const set = new Set<number>();
    for (const f of result.files) for (const s of f.stripes) if (s.ost >= 0) set.add(s.ost);
    return [...set].sort((a, b) => a - b);
  }, [result]);

  const files = useMemo(() => {
    const q = query.trim().toLowerCase();
    const limited = query ? result.files : result.files.slice(0, 60);
    return q ? result.files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 60) : limited;
  }, [result, query]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Stripe map {query ? "(filtered)" : "(first 60 files)"}</h2>
        <input
          className="w-64 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="filter by path…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="mb-1 flex gap-1">
            <div className="w-64 shrink-0 text-xs font-medium text-zinc-500">file</div>
            {ostIndices.map((idx) => (
              <div key={idx} className="w-4 text-center text-[10px] text-zinc-400">{idx}</div>
            ))}
          </div>
          {files.map((f) => (
            <StripeRow key={f.path} file={f} ostIndices={ostIndices} onSelect={() => setSelected(f)} />
          ))}
        </div>
      </div>
      {selected && <FileDrawer file={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function StripeRow({ file, ostIndices, onSelect }: { file: FileStripeInfo; ostIndices: number[]; onSelect: () => void }) {
  const byOst = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of file.stripes) {
      if (s.ost >= 0) m.set(s.ost, (m.get(s.ost) ?? 0) + 1);
    }
    return m;
  }, [file]);
  const name = file.path.split("/").filter(Boolean).pop() ?? file.path;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-1 rounded px-0 py-0.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      title={file.path}
    >
      <div className="w-64 shrink-0 truncate pr-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{name}</div>
      {ostIndices.map((idx) => {
        const count = byOst.get(idx) ?? 0;
        return (
          <div
            key={idx}
            className="h-4 w-4"
            style={{ backgroundColor: count ? ostColor(idx) : "transparent", borderRadius: 2, boxShadow: count ? "inset 0 0 0 1px rgba(0,0,0,0.15)" : "inset 0 0 0 1px rgba(128,128,128,0.15)" }}
            title={count ? `${file.path}: ${count} stripe(s) on OST ${idx}` : ""}
          />
        );
      })}
    </button>
  );
}


function FileDrawer({ file, onClose }: { file: FileStripeInfo; onClose: () => void }) {
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
          <div><dt className="text-zinc-500">size</dt><dd className="font-mono">{file.size.toLocaleString()} B</dd></div>
          <div><dt className="text-zinc-500">layout</dt><dd className="font-mono">{describeLayout(file)}</dd></div>
          <div><dt className="text-zinc-500">stripes</dt><dd className="font-mono">{file.stripes.length}</dd></div>
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

function describeLayout(file: FileStripeInfo): string {
  const l = file.layout;
  if (l.type === "raid0") return `raid0 count=${l.stripe_count} size=${l.stripe_size}`;
  if (l.type === "raid1") return `raid1 mirrors=${l.mirror_count}`;
  return l.type;
}
