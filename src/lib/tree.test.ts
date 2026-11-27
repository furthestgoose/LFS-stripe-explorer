import { describe, expect, it } from "vitest";
import { buildTree, topOsts, type TreeNode } from "./tree";
import type { FileStripeInfo, StripeExtent } from "./types";

function file(path: string, size: number, osts: number[]): FileStripeInfo {
  const stripes: StripeExtent[] = osts.map((ost, i) => ({
    start: i,
    end: i,
    ost,
    mirror: 0,
  }));
  return {
    path,
    size,
    layout: {
      type: "raid0",
      stripe_count: Math.max(1, osts.length),
      stripe_size: 1048576,
      pool: null,
    },
    stripes,
    raw: null,
  };
}

describe("buildTree", () => {
  it("rolls files up through every directory ancestor, including the root", () => {
    const f1 = file("/data/a/x", 100, [0]);
    const f2 = file("/data/a/y", 200, [0, 1]);
    const f3 = file("/data/b/z", 50, [1]);
    const nodes = buildTree("/data", [f1, f2, f3]);
    const byPath = new Map(nodes.map((n) => [n.path, n]));

    const root = byPath.get("");
    expect(root).toBeDefined();
    expect(root?.files).toBe(3);
    expect(root?.bytes).toBe(350);
    expect(root?.stripes).toBe(4);
    expect(root?.ostCount).toEqual({ 0: 2, 1: 2 });

    const a = byPath.get("a");
    expect(a).toBeDefined();
    expect(a?.files).toBe(2);
    expect(a?.bytes).toBe(300);
    expect(a?.name).toBe("a");

    const b = byPath.get("b");
    expect(b?.files).toBe(1);
    expect(b?.bytes).toBe(50);
  });

  it("normalizes demo-style paths that omit the root prefix", () => {
    const trees = buildTree("/lustre", [file("/simulations/big", 10, [0])]);
    expect(trees.map((n) => n.path).sort()).toEqual(["", "simulations"]);
    const root = trees.find((n: TreeNode) => n.path === "")!;
    expect(root.files).toBe(1);
    expect(root.bytes).toBe(10);
  });

  it("counts unplaced stripes (ost -1) in totals but not OST tallies", () => {
    const nodes = buildTree("/data", [file("/data/f", 10, [-1])]);
    expect(nodes.map((n) => n.path)).toEqual([""]);
    expect(nodes[0].stripes).toBe(1);
    expect(nodes[0].ostCount).toEqual({});
  });

  it("tracks depth for indentation", () => {
    const nodes = buildTree("/data", [file("/data/a/b/c", 1, [0])]);
    const depths = new Map(nodes.map((n) => [n.path, n.depth]));
    expect(depths.get("")).toBe(0);
    expect(depths.get("a")).toBe(1);
    expect(depths.get("a/b")).toBe(2);
  });
});

describe("topOsts", () => {
  it("returns tallies sorted by count, descending, up to the limit", () => {
    const nodes = buildTree("/data", [
      file("/data/f", 1, [3, 3, 1, 2, 2, 2, 0]),
    ]);
    expect(topOsts(nodes[0], 3)).toEqual([
      { ost: 2, count: 3 },
      { ost: 3, count: 2 },
      { ost: 0, count: 1 },
    ]);
  });
});
