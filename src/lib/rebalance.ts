import type { FileStripeInfo, OSTDiskSpace, ScanResult } from "./types";

export interface RebalanceSuggestion {
  index: number;
  label: string;
  files: Array<{ path: string; command: string }>;
}

const MAX_FILES_PER_OST = 8;

/**
 * Identifies the hottest OST and suggests `lfs migrate` commands that restripe
 * its heaviest scanned files toward the coolest OST. Capacity data (`lfs df`)
 * ranks OSTs by real fullness when present; scanned bytes are the fallback.
 * Pure client-side derivation — no extra lfs calls.
 */
export function buildRebalanceSuggestions(result: ScanResult): RebalanceSuggestion[] {
  if (!result.files.length) return [];
  const space = new Map<number, OSTDiskSpace>();
  for (const s of result.ostSpace ?? []) space.set(s.index, s);

  const scanned = new Map<number, number>();
  const indices = new Set<number>();
  for (const f of result.files) {
    for (const s of f.stripes) {
      if (s.ost < 0) continue;
      indices.add(s.ost);
      scanned.set(s.ost, (scanned.get(s.ost) ?? 0) + f.size);
    }
  }
  if (indices.size < 2) return [];

  const ranked = [...indices].sort((a, b) => {
    const key = (idx: number) => {
      const cap = space.get(idx);
      // Real capacity dominates when known (3x weight), then scanned bytes.
      const capScore = cap ? cap.usePct * 3 : 0;
      const fileScore = scanned.get(idx) ?? 0;
      return capScore + fileScore / 1024 ** 2;
    };
    return key(b) - key(a);
  });
  const hottest = ranked[0];
  const coolest = ranked[ranked.length - 1];
  if (hottest === coolest) return [];

  const hotScanned = scanned.get(hottest) ?? 0;
  const coolScanned = scanned.get(coolest) ?? 0;
  const hotUsePct = space.get(hottest)?.usePct;
  const coolUsePct = space.get(coolest)?.usePct;
  // With live capacity data, trust only a real fullness gap; scanned-bytes skew
  // alone is not enough because the "cool" OST may be nearly full in practice.
  const haveCapacity = space.size >= 2 && hotUsePct !== undefined && coolUsePct !== undefined;
  const bytesSkewed = hotScanned > coolScanned * 1.25;
  const capacitySkewed =
    hotUsePct !== undefined && coolUsePct !== undefined && hotUsePct > coolUsePct + 5;
  if (haveCapacity ? !capacitySkewed : !bytesSkewed) return [];

  const label = space.get(hottest)?.name ?? `OST ${hottest}`;
  const candidates = result.files
    .filter((f) => f.stripes.some((s) => s.ost === hottest))
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_FILES_PER_OST);

  const files = candidates.map((f) => ({
    path: f.path,
    command: migrateCommand(f, coolest),
  }));
  if (!files.length) return [];
  const summary =
    hotUsePct !== undefined
      ? `${label} is ${hotUsePct}% full (coolest: ${coolUsePct ?? "n/a"}%). Restripe the largest files:`
      : `${label} holds ${formatBytes(hotScanned)} of scanned data vs ${formatBytes(coolScanned)} on the coolest OST. Restripe the largest files:`;
  return [{ index: hottest, label: summary, files }];
}

function migrateCommand(file: FileStripeInfo, targetOst: number): string {
  const l = file.layout;
  if (l.type === "raid0" && l.stripe_count > 0 && l.stripe_size > 0) {
    const count = Math.max(1, l.stripe_count);
    // Sizes that are not whole MiBs fall back to a safe 1M stripe size.
    const sizeM = l.stripe_size % (1024 ** 2) === 0 ? l.stripe_size / 1024 ** 2 : null;
    const sizeFlag = sizeM != null ? `--stripe-size ${sizeM}M` : "--stripe-size 1M";
    return `lfs migrate ${sizeFlag} --stripe-count ${count} --stripe-index ${targetOst} '${file.path}'`;
  }
  return `lfs migrate --stripe-index ${targetOst} '${file.path}'`;
}

export function formatBytes(n: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
}

export function pct(n: number): number {
  return Math.round(n * 10) / 10;
}
