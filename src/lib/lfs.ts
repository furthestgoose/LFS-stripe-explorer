import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export interface LfsResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
}

export function hasLfs(): boolean {
  return process.platform !== "win32";
}

export async function commandExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", [name], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0 && out.trim().length > 0));
    proc.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
  });
}

export async function ensureLfs(): Promise<void> {
  if (!(await commandExists("lfs"))) {
    throw new Error("lfs not found in PATH");
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  const s = await stat(path).catch(() => null);
  return !!s && s.isDirectory();
}

export function lfs(args: readonly string[], timeoutMs = 30_000): Promise<LfsResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("lfs", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (result: Pick<LfsResult, "code" | "signal">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr || err.join("").slice(0, 100_000), ...result });
    };

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finish({ code: null, signal: "SIGKILL" });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (out.length < 4_096) out.push(chunk);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (err.length < 256) err.push(chunk);
    });
    proc.on("close", (code, signal) => {
      stdout = Buffer.concat(out).toString().slice(0, 4 * 1024 * 1024);
      stderr = Buffer.concat(err).toString().slice(0, 100_000);
      finish({ code, signal });
    });
    proc.on("error", (spawnErr) => {
      clearTimeout(timer);
      settled = true; // avoid double-resolve before reject
      reject(spawnErr);
    });
  });
}
