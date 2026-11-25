import type { PageMeta, SiteConfig, TrashEntry } from "../types";
import type { D1Database, DocName, PreviewLink, R2Bucket, Repo, StoredStage, VersionRecord } from "./types";

/**
 * The Cloudflare Workers store: D1 tables (migrations/0001_init.sql) for the site, pages, drafts,
 * published content, versions, trash, preview links, login failures and signed-out sessions; R2
 * for image bytes. Same operations as the file store.
 */
const json = (v: unknown) => JSON.stringify(v);
const parse = <T,>(s: unknown): T => JSON.parse(String(s)) as T;
const KEY = /^(media|share)\/[\w.-]+$/;

export function d1Repo(db: D1Database, bucket: R2Bucket | undefined): Repo {
  const now = () => new Date().toISOString();
  return {
    kind: "d1",

    async getSite() {
      const row = await db.prepare("SELECT config FROM site WHERE id = 1").first<{ config: string }>();
      return row ? parse<SiteConfig>(row.config) : null;
    },
    async putSite(site) {
      await db.prepare("INSERT INTO site (id, config, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at").bind(json(site), now()).run();
    },

    async listSlugs() {
      const { results } = await db.prepare("SELECT slug FROM pages UNION SELECT DISTINCT slug FROM page_settings").all<{ slug: string }>();
      return results.map((r) => r.slug);
    },
    async getMeta(slug) {
      const row = await db.prepare("SELECT meta FROM pages WHERE slug = ?1").bind(slug).first<{ meta: string }>();
      return row ? parse<PageMeta>(row.meta) : null;
    },
    async putMeta(slug, meta) {
      await db.prepare("INSERT INTO pages (slug, meta, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(slug) DO UPDATE SET meta = excluded.meta, updated_at = excluded.updated_at").bind(slug, json(meta), now()).run();
    },
    async pageExists(slug) {
      const row = await db
        .prepare("SELECT 1 AS x FROM pages WHERE slug = ?1 UNION SELECT 1 FROM page_settings WHERE slug = ?1 UNION SELECT 1 FROM versions WHERE slug = ?1 LIMIT 1")
        .bind(slug)
        .first();
      return row !== null;
    },

    async getStage(slug, stage) {
      const s = await db.prepare("SELECT settings FROM page_settings WHERE slug = ?1 AND stage = ?2").bind(slug, stage).first<{ settings: string }>();
      if (!s) return null;
      const { results } = await db.prepare("SELECT lang, content FROM page_content WHERE slug = ?1 AND stage = ?2").bind(slug, stage).all<{ lang: string; content: string }>();
      const content: StoredStage["content"] = {};
      for (const r of results) content[r.lang] = parse(r.content);
      return { settings: parse(s.settings), content };
    },
    async putStage(slug, stage, data) {
      await db.batch([
        db.prepare("INSERT INTO page_settings (slug, stage, settings) VALUES (?1, ?2, ?3) ON CONFLICT(slug, stage) DO UPDATE SET settings = excluded.settings").bind(slug, stage, json(data.settings)),
        ...Object.entries(data.content).map(([lang, c]) =>
          db.prepare("INSERT INTO page_content (slug, stage, lang, content) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(slug, stage, lang) DO UPDATE SET content = excluded.content").bind(slug, stage, lang, json(c)),
        ),
      ]);
    },
    async movePage(from, to) {
      await db.batch(["pages", "page_settings", "page_content", "versions", "trash", "preview_links"].map((t) => db.prepare(`UPDATE ${t} SET slug = ?2 WHERE slug = ?1`).bind(from, to)));
    },

    async listVersions(slug) {
      const { results } = await db.prepare("SELECT id, published_at, note FROM versions WHERE slug = ?1 ORDER BY id DESC").bind(slug).all<{ id: string; published_at: string; note: string }>();
      return results.map((r) => ({ id: r.id, publishedAt: r.published_at, ...(r.note ? { note: r.note } : {}) }));
    },
    async getVersion(slug, id) {
      const r = await db.prepare("SELECT id, published_at, note, settings, content FROM versions WHERE slug = ?1 AND id = ?2").bind(slug, id).first<{ id: string; published_at: string; note: string; settings: string; content: string }>();
      return r ? ({ id: r.id, publishedAt: r.published_at, ...(r.note ? { note: r.note } : {}), settings: parse(r.settings), content: parse(r.content) } as VersionRecord) : null;
    },
    async putVersion(slug, v, keep) {
      await db.batch([
        db.prepare("INSERT INTO versions (slug, id, published_at, note, settings, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(slug, v.id, v.publishedAt, v.note ?? "", json(v.settings), json(v.content)),
        db.prepare("DELETE FROM versions WHERE slug = ?1 AND id NOT IN (SELECT id FROM versions WHERE slug = ?1 ORDER BY id DESC LIMIT ?2)").bind(slug, keep),
      ]);
    },

    async getTrash(slug) {
      const { results } = await db.prepare("SELECT entry FROM trash WHERE slug = ?1 ORDER BY deleted_at DESC").bind(slug).all<{ entry: string }>();
      return results.map((r) => parse<TrashEntry>(r.entry));
    },
    async putTrash(slug, entries) {
      await db.batch([
        db.prepare("DELETE FROM trash WHERE slug = ?1").bind(slug),
        ...entries.map((e) => db.prepare("INSERT OR REPLACE INTO trash (slug, id, deleted_at, entry) VALUES (?1, ?2, ?3, ?4)").bind(slug, e.id, e.deletedAt, json(e))),
      ]);
    },

    async getBlob(key) {
      if (!KEY.test(key) || !bucket) return null;
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { data: new Uint8Array(await obj.arrayBuffer()), contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" };
    },
    async putBlob(key, data, contentType) {
      if (!KEY.test(key)) throw new Error("bad key");
      if (!bucket) throw new Error("The R2 binding MEDIA is missing.");
      await bucket.put(key, data, { httpMetadata: { contentType } });
      await db.prepare("INSERT OR REPLACE INTO media (key, content_type, bytes, created_at) VALUES (?1, ?2, ?3, ?4)").bind(key, contentType, data.byteLength, now()).run();
    },

    async loginFailures(ip, since) {
      const { results } = await db.prepare("SELECT at FROM login_failures WHERE ip = ?1 AND at >= ?2 ORDER BY at").bind(ip, since).all<{ at: number }>();
      return results.map((r) => Number(r.at));
    },
    async addLoginFailure(ip, at) {
      // Old failures (over a day) are dropped as new ones come in.
      await db.batch([
        db.prepare("INSERT INTO login_failures (ip, at) VALUES (?1, ?2)").bind(ip, at),
        db.prepare("DELETE FROM login_failures WHERE at < ?1").bind(at - 86_400_000),
      ]);
    },
    async clearLoginFailures(ip) {
      await db.prepare("DELETE FROM login_failures WHERE ip = ?1").bind(ip).run();
    },

    async revokeSession(nonce, expiresAt) {
      await db.batch([
        db.prepare("INSERT OR REPLACE INTO revoked_sessions (nonce, expires_at) VALUES (?1, ?2)").bind(nonce, expiresAt),
        db.prepare("DELETE FROM revoked_sessions WHERE expires_at < ?1").bind(Date.now()),
      ]);
    },
    async isSessionRevoked(nonce) {
      return (await db.prepare("SELECT 1 AS x FROM revoked_sessions WHERE nonce = ?1").bind(nonce).first()) !== null;
    },

    async putPreviewLink(link) {
      await db.batch([
        db.prepare("INSERT OR REPLACE INTO preview_links (hash, slug, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)").bind(link.hash, link.slug, link.expiresAt, link.createdAt),
        db.prepare("DELETE FROM preview_links WHERE expires_at < ?1").bind(Date.now()),
      ]);
    },
    async getPreviewLink(hash) {
      const r = await db.prepare("SELECT hash, slug, expires_at, created_at FROM preview_links WHERE hash = ?1").bind(hash).first<{ hash: string; slug: string; expires_at: number; created_at: number }>();
      return r ? ({ hash: r.hash, slug: r.slug, expiresAt: Number(r.expires_at), createdAt: Number(r.created_at) } satisfies PreviewLink) : null;
    },

    async getDoc<T>(name: DocName) {
      const r = await db.prepare("SELECT json FROM docs WHERE name = ?1").bind(name).first<{ json: string }>();
      return r ? (JSON.parse(r.json) as T) : null;
    },
    // A version check instead of a lock: a change made from a stale read updates no row and is
    // computed again from the new value (migrations/0002_docs.sql).
    async updateDoc<T, R>(name: DocName, change: (current: T | null) => { value: T; result: R }) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const row = await db.prepare("SELECT json, version FROM docs WHERE name = ?1").bind(name).first<{ json: string; version: number }>();
        const { value, result } = change(row ? (JSON.parse(row.json) as T) : null);
        const json = JSON.stringify(value);
        const res = row
          ? await db.prepare("UPDATE docs SET json = ?1, version = version + 1, updated_at = ?2 WHERE name = ?3 AND version = ?4").bind(json, Date.now(), name, row.version).run()
          : await db.prepare("INSERT OR IGNORE INTO docs (name, json, version, updated_at) VALUES (?1, ?2, 1, ?3)").bind(name, json, Date.now()).run();
        if ((res.meta?.changes ?? 0) === 1) return result;
      }
      throw new Error(`docs/${name}: too many changes at once`);
    },
  };
}
