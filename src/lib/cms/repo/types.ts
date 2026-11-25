import type { LangContent, PageMeta, PageSettings, SiteConfig, TrashEntry, VersionInfo } from "../types";

/**
 * Where the control panel keeps its data. Two implementations with the same operations:
 *   - FileRepo (Docker / Coolify): JSON files under DATA_DIR, as before.
 *   - D1Repo (Cloudflare Workers): D1 tables for everything, R2 for image bytes.
 * The store (store.server.ts) holds the rules (seed fallback, versions, trash…) and only talks to
 * this interface, so both hosts behave the same.
 */
export type Stage = "draft" | "published";

/** A stage as stored: its settings and the languages that have their own file or row. */
export type StoredStage = { settings: PageSettings; content: Record<string, LangContent> };

export type VersionRecord = VersionInfo & { settings: PageSettings; content: Record<string, LangContent> };

export type StoredBlob = { data: Uint8Array; contentType: string };

export type PreviewLink = { hash: string; slug: string; expiresAt: number; createdAt: number };

/** Small JSON documents kept whole: the groups, their paid seats and the waitlist. */
export const DOC_NAMES = ["groups", "registrations", "waitlist"] as const;
export type DocName = (typeof DOC_NAMES)[number];

export interface Repo {
  readonly kind: "file" | "d1";

  getSite(): Promise<SiteConfig | null>;
  putSite(site: SiteConfig): Promise<void>;

  listSlugs(): Promise<string[]>;
  getMeta(slug: string): Promise<PageMeta | null>;
  putMeta(slug: string, meta: PageMeta): Promise<void>;
  /** Whether anything at all is stored under this slug. */
  pageExists(slug: string): Promise<boolean>;
  getStage(slug: string, stage: Stage): Promise<StoredStage | null>;
  putStage(slug: string, stage: Stage, data: StoredStage): Promise<void>;
  /** Moves everything stored under one slug to another. */
  movePage(from: string, to: string): Promise<void>;

  /** Newest first. */
  listVersions(slug: string): Promise<VersionInfo[]>;
  getVersion(slug: string, id: string): Promise<VersionRecord | null>;
  /** Stores a version and drops all but the newest `keep`. */
  putVersion(slug: string, version: VersionRecord, keep: number): Promise<void>;

  getTrash(slug: string): Promise<TrashEntry[]>;
  putTrash(slug: string, entries: TrashEntry[]): Promise<void>;

  /** Image bytes: media/<id>.webp (uploads) and share/<file>.png (share images). */
  getBlob(key: string): Promise<StoredBlob | null>;
  putBlob(key: string, data: Uint8Array, contentType: string): Promise<void>;

  /** Failed logins of one IP since a time (ms), for the rate limit. */
  loginFailures(ip: string, since: number): Promise<number[]>;
  addLoginFailure(ip: string, at: number): Promise<void>;
  clearLoginFailures(ip: string): Promise<void>;

  revokeSession(nonce: string, expiresAt: number): Promise<void>;
  isSessionRevoked(nonce: string): Promise<boolean>;

  putPreviewLink(link: PreviewLink): Promise<void>;
  getPreviewLink(hash: string): Promise<PreviewLink | null>;

  getDoc<T>(name: DocName): Promise<T | null>;
  /**
   * Changes one document atomically: `change` gets the current value (null when there is none) and
   * returns the new value and a result. Two changes never interleave, so two payments cannot both
   * take a group's last place (one process: a lock; D1: a version check, retried).
   */
  updateDoc<T, R>(name: DocName, change: (current: T | null) => { value: T; result: R }): Promise<R>;
}

// ── The few Cloudflare binding types the D1/R2 implementation uses ────────────────────────────
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
}
/** What D1 reports for a statement that changes rows. */
export type D1Result = { meta?: { changes?: number } };
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}
export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}
export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

/** Cloudflare Images binding (optional): converts uploads to WebP on Workers. */
export interface ImagesBinding {
  info(stream: ReadableStream<Uint8Array>): Promise<{ format: string; width?: number; height?: number; fileSize?: number }>;
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): ReturnType<ImagesBinding["input"]>;
    output(options: { format: string; quality?: number; anim?: boolean }): Promise<{ response(): Response; contentType(): string }>;
  };
}

/** The Worker's bindings (wrangler.jsonc). */
export type CloudflareEnv = { DB?: D1Database; MEDIA?: R2Bucket; IMAGES?: ImagesBinding };
