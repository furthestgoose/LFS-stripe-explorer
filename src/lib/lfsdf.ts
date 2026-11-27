import { lfs } from "./lfs";
import type { OSTDiskSpace } from "./types";

function parseDfLines(stdout: string): OSTDiskSpace[] {
  const out: OSTDiskSpace[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^[\w.:/-]*OST0*(\d+)_UUID\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%/.exec(
      line,
    );
    if (!m) continue;
    out.push({
      index: Number(m[1]),
      name: `lustre-OST000${m[1]}_UUID`,
      totalK: Number(m[2]),
      usedK: Number(m[3]),
      freeK: Number(m[4]),
      usePct: Number(m[5]),
      inodesTotal: null,
      inodesUsed: null,
    });
  }
  return out;
}

export function parseLfsDf(stdout: string): OSTDiskSpace[] {
  const byteRows = parseDfLines(stdout);
  const inodeByUuid = new Map<string, { total: number; used: number }>();
  for (const line of stdout.split(/\r?\n/)) {
    const m =
      /^[\w.:/-]*OST0*(\d+)_UUID\s+\d+\s+\d+\s+\d+\s+\d+%\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%/.exec(
        line,
      );
    if (!m) continue;
    inodeByUuid.set(m[1], { total: Number(m[2]), used: Number(m[3]) });
  }
  if (!inodeByUuid.size) return byteRows;
  for (const row of byteRows) {
    const ino = inodeByUuid.get(String(row.index));
    if (ino) {
      row.inodesTotal = ino.total;
      row.inodesUsed = ino.used;
    }
  }
  return byteRows;
}

export async function collectOstSpace(target: string): Promise<OSTDiskSpace[]> {
  try {
    const [dfPlain, inodes] = await Promise.all([
      lfs(["df", target], 20_000),
      lfs(["df", "-i", target], 20_000).catch(() => null),
    ]);
    if (dfPlain.code !== 0) return [];
    const combined = parseLfsDf(
      inodes && inodes.code === 0 ? inodes.stdout : dfPlain.stdout,
    );
    return combined.filter((row) => row.index >= 0 && row.totalK > 0);
  } catch {
    return [];
  }
}
