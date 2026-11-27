"use client";

import { useMemo, useState } from "react";
import type { FileStripeInfo, ScanResult } from "@/lib/types";

export default function FileTable({ result, onSelect }: { result: ScanResult; onSelect?: (f: FileStripeInfo) => void }) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? result.files.filter((f) => f.path.toLowerCase().includes(q)) : result.files;
  }, [result, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Files {filtered.length !== result.files.length && <span className="text-zinc-500">({filtered.length}/{result.files.length})</span>}
        </h2>
        <input
          className="w-64 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="filter by path…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="px-2 py-1">path</th>
              <th className="px-2 py-1">size</th>
              <th className="px-2 py-1">layout</th>
              <th className="px-2 py-1">stripes</th>
              <th className="px-2 py-1">OSTs</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <FileRow key={f.path} file={f} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
        <span>page {safePage + 1} / {pages}</span>
        <div className="flex gap-2">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700">prev</button>
          <button type="button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700">next</button>
        </div>
      </div>
    </section>
  );
}


function fmtBytes(n: number): string {
  if (!n) return "0";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
}

function layoutLabel(f: FileStripeInfo): string {
  const l = f.layout;
  if (l.type === "raid0") return `raid0 ×${l.stripe_count}`;
  if (l.type === "raid1") return `raid1 ×${l.mirror_count}`;
  return l.type;
}

function FileRow({ file, onSelect }: { file: FileStripeInfo; onSelect?: (f: FileStripeInfo) => void }) {
  const osts = useMemo(() => [...new Set(file.stripes.filter((s) => s.ost >= 0).map((s) => s.ost))].sort((a, b) => a - b), [file]);
  return (
    <tr
      className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
      onClick={() => onSelect?.(file)}
      title="click for stripe detail"
    >
      <td className="max-w-[28rem] truncate px-2 py-1 font-mono text-xs" title={file.path}>{file.path}</td>
      <td className="px-2 py-1 font-mono text-xs">{fmtBytes(file.size)}</td>
      <td className="px-2 py-1 font-mono text-xs">{layoutLabel(file)}</td>
      <td className="px-2 py-1 font-mono text-xs">{file.stripes.length}</td>
      <td className="px-2 py-1 font-mono text-xs">{osts.join(", ")}</td>
    </tr>
  );
}
