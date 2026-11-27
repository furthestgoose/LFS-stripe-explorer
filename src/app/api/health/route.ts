import { NextResponse } from "next/server";
import { commandExists } from "@/lib/lfs";

export async function GET() {
  const present = await commandExists("lfs");
  return NextResponse.json({
    ok: true,
    lfs: present,
    mode: present ? "live" : "demo-only",
  });
}
