"use client";

import { useCallback, useMemo, useState } from "react";
import ScanForm from "@/components/ScanForm";
import StatsCards from "@/components/StatsCards";
import StripeGrid from "@/components/StripeGrid";
import OstBalanceChart from "@/components/OstBalanceChart";
import OstSpacePanel from "@/components/OstSpacePanel";
import FileTable from "@/components/FileTable";
import FileDetailDrawer from "@/components/FileDetailDrawer";
import TreeRollup from "@/components/TreeRollup";
import ExportBar from "@/components/ExportBar";
import WatchControls from "@/components/WatchControls";
import type { FileStripeInfo, ScanPayload, ScanResult } from "@/lib/types";
import { buildTree } from "@/lib/tree";

// Smallest per-OST capacity (KiB) from lfs df, used to scale advisor hot
// thresholds down for small lab clusters; null when lfs df data is absent.
function ostCapacityFor(result: ScanResult | null): number | null {
  const caps = (result?.ostSpace ?? [])
    .map((o) => o.totalK)
    .filter((k): k is number => typeof k === "number" && k > 0);
  return caps.length ? Math.min(...caps) : null;
}

export default function Home() {
  const [payload, setPayload] = useState<ScanPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileStripeInfo | null>(null);

  // Shared scan trigger: the form, the watch toggle, and future refresh
  // buttons all POST the same request so UI state stays single-sourced.
  const runScan = useCallback(
    async (root: string, mode: "live" | "demo") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root, mode }),
        });
        const data = (await res.json()) as ScanPayload;
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.result) {
          setPayload(data);
          setDetail(null);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const tree = useMemo(
    () => (payload?.result ? buildTree(payload.root, payload.result.files) : []),
    [payload],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 font-sans">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Lustre Stripe Explorer</h1>
        <span className="text-sm text-zinc-500">
          {payload?.result
            ? `${payload.root} · ${payload.result.source}`
            : "point at a directory on a Lustre filesystem"}
        </span>
      </header>
      <ScanForm onScan={runScan} busy={busy} setBusy={setBusy} setError={setError} />
      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </div>
      )}
      {payload?.note && (
        <div className="rounded-lg border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-200">
          {payload.note}
        </div>
      )}
      {payload?.result && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ExportBar result={payload.result} tree={tree} />
            <WatchControls
              root={payload.root}
              busy={busy}
              onTick={() => runScan(payload.root, "live")}
            />
          </div>
          <StatsCards result={payload.result} />
          <div className="grid gap-4 lg:grid-cols-2">
            <OstBalanceChart result={payload.result} />
            <LayoutHistogram result={payload.result} />
          </div>
          <OstSpacePanel result={payload.result} />
          <TreeRollup tree={tree} />
          <StripeGrid result={payload.result} />
          <FileTable result={payload.result} ostCapacity={ostCapacityFor(payload.result)} onSelect={setDetail} />
...
        </>
      )}
      {detail && <FileDetailDrawer file={detail} ostCapacity={ostCapacityFor(payload?.result ?? null)} onClose={() => setDetail(null)} />}
      {!payload?.result && !busy && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Scan a directory — or check “demo data” — to see per-file stripe placement across OSTs.
        </div>
      )}
    </div>
  );
}

function LayoutHistogram({ result }: { result: ScanResult }) {
  const rows = result.statsExtra?.layoutHistogram ?? [];
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Layouts</h2>
      <div className="space-y-1">
        {rows.slice(0, 10).map((r) => (
          <div key={r.layout} className="flex items-center gap-2">
            <div className="w-40 shrink-0 truncate font-mono text-xs text-zinc-500">{r.layout}</div>
            <div className="h-4 flex-1 rounded-sm bg-zinc-100 dark:bg-zinc-800">
              <div className="h-4 rounded-sm bg-fuchsia-600" style={{ width: `${(r.value / total) * 100}%` }} />
            </div>
            <div className="w-12 shrink-0 text-right font-mono text-xs text-zinc-500">{r.value}</div>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-zinc-500">no layouts</p>}
      </div>
    </section>
  );
}
