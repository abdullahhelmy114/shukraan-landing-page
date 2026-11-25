import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { parseOps, parseSettings, parseSite } from "@/lib/cms/api.server";
import {
  attemptsLeft,
  checkPassword,
  clearFailures,
  clientIp,
  createSession,
  loginConfigured,
  previewToken,
  recordFailure,
  retryAfter,
  revokeSession,
  sameOrigin,
  SESSION_COOKIE,
  sessionCookie,
  verifySession,
} from "@/lib/cms/auth.server";
import { MAX_UPLOAD, saveUpload } from "@/lib/cms/media.server";
import { groupsApi } from "@/lib/groups-admin.server";
import {
  applyDraftOps,
  duplicatePage,
  hasUnpublished,
  listPages,
  listVersions,
  publish,
  readDraft,
  readMeta,
  readSite,
  readTrash,
  restoreFromTrash,
  restoreVersion,
  StoreError,
  updateMeta,
  writeDraftSettings,
  writeSite,
} from "@/lib/cms/store.server";

/**
 * The control panel's API. Everything except logging in needs the session cookie; anything that
 * changes data must also come from this site (Origin check, next to the SameSite=Strict cookie).
 *
 *   POST login · POST logout · GET session
 *   GET pages · POST pages/duplicate
 *   GET page/<slug> · PATCH page/<slug>/meta · POST page/<slug>/ops · PUT page/<slug>/settings
 *   POST page/<slug>/publish · POST page/<slug>/versions/<id>/restore
 *   POST page/<slug>/trash/<id>/restore · POST page/<slug>/preview
 *   POST media · GET site · PUT site
 *   groups… and waitlist… (src/lib/groups-admin.server.ts)
 */
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (message: string, status = 400) => json({ error: message }, status);

