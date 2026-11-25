import { promises as fs } from "node:fs";
import path from "node:path";

import { dataDir, repoOverridden, usesCloudflare } from "@/lib/cms/repo/index.server";

export type DataDirCheck = { ok: true } | { ok: false; dir: string; reason: string };

let okUntil = 0;

/**
 * Whether DATA_DIR (Coolify: /app/data, a persistent volume) exists and can be written: checked at
 * start-up and before a registration or a waitlist entry is saved, so neither is lost silently.
 * Always true on Cloudflare (D1 and R2 hold the data). A missing folder is created only outside
 * production, so a mistyped DATA_DIR in production is reported instead of silently created.
 */
export async function checkDataDir(): Promise<DataDirCheck> {
  if (usesCloudflare() || repoOverridden() || Date.now() < okUntil) return { ok: true };
  const dir = dataDir();
  try {
    if (process.env["NODE_ENV"] !== "production") await fs.mkdir(dir, { recursive: true });
    if (!(await fs.stat(dir)).isDirectory()) throw new Error("not a folder");
    const probe = path.join(dir, `.write-check.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    okUntil = Date.now() + 60_000;
    return { ok: true };
  } catch (e) {
    return { ok: false, dir, reason: (e as NodeJS.ErrnoException).code ?? (e as Error).message };
  }
}

export const dataDirError = (c: Extract<DataDirCheck, { ok: false }>) =>
  `[data] DATA_DIR ${c.dir} is missing or not writable (${c.reason}): registrations and waitlist entries cannot be saved until it is. Mount a persistent volume there (Coolify: /app/data).`;
