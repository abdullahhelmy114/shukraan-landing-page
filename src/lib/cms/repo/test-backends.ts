/// <reference types="bun" />
// Test helpers: the two store backends the tests run against. D1 is stood in by Bun's SQLite with
// the real migration (migrations/0001_init.sql), R2 by an in-memory map, so the D1/R2 repo runs the
// same SQL and the same operations as on Cloudflare.
import { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { d1Repo } from "./d1.server";
import { fileRepo, resetFileAuthState } from "./file.server";
import type { D1Database, D1PreparedStatement, R2Bucket, Repo } from "./types";

export function sqliteD1(): D1Database & { sqlite: Database } {
  const db = new Database(":memory:");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(path.join(dir, f), "utf8"));
  type Stmt = D1PreparedStatement & { exec(): unknown };
  const make = (sql: string, params: unknown[] = []): Stmt => ({
    bind: (...values: unknown[]) => make(sql, values),
    first: async <T,>() => (db.query(sql).get(...(params as never[])) as T | undefined) ?? null,
    all: async <T,>() => ({ results: db.query(sql).all(...(params as never[])) as T[] }),
    // As D1 reports it: the number of changed rows under meta.
    run: async () => ({ success: true, meta: { changes: db.query(sql).run(...(params as never[])).changes } }),
    exec: () => db.query(sql).run(...(params as never[])),
  });
  return {
    sqlite: db,
    prepare: (sql) => make(sql),
    batch: async (stmts) => db.transaction(() => stmts.map((s) => (s as Stmt).exec()))(),
  };
}

export function memoryR2(): R2Bucket & { objects: Map<string, { data: Uint8Array; contentType?: string }> } {
  const objects = new Map<string, { data: Uint8Array; contentType?: string }>();
  return {
    objects,
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { arrayBuffer: async () => o.data.slice().buffer as ArrayBuffer, ...(o.contentType ? { httpMetadata: { contentType: o.contentType } } : {}) };
    },
    async put(key, value, options) {
      const ct = options?.httpMetadata?.contentType;
      objects.set(key, { data: new Uint8Array(value instanceof Uint8Array ? value : new Uint8Array(value)), ...(ct ? { contentType: ct } : {}) });
    },
  };
}

export type Backend = { name: "file" | "d1"; make(): { repo: Repo; cleanup(): void; bucket?: ReturnType<typeof memoryR2>; db?: ReturnType<typeof sqliteD1> } };

/** Both store backends, for describe.each. */
export const BACKENDS: Backend[] = [
  {
    name: "file",
    make() {
      const dir = mkdtempSync(path.join(tmpdir(), "shukraan-data-"));
      process.env["DATA_DIR"] = dir;
      resetFileAuthState();
      return {
        repo: fileRepo(dir),
        cleanup: () => {
          delete process.env["DATA_DIR"];
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
  },
  {
    name: "d1",
    make() {
      const db = sqliteD1();
      const bucket = memoryR2();
      return { repo: d1Repo(db, bucket), db, bucket, cleanup: () => db.sqlite.close() };
    },
  },
];
