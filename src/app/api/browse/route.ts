import { NextRequest, NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import type { BrowseEntry, BrowseResult } from "@/lib/types";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root") ?? "/";
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    const entries: BrowseEntry[] = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => ({ name: d.name, isDir: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const result: BrowseResult = { path: root, entries };
    return NextResponse.json(result);
  } catch (err) {
    const result: BrowseResult = { path: root, entries: [], error: String(err) };
    return NextResponse.json(result, { status: 200 });
  }
}
