import path from "node:path";

import { d1Repo } from "./d1.server";
import { fileRepo } from "./file.server";
import type { CloudflareEnv, Repo } from "./types";

/**
 * Which store the panel uses:
 *   - STORAGE=cloudflare (set in wrangler.jsonc): D1 (binding DB) and R2 (binding MEDIA);
 *   - otherwise (Docker / Coolify, local Node.js): files under DATA_DIR (default ./data).
 */
export const usesCloudflare = () => process.env["STORAGE"] === "cloudflare";
export const dataDir = () => process.env["DATA_DIR"] || path.join(process.cwd(), "data");

let override: Repo | null = null;
/** Tests: run the store against a given repo (null to go back to the normal choice). */
export function useRepo(repo: Repo | null) {
  override = repo;
}
/** Whether a test has set the repo (the DATA_DIR check then has nothing to check). */
export const repoOverridden = () => override !== null;

/** The Worker's bindings for this request (only on Cloudflare). */
export async function cloudflareEnv(): Promise<CloudflareEnv> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  return (await getCloudflareContext({ async: true })).env as CloudflareEnv;
}

export async function repo(): Promise<Repo> {
  if (override) return override;
  if (!usesCloudflare()) return fileRepo(dataDir());
  const env = await cloudflareEnv();
  if (!env.DB) throw new Error("STORAGE=cloudflare but the D1 binding DB is missing (see wrangler.jsonc).");
  return d1Repo(env.DB, env.MEDIA);
}
