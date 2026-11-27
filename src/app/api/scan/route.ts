import { NextRequest, NextResponse } from "next/server";
import { commandExists, isDirectory } from "@/lib/lfs";
import { scanDirectory } from "@/lib/scan";
import { collectOstSpace } from "@/lib/lfsdf";
import { demoScan } from "@/lib/demo";
import type { ScanPayload, ScanResult } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { root?: string; mode?: "live" | "demo" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const root = body.root?.trim();
  if (!root) {
    return NextResponse.json({ error: "missing root" }, { status: 400 });
  }
  if (body.mode === "demo") {
    const payload: ScanPayload = {
      root,
      result: demoScan(),
      note: "simulated dataset (no filesystem access)",
    };
    return NextResponse.json(payload);
  }
  if (!(await isDirectory(root))) {
    return NextResponse.json(
      { error: `not a directory: ${root}` },
      { status: 400 },
    );
  }
  if (!(await commandExists("lfs"))) {
    return NextResponse.json(
      {
        error:
          "lfs not found on this host; run on a Lustre client or use demo mode",
        hint: 'POST {"root": "/lustre/dir", "mode": "demo"} for a simulated dataset',
      },
      { status: 501 },
    );
  }
  try {
    const result: ScanResult = await scanDirectory(root);
    const space = await collectOstSpace(root);
    if (space.length) {
      result.ostSpace = space;
      for (const row of space) {
        if ((result.ostNames[row.index] ?? "") === "")
          result.ostNames[row.index] = row.name;
      }
    }
    const payload: ScanPayload = { root, result };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: `scan failed: ${String(err)}` },
      { status: 500 },
    );
  }
}
