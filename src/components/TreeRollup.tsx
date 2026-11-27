"use client";

import { useMemo, useState } from "react";
import { formatBytes } from "@/lib/rebalance";
import { topOsts, type TreeNode } from "@/lib/tree";

const OST_COLORS = [
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-violet-500",
];

function colorFor(ost: number): string {
  return OST_COLORS[Math.abs(ost * 7 + 3) % OST_COLORS.length];
}

function Bar({ node }: { node: TreeNode }) {
  const osts = topOsts(node, 4);
  const ownTotal = osts.reduce((a, o) => a + o.count, 0) || 1;
  return (
    <div className="h-4 min-w-24 flex-1 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
      <div className="flex h-4 w-full">
        {osts.map(({ ost, count }) => (
          <div
            key={ost}
            className={`h-4 ${colorFor(ost)}`}
            style={{ width: `${(count / ownTotal) * 100}%` }}
            title={`OST ${ost}: ${count} components`}
          />
        ))}
      </div>
    </div>
  );
}

export default function TreeRollup({
  tree,
  maxRows = 200,
}: {
  tree: TreeNode[];
  maxRows?: number;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([""]));
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const rows = useMemo(() => {
    const byParent = new Map<string, TreeNode[]>();
    for (const n of tree) {
      const parent = n.path.split("/").slice(0, -1).join("/");
      const list = byParent.get(parent) ?? [];
      list.push(n);
      byParent.set(parent, list);
    }
    if (collapsed) {
      const root = tree.find((n) => n.path === "");
      return root ? [root] : [];
    }
    const out: TreeNode[] = [];
    const walk = (dir: string) => {
      for (const child of (byParent.get(dir) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        out.push(child);
        if (open.has(child.path)) walk(child.path);
      }
    };
    walk("");
    return out;
  }, [tree, open, collapsed]);

  const visible = showAll ? rows : rows.slice(0, maxRows);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Directory tree
        </h2>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-700"
          >
            {collapsed ? "expand" : "collapse"}
          </button>
          {rows.length > maxRows && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-700"
            >
              {showAll ? "show fewer" : `show all ${rows.length}`}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="px-2 py-1">dir</th>
              <th className="px-2 py-1">files</th>
              <th className="px-2 py-1">bytes</th>
              <th className="px-2 py-1">stripes</th>
              <th className="px-2 py-1">top OSTs</th>
              <th className="px-2 py-1">spread</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const kids = tree.filter(
                (c) =>
                  c.path.split("/").slice(0, -1).join("/") === n.path &&
                  c.path !== "",
              ).length;
              const indent = { paddingLeft: `${n.depth * 12 + 8}px` };
              return (
                <tr
                  key={n.path || "."}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-xs">
                    {kids > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggle(n.path)}
                        className="mr-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        {open.has(n.path) ? "▾" : "▸"}
                      </button>
                    ) : (
                      <span className="mr-1 inline-block w-3" />
                    )}
                    <span style={indent}>{n.name}</span>
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{n.files}</td>
                  <td className="px-2 py-1 font-mono text-xs">
                    {formatBytes(n.bytes)}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{n.stripes}</td>
                  <td className="px-2 py-1 font-mono text-xs text-zinc-500">
                    {topOsts(n, 4)
                      .map((o) => `${o.ost}×${o.count}`)
                      .join(" ")}
                  </td>
                  <td className="w-48 px-2 py-1">
                    <Bar node={n} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
