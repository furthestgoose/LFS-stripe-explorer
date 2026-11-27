import type { FileStripeInfo } from "./types";

export interface TreeNode {
  path: string;
  name: string;
  files: number;
  bytes: number;
  stripes: number;
  ostCount: Record<number, number>;
  depth: number;
}

function segmentsOf(rel: string): string[] {
  return rel.split("/").filter(Boolean);
}

export function buildTree(root: string, files: FileStripeInfo[]): TreeNode[] {
  const rootPrefix =
    root.endsWith("/") && root !== "/" ? root.slice(0, -1) : root;
  const nodes = new Map<string, TreeNode>();
  const ensure = (rel: string): TreeNode => {
    let node = nodes.get(rel);
    if (!node) {
      const segs = segmentsOf(rel);
      node = {
        path: rel,
        name: rel === "" ? "." : segs[segs.length - 1],
        files: 0,
        bytes: 0,
        stripes: 0,
        ostCount: {},
        depth: segs.length,
      };
      nodes.set(rel, node);
    }
    return node;
  };
  ensure("");

  for (const file of files) {
    const dir = file.path.slice(0, file.path.lastIndexOf("/")) || "/";
    let rel =
      dir === rootPrefix || dir === rootPrefix + "/"
        ? ""
        : dir.startsWith(rootPrefix + "/")
          ? dir.slice(rootPrefix.length + 1)
          : dir.replace(/^\/+/, "");
    if (rel === "/") rel = "";
    for (;;) {
      const node = ensure(rel);
      node.files += 1;
      node.bytes += file.size;
      node.stripes += file.stripes.length;
      for (const s of file.stripes) {
        if (s.ost >= 0) node.ostCount[s.ost] = (node.ostCount[s.ost] ?? 0) + 1;
      }
      if (rel === "") break;
      const segs = segmentsOf(rel);
      segs.pop();
      rel = segs.join("/");
    }
  }
  return [...nodes.values()];
}

export function topOsts(
  node: TreeNode,
  limit = 4,
): Array<{ ost: number; count: number }> {
  return Object.entries(node.ostCount)
    .map(([ost, count]) => ({ ost: Number(ost), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
