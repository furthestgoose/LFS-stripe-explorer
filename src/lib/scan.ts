import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { lfs } from "./lfs";
import { parseGetstripeYaml } from "./parse";
import type {
  FileStripeInfo,
  OSTStatisticalProfile,
  ScanResult,
  ScanStats,
  ScanStatsExtra,
  ScanError,
} from "./types";

interface OstTally {
  components: number;
  weightedBytes: number;
  files: Set<string>;
}

const MAX_FILES = 200_000;
const MAX_DEPTH = 24;
const LFS_CONCURRENCY = 24;

export async function scanDirectory(root: string): Promise<ScanResult> {
  const started = Date.now();
  const files: FileStripeInfo[] = [];
  const errors: ScanError[] = [];

  const { files: walked, dirCount } = await collectFiles(root);
  for (let i = 0; i < walked.length; i += LFS_CONCURRENCY) {
    const batch = walked.slice(i, i + LFS_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (wf) => {
        const path = wf.path;
        try {
          const res = await lfs(["getstripe", "--yaml", path], 30_000);
          if (res.code !== 0) {
            return {
              path,
              size: wf.size,
              info: null,
              raw: res.stdout,
              err: res.stderr.slice(0, 500),
            };
          }
          const info = parseGetstripeYaml(res.stdout);
          return { path, size: wf.size, info, raw: res.stdout, err: null };
        } catch (err) {
          return {
            path,
            size: wf.size,
            info: null,
            raw: null,
            err: String(err),
          };
        }
      }),
    );
    for (const item of settled) {
      if (item.err || !item.info) {
        errors.push({ file: item.path, error: item.err ?? "unparseable" });
        continue;
      }
      files.push({
        path: item.path,
        size: item.size,
        layout: item.info.layout,
        stripes: item.info.stripes,
        raw: item.raw,
      });
    }
  }

  return finalizeScan(
    root,
    files,
    errors,
    dirCount,
    Date.now() - started,
    "live",
  );
}

interface WalkedFile {
  path: string;
  size: number;
}

