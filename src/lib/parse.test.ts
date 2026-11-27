import { describe, expect, it } from "vitest";
import { parseGetstripeYaml, parseLegacyOutput } from "./parse";

const RAID0_YAML = `
lmm_stripe_count: 2
lmm_stripe_size: 1M
lmm_pool_name: fastpool
stripe_count: 2 | 2
stripe_size: 1M | 1M
stripe_offset: 25
stripe_offset: 31
`;

const PFL_YAML = `
lmm_stripe_count: 1
lmm_stripe_size: 1M
layout_variant: progressive
components:
  - 0: { start_extent: 0, end_extent: 1, stripe_count: 1, stripe_size: 1M, stripe_offset: 4 }
  - 0: { start_extent: 1, end_extent: -1, stripe_count: 4, stripe_size: 4M, stripe_offset: 9 }
`;

const MIRROR_YAML = `
lmm_stripe_count: 1
lmm_stripe_size: 1M
layout_variant: mirrored
mirror_count: 2
components:
  - 0: { mirror_id: 0, stripe_count: 1, stripe_size: 1M, stripe_offset: -1 }
  - 0: { mirror_id: 1, stripe_count: 1, stripe_size: 1M, stripe_offset: 9 }
`;

const LEGACY_PLAIN = `
ost>0: oid=1 idx=0
ost>1: oid=1 idx=1
`;

describe("parseGetstripeYaml", () => {
  it("parses plain raid0 layout with two stripes", () => {
    const info = parseGetstripeYaml(RAID0_YAML)!;
    expect(info.layout).toEqual({
      type: "raid0",
      stripe_count: 2,
      stripe_size: 1048576,
      pool: "fastpool",
    });
    expect(info.stripes.map((s) => s.ost)).toEqual([25, 31]);
    expect(info.stripes.map((s) => s.start)).toEqual([0, 1]);
  });

  it("parses PFL components including the open-ended tail", () => {
    const info = parseGetstripeYaml(PFL_YAML)!;
    expect(info.stripes).toHaveLength(2);
    expect(info.stripes[0]).toMatchObject({
      start: 0,
      end: 1,
      ost: 4,
      mirror: -1,
    });
    expect(info.stripes[1]).toMatchObject({ start: 1, ost: 9, mirror: -1 });
    expect(info.stripes[1].end).toBeGreaterThan(1_000_000);
  });

  it("keeps unplaced (stripe_offset -1) mirrored components", () => {
    const info = parseGetstripeYaml(MIRROR_YAML)!;
    expect(info.layout.type).toBe("raid1");
    expect(info.stripes).toHaveLength(2);
    expect(info.stripes[0]).toMatchObject({ ost: -1, mirror: 0 });
    expect(info.stripes[1]).toMatchObject({ ost: 9, mirror: 1 });
  });

  it("returns null for empty input", () => {
    expect(parseGetstripeYaml("")).toBeNull();
    expect(parseGetstripeYaml("# just a comment\n")).toBeNull();
  });
});

const RAID0_TOPLEVEL = `
lmm_stripe_count: 2
lmm_stripe_size: 1M
lmm_pool_name: lustre
stripe_count: 2 | 2
stripe_size: 1M | 1M
stripe_offset: 0
stripe_offset: 1
`;

const RAID0_WIDE = `
lmm_stripe_count: 2
lmm_stripe_size: 1048576
lmm_pool_name: lustre
stripe_count: 2
stripe_size: 1048576
stripe_offset: 2,1
`;

const RAID0_INDENTED = `
lmm_stripe_count: 2
lmm_stripe_size: 4M
lmm_pool_name: lustre
  stripe_count: 2
  stripe_size: 4M
  stripe_offset: 5
`;

type Component = [start: number, end: number, ost: number, mirror: number];

function expectStripes(
  info: ReturnType<typeof parseGetstripeYaml> | null,
  expected: Component[],
): void {
  expect(info).not.toBeNull();
  const got = info!.stripes.map(
    (s) => [s.start, s.end, s.ost, s.mirror] as Component,
  );
  expect(got).toEqual(expected);
}

const REAL_CLUSTER_DIR = `
stripe_count:  2
stripe_size:   4194304
pattern:       raid0
stripe_offset: -1
lmm_stripe_count:  2
lmm_stripe_size:   4194304
lmm_pattern:       raid0
lmm_layout_gen:    0
lmm_stripe_offset: 1
lmm_objects:
      - l_ost_idx: 1
        l_fid:     0x280000400:0x3:0x0
      - l_ost_idx: 0
        l_fid:     0x240000400:0x4:0x0
`;

const UNPLACED_FILE = `
stripe_count:  1
stripe_size:   4194304
pattern:       raid0
stripe_offset: -1
lmm_stripe_count:  1
lmm_stripe_size:   4194304
lmm_pattern:       raid0
lmm_layout_gen:    0
lmm_stripe_offset: -1
`;

const REAL_CLUSTER_FILE = `
lmm_stripe_count:  2
lmm_stripe_size:   4194304
lmm_pattern:       raid0
lmm_layout_gen:    0
lmm_stripe_offset: 1
lmm_objects:
      - l_ost_idx: 1
        l_fid:     0x280000400:0x3:0x0
      - l_ost_idx: 0
        l_fid:     0x240000400:0x4:0x0
`;

describe("real cluster getstripe --yaml output", () => {
  it("parses raid0 with stripe_offset at top level (no components nesting)", () => {
    expectStripes(parseGetstripeYaml(RAID0_TOPLEVEL), [
      [0, 1, 0, -1],
      [1, 2, 1, -1],
    ]);
  });

  it("parses raid0 with wide (single-line) stripe_offset", () => {
    expectStripes(parseGetstripeYaml(RAID0_WIDE), [
      [0, 1, 2, -1],
      [1, 2, 1, -1],
    ]);
  });

  it("parses raid0 with stripe_offset indented under lmm keys", () => {
    expectStripes(parseGetstripeYaml(RAID0_INDENTED), [[0, 1, 5, -1]]);
  });

  it("parses raid0 with lmm_objects (verbatim real-cluster directory output)", () => {
    expectStripes(parseGetstripeYaml(REAL_CLUSTER_DIR), [
      [0, 1, 1, -1],
      [1, 2, 0, -1],
    ]);
  });

  it("reports one unplaced stripe for a never-written file (stripe_offset -1 only)", () => {
    expectStripes(parseGetstripeYaml(UNPLACED_FILE), [[0, 1, -1, -1]]);
  });

  it("parses lmm_objects from file-shaped output with no top-level scalars", () => {
    expectStripes(parseGetstripeYaml(REAL_CLUSTER_FILE), [
      [0, 1, 1, -1],
      [1, 2, 0, -1],
    ]);
  });

  it("drops the phantom unplaced row when real lmm_objects exist (directory shape regression)", () => {
    for (const raw of [REAL_CLUSTER_DIR, REAL_CLUSTER_FILE]) {
      const info = parseGetstripeYaml(raw)!;
      info.stripes.every((s) => expect(s.ost).toBeGreaterThanOrEqual(0));
      expect(info.stripes.map((s) => s.ost)).toEqual([1, 0]);
    }
  });
});

describe("parseLegacyOutput", () => {
  it("parses legacy ost>N rows", () => {
    const info = parseLegacyOutput(LEGACY_PLAIN);
    expect(info.stripes.map((s) => s.ost)).toEqual([0, 1]);
  });
});
