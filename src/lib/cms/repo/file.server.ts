import { promises as fs } from "node:fs";
import path from "node:path";

import type { PageMeta, SiteConfig, TrashEntry, VersionInfo } from "../types";
import type { DocName, PreviewLink, Repo, Stage, StoredBlob, StoredStage, VersionRecord } from "./types";

/**
 * The Docker / Coolify store: JSON files under DATA_DIR (a persistent volume, /app/data):
 *
 *   site.json                         languages, brand and taglines (once edited)
 *   pages/<slug>/meta.json            course name, slug, archived flag
 *   pages/<slug>/draft/…              settings.json and one <language>.json per language
 *   pages/<slug>/published/…          the same, as visitors see it
 *   pages/<slug>/versions/<id>.json   every publish (the last 30 are kept)
 *   pages/<slug>/trash.json           deleted sections (kept 30 days)
 *   preview-links.json                preview links handed out (expired ones are dropped)
 *   media/<id>.webp, share/<file>     uploaded images, share images
 *   groups.json                       the groups: status, capacity, days and hour; the waitlist's open-threshold
 *   registrations.json                paid places per group, and payments that came after a group filled
 *   waitlist.json                     the waitlist's entries
 *
 * Every file is written atomically: a temporary file (<name>.<random>.tmp) beside it, then a rename.
 *
 * Login failures and signed-out sessions are kept in memory: one Node.js process serves them all.
 */

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Writes a file atomically (a temporary file, then a rename). */
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// One Node.js process: documents are changed one at a time per file.
const locks = new Map<string, Promise<unknown>>();
function serialize<R>(key: string, task: () => Promise<R>): Promise<R> {
  const run = (locks.get(key) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false,
  );

// One Node.js process: the rate limit and signed-out sessions live in memory.
const failures = new Map<string, number[]>();
const revoked = new Map<string, number>();

/** Test helper: forgets login failures and signed-out sessions. */
export function resetFileAuthState() {
  failures.clear();
  revoked.clear();
}

const KEY = /^(media|share)\/[\w.-]+$/;

export function fileRepo(dataDir: string): Repo {
  const pageDir = (slug: string) => path.join(dataDir, "pages", slug);
  const stageDir = (slug: string, stage: Stage) => path.join(pageDir(slug), stage);
  const previewsFile = path.join(dataDir, "preview-links.json");
  const docFile = (name: DocName) => path.join(dataDir, `${name}.json`);

  return {
    kind: "file",

    getSite: () => readJson<SiteConfig>(path.join(dataDir, "site.json")),
    putSite: (site) => writeJson(path.join(dataDir, "site.json"), site),

    async listSlugs() {
      try {
        return (await fs.readdir(path.join(dataDir, "pages"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
      } catch {
        return [];
      }
    },
    getMeta: (slug) => readJson<PageMeta>(path.join(pageDir(slug), "meta.json")),
    putMeta: (slug, meta) => writeJson(path.join(pageDir(slug), "meta.json"), meta),
    pageExists: (slug) => exists(pageDir(slug)),

    async getStage(slug, stage) {
      const dir = stageDir(slug, stage);
      const settings = await readJson<StoredStage["settings"]>(path.join(dir, "settings.json"));
      if (!settings) return null;
      const content: StoredStage["content"] = {};
      for (const f of await fs.readdir(dir)) {
        if (!f.endsWith(".json") || f === "settings.json") continue;
        const c = await readJson<StoredStage["content"][string]>(path.join(dir, f));
        if (c) content[f.slice(0, -5)] = c;
      }
      return { settings, content };
    },
    async putStage(slug, stage, data) {
      const dir = stageDir(slug, stage);
      await writeJson(path.join(dir, "settings.json"), data.settings);
      for (const [code, c] of Object.entries(data.content)) await writeJson(path.join(dir, `${code}.json`), c);
    },
    movePage: (from, to) => fs.rename(pageDir(from), pageDir(to)),

    async listVersions(slug) {
      let files: string[] = [];
      try {
        files = (await fs.readdir(path.join(pageDir(slug), "versions"))).filter((f) => f.endsWith(".json"));
      } catch {
        return [];
      }
      const out: VersionInfo[] = [];
      for (const f of files.sort().reverse()) {
        const v = await readJson<VersionRecord>(path.join(pageDir(slug), "versions", f));
        if (v) out.push({ id: v.id, publishedAt: v.publishedAt, ...(v.note ? { note: v.note } : {}) });
      }
      return out;
    },
    getVersion: (slug, id) => readJson<VersionRecord>(path.join(pageDir(slug), "versions", `${id}.json`)),
    async putVersion(slug, version, keep) {
      const dir = path.join(pageDir(slug), "versions");
      await writeJson(path.join(dir, `${version.id}.json`), version);
      const all = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
      for (const old of all.slice(0, Math.max(0, all.length - keep))) await fs.rm(path.join(dir, old), { force: true });
    },

    getTrash: async (slug) => (await readJson<TrashEntry[]>(path.join(pageDir(slug), "trash.json"))) ?? [],
    putTrash: (slug, entries) => writeJson(path.join(pageDir(slug), "trash.json"), entries),

    async getBlob(key): Promise<StoredBlob | null> {
      if (!KEY.test(key)) return null;
      try {
        const data = await fs.readFile(path.join(dataDir, key));
        return { data: new Uint8Array(data), contentType: key.endsWith(".webp") ? "image/webp" : key.endsWith(".png") ? "image/png" : "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async putBlob(key, data) {
      if (!KEY.test(key)) throw new Error("bad key");
      const file = path.join(dataDir, key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${Math.random().toString(36).slice(2, 10)}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, file);
    },

    async loginFailures(ip, since) {
      const list = (failures.get(ip) ?? []).filter((t) => t >= since);
      failures.set(ip, list);
      return list;
    },
    async addLoginFailure(ip, at) {
      failures.set(ip, [...(failures.get(ip) ?? []), at]);
    },
    async clearLoginFailures(ip) {
      failures.delete(ip);
    },

    async revokeSession(nonce, expiresAt) {
      revoked.set(nonce, expiresAt);
      const now = Date.now();
      for (const [n, exp] of revoked) if (exp < now) revoked.delete(n);
    },
    isSessionRevoked: async (nonce) => revoked.has(nonce),

    async putPreviewLink(link) {
      const now = Date.now();
      const list = ((await readJson<PreviewLink[]>(previewsFile)) ?? []).filter((l) => l.expiresAt > now);
      await writeJson(previewsFile, [...list, link]);
    },
    getPreviewLink: async (hash) => ((await readJson<PreviewLink[]>(previewsFile)) ?? []).find((l) => l.hash === hash) ?? null,

    getDoc: <T,>(name: DocName) => readJson<T>(docFile(name)),
    updateDoc: <T, R>(name: DocName, change: (current: T | null) => { value: T; result: R }) =>
      serialize(docFile(name), async () => {
        const { value, result } = change(await readJson<T>(docFile(name)));
        await writeJson(docFile(name), value);
        return result;
      }),
  };
}
