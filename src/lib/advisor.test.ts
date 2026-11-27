import { describe, expect, it } from "vitest";
import { adviseFile, adviceSummary, collectAdvice } from "./advisor";
import type { FileStripeInfo } from "./types";

function f(path: string, size: number, layout: FileStripeInfo["layout"], stripes: FileStripeInfo["stripes"] = []): FileStripeInfo {
  return { path, size, layout, stripes, raw: null };
}

describe("striping advisor", () => {
  it("flags a file smaller than one stripe on a wide raid0", () => {
    const a = adviseFile(f("tiny", 500_000, { type: "raid0", stripe_count: 4, stripe_size: 1024 ** 2, pool: null }));
    expect(a?.kind).toBe("overstriped-tiny");
    expect(a!.label).toBe("overstriped");
  });

  it("flags a placed raid0 file that uses fewer stripes than the count", () => {
    // 1.5 MiB file, 4-way stripes → stripes 0,1 used, stripes 2,3 never touched.
    const file = f("partial", 1_500_000, { type: "raid0", stripe_count: 4, stripe_size: 1024 ** 2, pool: null }, [
      { start: 0, end: 1_048_576, ost: 0, mirror: 0 },
      { start: 1_048_576, end: 1_500_000, ost: 1, mirror: 0 },
    ]);
    const a = adviseFile(file);
    expect(a?.kind).toBe("overstriped-small");
    // Command keeps a unit of headroom: 3 stripes used+headroom → count 3.
    expect(a!.command).toContain("--stripe-count 3");
    expect(a!.command).toContain("--stripe-size 1M");
  });

  it("clears a file that fills all of its stripes", () => {
    const just = 8 * 1024 ** 2;
    const a = adviseFile(f("exact", just, { type: "raid0", stripe_count: 4, stripe_size: 1024 ** 2, pool: null }, []));
    expect(a).toBeNull();
  });

  it("tolerates one partial trailing stripe", () => {
    const file = f("tail", 12_600_000, { type: "raid0", stripe_count: 4, stripe_size: 1024 ** 2 * 4, pool: null }, []);
    expect(adviseFile(file)).toBeNull();
  });

  it("flags sub-MiB files that only occupy one stripe regardless of count", () => {
    const a = adviseFile(f("small", 500_000, { type: "raid0", stripe_count: 2, stripe_size: 1024 ** 2, pool: null }, []));
    expect(a?.kind).toBe("overstriped-tiny");
    // Unplaced files get layout notes, not migrate commands.
    expect(a!.command).toBeNull();
  });

  it("flags very wide mirrors on tiny files", () => {
    const a = adviseFile(f("mirrory", 200_000, { type: "raid1", mirror_count: 8, sub_overrides: [] }, [
      { start: 0, end: 200_000, ost: 0, mirror: 0 },
    ]));
    expect(a?.kind).toBe("wide-mirrors");
    expect(a!.command).toContain("--mirror-count 2");
  });

  it("flags a large file pinned to a single OST", () => {
    const file = f("hot", 10 * 1024 ** 3, { type: "raid0", stripe_count: 1, stripe_size: 1024 ** 2, pool: null }, [
      { start: 0, end: 10 * 1024 ** 3, ost: 3, mirror: 0 },
    ]);
    const a = adviseFile(file);
    expect(a?.kind).toBe("hot-single-ost");
    expect(a!.detail).toBe("10 GiB pinned to OST 3");
    expect(a!.command).toContain("--stripe-count 2");
  });

  it("clears single-OST files that are not large", () => {
    const file = f("ok", 1024 ** 2, { type: "raid0", stripe_count: 1, stripe_size: 1024 ** 2, pool: null }, [
      { start: 0, end: 1024 ** 2, ost: 0, mirror: 0 },
    ]);
    expect(adviseFile(file)).toBeNull();
  });

  it("ignores unplaced files for hot-single-ost", () => {
    const file = f("unplaced", 10 * 1024 ** 3, { type: "raid0", stripe_count: 1, stripe_size: 1024 ** 2, pool: null }, [
      { start: 0, end: 10 * 1024 ** 3, ost: -1, mirror: 0 },
    ]);
    expect(adviseFile(file)).toBeNull();
  });

  it("summarizes and collects advice", () => {
    const files = [
      f("a", 500_000, { type: "raid0", stripe_count: 4, stripe_size: 1024 ** 2, pool: null }),
      f("b", 200_000, { type: "raid1", mirror_count: 8, sub_overrides: [] }, [{ start: 0, end: 200_000, ost: 1, mirror: 0 }]),
      f("c", 1024 ** 2, { type: "raid0", stripe_count: 1, stripe_size: 1024 ** 2, pool: null }, [{ start: 0, end: 1024 ** 2, ost: 0, mirror: 0 }]),
    ];
    const got = collectAdvice(files);
    expect(got).toHaveLength(2);
    const s = adviceSummary(got);
    const map = Object.fromEntries(s.map((r) => [r.label, r.count]));
    expect(map["overstriped (< 1 stripe)"]).toBe(1);
    expect(map["wide mirrors"]).toBe(1);
  });
});
