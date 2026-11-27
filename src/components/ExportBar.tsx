"use client";

import { filesCsv, scanJson, treeCsv, treeOstCsv } from "@/lib/exporters";
import type { TreeNode } from "@/lib/tree";
import type { ScanResult } from "@/lib/types";

function download(stem: string, ext: "csv" | "json", text: string) {
  const blob = new Blob([text], {
    type: ext === "csv" ? "text/csv" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stem}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

const BUTTON =
  "rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function nameStem(result: ScanResult): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const rootPart =
    result.root.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    "root";
  return `lustre-scan-${rootPart}-${stamp}`;
}

export default function ExportBar({
  result,
  tree,
}: {
  result: ScanResult;
  tree: TreeNode[];
}) {
  const stem = () => nameStem(result);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="text-xs uppercase">export</span>
      <button
        type="button"
        className={BUTTON}
        onClick={() => download(stem(), "csv", filesCsv(result))}
      >
        files.csv
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => download(stem(), "csv", treeCsv(result, tree))}
      >
        tree.csv
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => download(stem(), "csv", treeOstCsv(result, tree))}
      >
        tree-osts.csv
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => download(stem(), "json", scanJson(result))}
      >
        scan.json
      </button>
    </div>
  );
}
