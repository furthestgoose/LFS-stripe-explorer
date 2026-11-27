"use client";

import { useCallback, useEffect, useState } from "react";
import type { BrowseEntry, BrowseResult } from "@/lib/types";

interface Props {
  onScan: (root: string, mode: "live" | "demo") => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
}

export default function ScanForm({ onScan, busy, setBusy, setError }: Props) {
  const [root, setRoot] = useState("");
  const [dirs, setDirs] = useState<BrowseEntry[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "demo">("live");

  const browse = useCallback(async (target: string) => {
    try {
      const res = await fetch(`/api/browse?root=${encodeURIComponent(target)}`);
      const data = (await res.json()) as BrowseResult;
      setRoot(data.path);
      setDirs(data.entries ?? []);
      setParent(target && target !== "/" ? target.split("/").slice(0, -1).join("/") || "/" : null);
      setError(data.error ? `cannot list ${data.path}` : null);
    } catch {
      setError("browse failed");
    }
  }, [setError]);

  useEffect(() => {
    const id = setTimeout(() => void browse("/"), 0);
    return () => clearTimeout(id);
  }, [browse]);

  const scan = useCallback(async () => {
    setBusy(true);
    await onScan(root, mode);
    setBusy(false);
  }, [root, mode, onScan, setBusy]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!parent || parent === root} onClick={() => parent && void browse(parent)} className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-zinc-700">↑ up</button>
        <input
          className="min-w-72 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void browse(root);
          }}
          placeholder="/lustre/scratch/..."
        />
        <button type="button" onClick={() => void browse(root)} className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">browse</button>
        <button type="button" disabled={!root || busy} onClick={() => void scan()} className="rounded-md bg-cyan-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
          {busy ? "scanning…" : mode === "demo" ? "load demo" : `scan ${root || ""}`}
        </button>
        <label className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={mode === "demo"} onChange={(e) => setMode(e.target.checked ? "demo" : "live")} />
          demo data
        </label>
      </div>
      {dirs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {dirs.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => void browse(`${root.replace(/\/$/, "")}/${d.name}`)}
              className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-cyan-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-cyan-300"
            >
              {d.name}/
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
