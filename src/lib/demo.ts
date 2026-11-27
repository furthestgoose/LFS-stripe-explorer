import type { FileStripeInfo, Layout, ScanResult, StripeExtent } from "./types";
import { finalizeScan } from "./scan";

export const OST_NAME_COUNT = 8;
const OST_NAMES = ["oss1-ost0", "oss1-ost1", "oss2-ost2", "oss2-ost3", "oss3-ost4", "oss3-ost5", "oss4-ost6", "oss4-ost7"];

export function demoScan(): ScanResult {
  const dirs = ["", "/simulations", "/simulations/run-42", "/simulations/run-43", "/datasets/baseline", "/scratch"];
  const files: FileStripeInfo[] = [];
  let seed = 0xac3f19d0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 240; i++) {
    let dir = dirs[Math.floor(rand() * dirs.length)];
    if (dir === "") dir = "";
    const name = `file-${String(i).padStart(4, "0")}.nc`;
    const path = `${dir}/${name}`.replace("//", "/");
    const layout = pickLayout(rand);
    const size = Math.floor(rand() * 48 * 1024 ** 3) + 1024 ** 2;
    files.push({
      path,
      size,
      layout,
      stripes: expandStripes(layout, size / 1024 ** 2, rand),
      raw: demoYaml(layout),
    });
  }
  const result = finalizeScan("/lustre/demo", files, [], dirs.length, 0, "simulated");
  // Simulated capacity: 8 OSTs of 4 GiB with usage skewed to match the layout bias.
  result.ostSpace = OST_NAMES.map((name, i) => {
    const totalK = 4 * 1024 * 1024;
    const usedK = Math.round(totalK * (0.05 + ((i * 37) % 90) / 100) * (i === 0 ? 1.8 : 1));
    return {
      index: i,
      name,
      totalK,
      usedK,
      freeK: totalK - usedK,
      usePct: Math.round((usedK / totalK) * 100),
      inodesTotal: 100_000 + i,
      inodesUsed: Math.round(usedK / 4096),
    };
  });
  for (let i = 0; i < OST_NAME_COUNT; i++) {
    result.ostNames[i] = OST_NAMES[i];
  }
  return result;
}

function pickLayout(rand: () => number): Layout {
  const roll = rand();
  if (roll < 0.08) {
    return { type: "raid1", mirror_count: rand() < 0.5 ? 2 : 3, sub_overrides: [{ start: 0, end: -1, stripe_count: 2, stripe_size: 1048576, pool: null }] };
  }
  if (roll >= 0.08 && roll < 0.16) {
    return {
      type: "raid1",
      mirror_count: 2,
      sub_overrides: [
        { start: 0, end: 1024, stripe_count: 1, stripe_size: 1048576, pool: null },
        { start: 1024, end: -1, stripe_count: 4, stripe_size: 4194304, pool: null },
      ],
    };
  }
  const count = rand() < 0.3 ? 8 : rand() < 0.7 ? 4 : 16;
  return { type: "raid0", stripe_count: count, pool: null, stripe_size: [1048576, 4194304, 16777216][Math.floor(rand() * 3)] % 2 === 0 ? 1048576 : 4194304 };
}

/** Expands a layout into concrete stripes with a deterministic bias to OST 0-3. */
function expandStripes(layout: Layout, chunksApprox: number, rand: () => number): StripeExtent[] {
  const stripes: StripeExtent[] = [];
  if (layout.type === "raid0") {
    let ost = Math.floor(rand() * OST_NAMES.length);
    const placed = Math.min(layout.stripe_count, Math.max(1, Math.round(chunksApprox)));
    for (let i = 0; i < placed; i++) {
      stripes.push({ start: i, end: i + 1, ost, mirror: -1 });
      // biased rotation: tends to drift slowly upward, keeps imbalance
      ost = (ost + 1 + (rand() < 0.35 ? 1 : 0)) % OST_NAMES.length;
    }
    return stripes;
  }
  if (layout.type === "raid1") {
    const mirrorCount = layout.mirror_count;
    for (let m = 0; m < mirrorCount; m++) {
      const ost = Math.floor(rand() * OST_NAME_COUNT);
      for (const o of layout.sub_overrides) {
        const start = o.start;
        const placed = o.stripe_count > 0 ? o.stripe_count : 8;
        for (let i = start; i < start + placed; i++) {
          stripes.push({ start: i, end: i + 1, ost, mirror: m });
        }
      }
    }
    return stripes;
  }
  return stripes;
}

function demoYaml(layout: Layout): string {
  if (layout.type === "raid0") {
    return `lmm_stripe_count: ${layout.stripe_count}\nlmm_stripe_size: ${layout.stripe_size}`;
  }
  if (layout.type !== "raid1") return "";
  return `lmm_stripe_count: 1\nlayout_variant: raid1\nmirror_count: ${layout.mirror_count}`;
}
