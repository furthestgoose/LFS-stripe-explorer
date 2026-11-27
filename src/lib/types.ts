export type Layout =
  | { type: "raid0"; stripe_count: number; stripe_size: number; pool: string | null }
  | { type: "raid1"; mirror_count: number; sub_overrides: Array<{ start: number; end: number; stripe_count: number; stripe_size: number; pool: string | null }> }
  | { type: "raid6" | "raid10"; stripe_count: number; stripe_size: number; pool: string | null; parity?: number };

export interface StripeExtent {
  start: number;
  end: number;
  ost: number;
  mirror: number;
}

export interface FileStripeInfo {
  path: string;
  size: number;
  layout: Layout;
  stripes: StripeExtent[];
  raw: string | null;
}

export interface OSTSummary {
  /** Raw OST index */
  index: number;
  name: string | null;
  stripeCount: number;
  weightedBytes: number;
  files: number;
}

export interface ScanStats {
  files: number;
  dirs: number;
  totalSize: number;
  totalStripes: number;
  ostCount: number;
  minPerOST: number;
  maxPerOST: number;
  stdevPerOST: number;
  balancePct: number;
  meanStripeSize: number;
  meanFileSize: number;
  layouts: Record<string, number>;
  elapsedMs: number;
}

export interface OSTStatisticalProfile {
  perOST: Array<{ index: number; n: number; countPerFile: number; weightedBytes: number; countBytes: number }>;
  countSpread: Array<{ ost: number; counts: number[] }>;
  countVsBytesCorrelation: number;
  countVsBytesSlope: number;
  countGini: number;
  countCV: number;
}

/** Capacity snapshot for one OST, parsed from `lfs df` / `lfs df -i` (units: KiB). */
export interface OSTDiskSpace {
  index: number;
  name: string;
  totalK: number;
  usedK: number;
  freeK: number;
  usePct: number;
  inodesTotal: number | null;
  inodesUsed: number | null;
}

export interface ScanResult {
  root: string;
  stats: ScanStats;
  statsExtra: ScanStatsExtra;
  ostProfile: OSTStatisticalProfile;
  files: FileStripeInfo[];
  errors: ScanError[];
  ostNames: Record<number, string>;
  /** Capacity per OST from `lfs df` (absent when lfs df is unavailable). */
  ostSpace?: OSTDiskSpace[];
  byteDistributions: Array<{ mirror: number; ost: number; bytes: number[]; count: number }>;
  source: "live" | "simulated" | "import";
}

export interface BrowseEntry {
  name: string;
  isDir: boolean;
  size?: number;
}

export interface BrowseResult {
  path: string;
  entries: BrowseEntry[];
  error?: string;
}

export interface ScanError {
  file: string;
  error: string;
}

export interface ScanPayload {
  root: string;
  result?: ScanResult;
  errors?: ScanError[];
  scannedMs?: number;
  error?: string;
  note?: string;
}

export interface ScanStatsExtra {
  depthHistogram: Array<{ depth: number; value: number }>;
  stripeSizeHistogram: Array<{ bucket: string; value: number }>;
  fileHistogram: Array<{ min: string; max: string; value: number; label: string }>;
  layoutHistogram: Array<{ layout: string; value: number }>;
  topDirs: Array<{ dir: string; size: number; files: number }>;
}

export interface StripeGroup {
  ost: number;
  mirror: number;
  files: number;
}
