import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { BrowseEntry, BrowseResult } from "@/lib/types";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root") ?? "/";
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    const entries: BrowseEntry[] = dirents
      .filter((d) => !d.name.startsWith("."))
      .map((d) => ({ name: d.name, isDir: d.isDirectory() }))
      .sort((a, b) =>
        a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
      );
    await Promise.all(
      entries.map(async (e) => {
        if (e.isDir) return;
        try {
          const st = await stat(path.join(root, e.name));
          e.size = st.size;
        } catch {}
      }),
    );
    const result: BrowseResult = { path: root, entries };
    return NextResponse.json(result);
  } catch (err) {
    const result: BrowseResult = {
      path: root,
      entries: [],
      error: String(err),
    };
    return NextResponse.json(result, { status: 200 });
  }
}