async function collectFiles(
  root: string,
): Promise<{ files: WalkedFile[]; dirCount: number }> {
  const out: WalkedFile[] = [];
  const queue: Array<{ path: string; depth: number }> = [
    { path: root, depth: 0 },
  ];
  let dirCount = 0;
  while (queue.length && out.length < MAX_FILES) {
    const { path, depth } = queue.shift()!;
    if (depth > MAX_DEPTH) continue;
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) {
        dirCount += 1;
        queue.push({ path: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        out.push({ path: full, size: 0 });
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  for (let i = 0; i < out.length; i += 512) {
    await Promise.all(
      out.slice(i, i + 512).map(async (f) => {
        try {
          const st = await stat(f.path);
          f.size = st.size;
        } catch {}
      }),
    );
  }
  return { files: out, dirCount };
}

export function finalizeScan(
  root: string,
  files: FileStripeInfo[],
  errors: ScanError[],
  _dirs: number,
  elapsedMs: number,
  source: ScanResult["source"],
): ScanResult {
  const dirsSeen = new Set<string>();
  for (const file of files) {
    const parent = file.path.slice(0, file.path.lastIndexOf("/")) || "/";
    dirsSeen.add(parent);
  }

  const tallies = new Map<number, OstTally>();
  let totalSize = 0;
  let totalStripes = 0;
  let unplacedStripes = 0;
  const layouts: Record<string, number> = {};
  const countSpread = new Map<number, number[]>();
  const byteDistributions: Array<{
    mirror: number;
    ost: number;
    bytes: number[];
    count: number;
  }> = [];

  const sizeByPath = new Map<string, number>();
  for (const file of files) {
    let size = file.size;
    if (!size) {
      size = sizeByPath.get(file.path) ?? file.size;
    }
    file.size = size;
    totalSize += size;
    const key = layoutKey(file.layout);
    layouts[key] = (layouts[key] ?? 0) + 1;
    totalStripes += file.stripes.length;

    const perMirrorOst = new Map<
      string,
      { ost: number; count: number; bytes: number }
    >();
    for (const stripe of file.stripes) {
      if (stripe.ost < 0) {
        unplacedStripes += 1;
        continue;
      }
      let tally = tallies.get(stripe.ost);
      if (!tally) {
        tally = { components: 0, weightedBytes: 0, files: new Set() };
        tallies.set(stripe.ost, tally);
      }
      const placed = Math.max(1, stripe.end - stripe.start);
      tally.components += placed;
      tally.files.add(file.path);
      const perKey = `${stripe.mirror}:${stripe.ost}`;
      const prev = perMirrorOst.get(perKey);
      perMirrorOst.set(perKey, {
        ost: stripe.ost,
        count: (prev?.count ?? 0) + placed,
        bytes: (prev?.bytes ?? 0) + placed * stripeSizeOf(file),
      });
    }
    for (const entry of perMirrorOst.values()) {
      let dist = byteDistributions.find(
        (d) => d.ost === entry.ost && d.mirror === -1,
      );
      if (!dist) {
        dist = { mirror: -1, ost: entry.ost, bytes: [], count: 0 };
        byteDistributions.push(dist);
      }
      dist.bytes.push(entry.bytes);
      dist.count += 1;
    }
    for (const stripe of file.stripes) {
      if (stripe.ost < 0) continue;
      let spread = countSpread.get(stripe.ost);
      if (!spread) {
        spread = [];
        countSpread.set(stripe.ost, spread);
      }
      spread.push(Math.max(1, stripe.end - stripe.start));
    }
  }

  return {
    root,
    files,
    errors,
    source,
    ostNames: {},
    byteDistributions,
    statsExtra: buildStatsExtra(layouts, files),
    ostProfile: buildOstProfile(tallies, countSpread),
    stats: buildStats(
      files,
      tallies,
      totalSize,
      totalStripes,
      unplacedStripes,
      elapsedMs,
      layouts,
    ),
  };
}

function layoutKey(layout: FileStripeInfo["layout"]): string {
  if (layout.type === "raid0") {
    return `raid0 count=${layout.stripe_count} size=${formatStripeSize(layout.stripe_size)}`;
  }
  if (layout.type === "raid1") {
    return `raid1 mirrors=${layout.mirror_count}`;
  }
  return layout.type;
}

function formatStripeSize(bytes: number): string {
  if (!bytes) return "default";
  if (bytes % 1024 ** 3 === 0) return `${bytes / 1024 ** 3}G`;
  if (bytes % 1024 ** 2 === 0) return `${bytes / 1024 ** 2}M`;
  if (bytes % 1024 === 0) return `${bytes / 1024}K`;
  return String(bytes);
}

function stripeSizeOf(file: FileStripeInfo): number {
  if (file.layout.type === "raid0") return file.layout.stripe_size || 1048576;
  if (file.layout.type === "raid1" && file.layout.sub_overrides.length) {
    const first = file.layout.sub_overrides[0];
    return first.stripe_size > 0 ? first.stripe_size : 1048576;
  }
  return 1048576;
}

function buildStats(
  files: FileStripeInfo[],
  tallies: Map<number, OstTally>,
  totalSize: number,
  totalStripes: number,
  unplacedStripes: number,
  elapsedMs: number,
  layouts: Record<string, number>,
): ScanStats {
  const ostIndices = [...tallies.keys()].sort((a, b) => a - b);
  const counts = ostIndices.map((idx) => tallies.get(idx)?.components ?? 0);
  const minPerOST = counts.length ? Math.min(...counts) : 0;
  const maxPerOST = counts.length ? Math.max(...counts) : 0;
  const mean = counts.length
    ? counts.reduce((a, b) => a + b, 0) / counts.length
    : 0;
  const stdDev = Math.sqrt(
    counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / (counts.length || 1),
  );
  const meanFileSize = files.length ? totalSize / files.length : 0;
  const meanStripeSize = files.length
    ? files.reduce((acc, f) => acc + stripeSizeOf(f), 0) / files.length
    : 0;
  return {
    files: files.length,
    dirs: 0,
    totalSize,
    totalStripes,
    ostCount: tallies.size,
    minPerOST,
    maxPerOST,
    stdevPerOST: stdDev,
    balancePct: mean > 0 ? Math.round(((mean - stdDev) / mean) * 1000) / 10 : 0,
    meanStripeSize,
    meanFileSize,
    layouts,
    elapsedMs,
  };
}

function buildOstProfile(
  tallies: Map<number, OstTally>,
  countSpread: Map<number, number[]>,
): OSTStatisticalProfile {
  const indices = [...tallies.keys()].sort((a, b) => a - b);
  const bytesList = indices.map((idx) => tallies.get(idx)?.weightedBytes ?? 0);
  const perOST = indices.map((idx, i) => {
    const tally = tallies.get(idx);
    return {
      index: idx,
      n: tally?.files.size ?? 0,
      countPerFile: tally
        ? tally.files.size
          ? tally.components / tally.files.size
          : 0
        : 0,
      weightedBytes: bytesList[i],
      countBytes: tally?.components ?? 0,
    };
  });

  const n = perOST.length;
  let correlation = 0;
  let slope = 0;
  if (n > 1) {
    const meanCount = perOST.reduce((acc, r) => acc + r.countBytes, 0) / n;
    const meanBytes = bytesList.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let varCount = 0;
    let varBytes = 0;
    for (let i = 0; i < n; i++) {
      cov += (perOST[i].countBytes - meanCount) * (bytesList[i] - meanBytes);
      varCount += (perOST[i].countBytes - meanCount) ** 2;
      varBytes += (bytesList[i] - meanBytes) ** 2;
    }
    correlation =
      varCount > 0 && varBytes > 0 ? cov / Math.sqrt(varCount * varBytes) : 0;
    slope = varCount > 0 ? cov / varCount : 0;
  }

  const sorted = [...perOST.map((r) => r.countBytes)].sort((a, b) => a - b);
  let gini = 0;
  if (n > 0 && sorted[n - 1] > 0) {
    const total = sorted.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      gini += (2 * (i + 1) - n - 1) * sorted[i];
    }
    gini = gini / (n * total);
  }

  const mean = n ? sorted.reduce((a, b) => a + b, 0) / n : 0;
  const cv = mean > 0 ? stdDevOf(sorted) / mean : 0;

  return {
    perOST,
    countSpread: indices.map((idx) => ({
      ost: idx,
      counts: countSpread.get(idx) ?? [],
    })),
    countVsBytesCorrelation: correlation,
    countVsBytesSlope: slope,
    countGini: gini,
    countCV: cv,
  };
}

function stdDevOf(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length,
  );
}

function buildStatsExtra(
  layouts: Record<string, number>,
  files: FileStripeInfo[],
): ScanStatsExtra {
  const depthHistogram: Array<{ depth: number; value: number }> = [];
  const stripeSizeHistogram: Array<{ bucket: string; value: number }> = [];
  const fileHistogram: Array<{
    min: string;
    max: string;
    value: number;
    label: string;
  }> = [];
  const layoutHistogram = Object.entries(layouts)
    .map(([layout, value]) => ({ layout, value }))
    .sort((a, b) => b.value - a.value);

  const sizeBuckets = [
    { min: 0, max: 1024 ** 2, label: "< 1 MiB" },
    { min: 1024 ** 2, max: 1024 ** 3, label: "1 MiB - 1 GiB" },
    { min: 1024 ** 3, max: 1024 ** 4, label: "1 GiB - 16 GiB" },
    { min: 1024 ** 4, max: Number.MAX_SAFE_INTEGER, label: "> 16 GiB" },
  ];
  for (const bucket of sizeBuckets)
    fileHistogram.push({
      min: String(bucket.min),
      max: String(bucket.max),
      value: 0,
      label: bucket.label,
    });
  const depthCounts = new Map<number, number>();
  const stripeSizes = new Map<string, number>();
  const topDirs = new Map<
    string,
    { dir: string; size: number; files: number }
  >();
  for (const file of files) {
    const depth = file.path.split("/").filter(Boolean).length;
    depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);
    const sizeKey = formatStripeSize(stripeSizeOf(file));
    stripeSizes.set(sizeKey, (stripeSizes.get(sizeKey) ?? 0) + 1);
    const bucket = fileHistogram.find(
      (b) => Number(b.min) <= file.size && file.size < Number(b.max),
    );
    if (bucket) bucket.value += 1;
    const parent = file.path.slice(0, file.path.lastIndexOf("/")) || "/";
    const agg = topDirs.get(parent) ?? { dir: parent, size: 0, files: 0 };
    agg.size += file.size;
    agg.files += 1;
    topDirs.set(parent, agg);
  }
  for (const [depth, value] of [...depthCounts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    depthHistogram.push({ depth, value });
  }
  for (const [bucket, value] of [...stripeSizes.entries()].sort(
    (a, b) => bucketOrder(a[0]) - bucketOrder(b[0]),
  )) {
    stripeSizeHistogram.push({ bucket, value });
  }
  return {
    depthHistogram,
    stripeSizeHistogram,
    fileHistogram,
    layoutHistogram,
    topDirs: [...topDirs.values()].sort((a, b) => b.size - a.size).slice(0, 20),
  };
}

function bucketOrder(label: string): number {
  const match = label.match(/^([\d.]+)([KMGT]?)/);
  if (!match) return 0;
  const mult: Record<string, number> = { K: 1, M: 2, G: 3, T: 4, "": 0 };
  return Number(match[1]) * 10 + (mult[match[2]] ?? 0);
}
