import { clientIp, sameOrigin } from "@/lib/cms/auth.server";
import { checkDataDir, dataDirError } from "@/lib/data-dir.server";
import { addToWaitlist, GroupError } from "@/lib/groups.server";

export const dynamic = "force-dynamic";

/**
 * The waitlist form. Entries are stored on the server only (DATA_DIR/waitlist.json, or D1) and
 * never sent back: the answer says only whether it was saved. At most 5 tries per 10 minutes per
 * IP; the same number for the same course and group type is refused (409).
 */
const WINDOW_MS = 10 * 60_000;
const MAX_TRIES = 5;
const tries = new Map<string, number[]>();

const answer = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return answer({ error: "origin" }, 403);
  const ip = clientIp(request.headers);
  const now = Date.now();
  const recent = (tries.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= MAX_TRIES) return answer({ error: "rate" }, 429, { "Retry-After": String(Math.ceil((recent[0]! + WINDOW_MS - now) / 1000)) });
  tries.set(ip, [...recent, now]);
  if (tries.size > 5000) for (const [k, v] of tries) if (v.every((t) => t <= now - WINDOW_MS)) tries.delete(k);

  const store = await checkDataDir();
  if (!store.ok) {
    console.error(dataDirError(store));
    return answer({ error: "storage" }, 503);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer({ error: "invalid" }, 400);
  }
  try {
    await addToWaitlist(body);
    return answer({ ok: true });
  } catch (e) {
    if (e instanceof GroupError) return answer({ error: e.message }, e.status);
    console.error("[waitlist] could not save an entry", e);
    return answer({ error: "storage" }, 500);
  }
}