async function body(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function loggedIn() {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

async function handle(req: NextRequest, path: string[]): Promise<Response> {
  const method = req.method;
  const route = path.join("/");
  if (method !== "GET" && !sameOrigin(req.headers)) return fail("طلب من مصدر غير معروف.", 403);

  // ── Login ───────────────────────────────────────────────────────────────────────────────
  if (route === "login" && method === "POST") {
    if (!loginConfigured()) return fail("لم تُضبط كلمة مرور لوحة التحكم (ADMIN_PASSWORD) على الخادم.", 503);
    const ip = clientIp(req.headers);
    const wait = await retryAfter(ip);
    if (wait > 0) return json({ error: `محاولات كثيرة. حاول مجددًا بعد ${Math.ceil(wait / 60)} دقيقة.`, retryAfter: wait }, 429, { "Retry-After": String(wait) });
    const b = (await body(req)) as { password?: unknown } | null;
    const password = typeof b?.password === "string" ? b.password : "";
    if (!checkPassword(password)) {
      await recordFailure(ip);
      return json({ error: "كلمة المرور غير صحيحة.", attemptsLeft: await attemptsLeft(ip) }, 401);
    }
    await clearFailures(ip);
    const s = createSession();
    const res = json({ ok: true });
    res.cookies.set(sessionCookie(s.value, s.maxAge));
    return res;
  }
  if (route === "logout" && method === "POST") {
    const jar = await cookies();
    await revokeSession(jar.get(SESSION_COOKIE)?.value);
    const res = json({ ok: true });
    res.cookies.set(sessionCookie("", 0));
    return res;
  }
  if (route === "session" && method === "GET") return json({ loggedIn: await loggedIn(), configured: loginConfigured() });

  if (!(await loggedIn())) return fail("انتهت الجلسة. سجّل الدخول من جديد.", 401);

  // ── Groups and the waitlist (src/lib/groups-admin.server.ts) ───────────────────────────
  const groupsAnswer = await groupsApi(route, method, new URL(req.url), () => body(req));
  if (groupsAnswer) return groupsAnswer;

  // ── Site (languages and taglines) ───────────────────────────────────────────────────────
  if (route === "site") {
    if (method === "GET") return json({ site: await readSite() });
    if (method === "PUT") {
      const s = parseSite(await body(req));
      if (!s) return fail("بيانات غير صالحة.");
      return json({ site: await writeSite(s) });
    }
  }

  // ── Uploads ─────────────────────────────────────────────────────────────────────────────
  if (route === "media" && method === "POST") {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD + 256 * 1024) return fail("الحد الأقصى لحجم الصورة 10 ميغابايت.", 413);
    let file: File | null = null;
    try {
      const form = await req.formData();
      const f = form.get("file");
      file = f instanceof File ? f : null;
    } catch {
      return fail("لم يصل أي ملف.");
    }
    if (!file) return fail("لم يصل أي ملف.");
    if (file.size > MAX_UPLOAD) return fail("الحد الأقصى لحجم الصورة 10 ميغابايت.", 413);
    return json(await saveUpload(new Uint8Array(await file.arrayBuffer())));
  }

  // ── Pages ───────────────────────────────────────────────────────────────────────────────
  if (route === "pages" && method === "GET") {
    const pages = await listPages();
    return json({ pages: await Promise.all(pages.map(async (p) => ({ ...p, unpublished: await hasUnpublished(p.slug) }))) });
  }
  if (route === "pages/duplicate" && method === "POST") {
    const b = (await body(req)) as { from?: unknown; slug?: unknown; courseName?: unknown } | null;
    if (typeof b?.from !== "string" || typeof b.slug !== "string") return fail("بيانات غير صالحة.");
    const meta = await duplicatePage(b.from, b.slug.trim().toLowerCase(), typeof b.courseName === "string" ? b.courseName : "");
    return json({ meta });
  }

  const [head, slug, action, id, sub] = path;
  if (head !== "page" || !slug || !/^[a-z0-9-]{1,60}$/.test(slug)) return fail("غير موجود.", 404);
  if (!(await readMeta(slug))) return fail("الصفحة غير موجودة.", 404);

  if (!action && method === "GET") {
    const site = await readSite();
    const draft = await readDraft(slug, site);
    if (!draft) return fail("الصفحة غير موجودة.", 404);
    return json({ site, ...draft, trash: await readTrash(slug), versions: await listVersions(slug), unpublished: await hasUnpublished(slug) });
  }
  if (action === "meta" && method === "PATCH") {
    const b = (await body(req)) as { courseName?: unknown; slug?: unknown; archived?: unknown } | null;
    const patch: { courseName?: string; slug?: string; archived?: boolean } = {};
    if (typeof b?.courseName === "string") patch.courseName = b.courseName;
    if (typeof b?.slug === "string") patch.slug = b.slug.trim().toLowerCase();
    if (typeof b?.archived === "boolean") patch.archived = b.archived;
    return json({ meta: await updateMeta(slug, patch) });
  }
  if (action === "ops" && method === "POST") {
    const ops = parseOps(await body(req));
    if (!ops) return fail("عملية غير صالحة.");
    const draft = await applyDraftOps(slug, ops);
    return json({ content: draft.content, trash: await readTrash(slug), unpublished: true });
  }
  if (action === "settings" && method === "PUT") {
    const s = parseSettings(await body(req));
    if (!s) return fail("بيانات غير صالحة.");
    const draft = await writeDraftSettings(slug, s);
    return json({ settings: draft.settings, unpublished: await hasUnpublished(slug) });
  }
  if (action === "publish" && method === "POST") {
    const b = (await body(req)) as { note?: unknown } | null;
    const v = await publish(slug, typeof b?.note === "string" ? b.note : "");
    return json({ version: v, versions: await listVersions(slug), unpublished: false });
  }
  if (action === "versions" && id && sub === "restore" && method === "POST") {
    const draft = await restoreVersion(slug, id);
    return json({ content: draft.content, settings: draft.settings, unpublished: await hasUnpublished(slug) });
  }
  if (action === "trash" && id && sub === "restore" && method === "POST") {
    const draft = await restoreFromTrash(slug, id);
    return json({ content: draft.content, trash: await readTrash(slug), unpublished: true });
  }
  if (action === "preview" && method === "POST") return json({ token: await previewToken(slug) });
  return fail("غير موجود.", 404);
}

async function run(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    return await handle(req, path);
  } catch (e) {
    if (e instanceof StoreError) return fail(e.message, e.status);
    console.error("[admin api]", e);
    return fail("حدث خطأ في الخادم.", 500);
  }
}

export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE };
