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
    expect(info.layout).toEqual({ type: "raid0", stripe_count: 2, stripe_size: 1048576, pool: "fastpool" });
    expect(info.stripes.map((s) => s.ost)).toEqual([25, 31]);
    expect(info.stripes.map((s) => s.start)).toEqual([0, 1]);
  });

  it("parses PFL components including the open-ended tail", () => {
    const info = parseGetstripeYaml(PFL_YAML)!;
    expect(info.stripes).toHaveLength(2);
    expect(info.stripes[0]).toMatchObject({ start: 0, end: 1, ost: 4, mirror: -1 });
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

describe("parseLegacyOutput", () => {
  it("parses legacy ost>N rows", () => {
    const info = parseLegacyOutput(LEGACY_PLAIN);
    expect(info.stripes.map((s) => s.ost)).toEqual([0, 1]);
  });
});
