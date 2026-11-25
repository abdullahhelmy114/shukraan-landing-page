"use client";

import { AdminNav } from "./AdminFrame";
import Link from "next/link";
import { useState } from "react";

import type { PageSummary } from "@/lib/cms/store.server";
import type { SiteConfig } from "@/lib/cms/types";
import { Emblem } from "@/components/shukraan/Emblem";
import { api, arDate } from "./api";

type Row = PageSummary & { unpublished: boolean };

const btn = "rounded-full border border-[#071027]/20 px-3 py-1.5 text-sm text-[#071027] transition hover:border-[#d0a348] hover:bg-[#d0a348]/15";
const primary = "rounded-full bg-[#071027] px-4 py-2 text-sm font-semibold text-[#f3ead7] transition hover:bg-[#0d1936] disabled:opacity-60";
const input = "w-full rounded-xl border border-[#071027]/20 bg-white px-3 py-2 text-[#071027] outline-none focus:border-[#d0a348] focus:ring-2 focus:ring-[#d0a348]/40";

function liveHref(site: SiteConfig, slug: string, lang: string) {
  const prefix = lang === site.defaultLanguage ? "" : `/${lang}`;
  return slug === site.standardPage ? prefix || "/" : `${prefix}/${slug}`;
}

/** The panel's home: every page with its languages, duplicate/rename/archive, and the site's taglines. */
export function Dashboard({ initialPages, initialSite }: { initialPages: Row[]; initialSite: SiteConfig }) {
  const [pages, setPages] = useState(initialPages);
  const [site, setSite] = useState(initialSite);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [dup, setDup] = useState<{ from: string; slug: string; courseName: string } | null>(null);
  const [ren, setRen] = useState<{ slug: string; newSlug: string; courseName: string } | null>(null);
  const [newLang, setNewLang] = useState({ code: "", label: "", dir: "ltr" as "ltr" | "rtl" });

  const refresh = async () => setPages((await api<{ pages: Row[] }>("pages")).pages);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr("");
    setMsg("");
    try {
      await fn();
      await refresh();
      setMsg(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "حدث خطأ.");
    }
  };

  const active = pages.filter((p) => !p.archived);
  const archived = pages.filter((p) => p.archived);

  const card = (p: Row) => (
    <li key={p.slug} data-page={p.slug} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#071027]/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#071027]">{p.courseName}</h3>
          <p className="mt-0.5 text-sm text-[#071027]/60" dir="ltr">
            /{p.slug}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {p.isStandard && <span className="rounded-full bg-[#071027] px-2 py-0.5 text-[#f3ead7]">القالب القياسي</span>}
            {p.archived ? (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-700">مؤرشفة</span>
            ) : p.published ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">منشورة</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">لم تُنشر بعد</span>
            )}
            {p.unpublished && <span className="rounded-full bg-[#d0a348]/25 px-2 py-0.5 text-[#071027]">تعديلات غير منشورة</span>}
            {p.updatedAt && <span className="text-[#071027]/50">آخر تعديل: {arDate(p.updatedAt)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!p.archived && (
            <button type="button" className={btn} onClick={() => setDup({ from: p.slug, slug: "", courseName: "" })}>
              نسخ الصفحة
            </button>
          )}
          <button type="button" className={btn} onClick={() => setRen({ slug: p.slug, newSlug: p.slug, courseName: p.courseName })}>
            إعادة التسمية
          </button>
          {!p.isStandard && (
            <button
              type="button"
              className={btn}
              onClick={() => run(() => api(`page/${p.slug}/meta`, { method: "PATCH", body: { archived: !p.archived } }), p.archived ? "استُعيدت الصفحة." : "أُرشِفت الصفحة.")}
            >
              {p.archived ? "استعادة من الأرشيف" : "أرشفة"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[#071027]/60">تحرير:</span>
        {site.languages.map((l) => (
          <Link key={l.code} href={`/admin/edit/${p.slug}/${l.code}`} className={btn} lang={l.code}>
            {l.label}
          </Link>
        ))}
        {p.published && !p.archived && (
          <>
            <span className="ms-2 text-[#071027]/60">عرض:</span>
            {site.languages.map((l) => (
              <a key={l.code} href={liveHref(site, p.slug, l.code)} target="_blank" rel="noopener" className="text-[#071027] underline underline-offset-4" dir="ltr">
                {liveHref(site, p.slug, l.code)}
              </a>
            ))}
          </>
        )}
      </div>
      {dup?.from === p.slug && (
        <form
          className="mt-4 grid gap-3 rounded-xl bg-[#fbf6ea] p-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("pages/duplicate", { body: dup });
              setDup(null);
            }, "نُسخت الصفحة بلغاتها الثلاث. افتحها للتحرير ثم انشرها.");
          }}
        >
          <label className="text-sm">
            اسم الدورة الجديدة
            <input required className={input} value={dup.courseName} onChange={(e) => setDup({ ...dup, courseName: e.target.value })} />
          </label>
          <label className="text-sm">
            الرابط المختصر (حروف لاتينية صغيرة وأرقام وشرطة)
            <input required dir="ltr" pattern="[a-z0-9](?:[a-z0-9\-]{0,58}[a-z0-9])?" className={input} value={dup.slug} onChange={(e) => setDup({ ...dup, slug: e.target.value.toLowerCase() })} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={primary}>
              نسخ
            </button>
            <button type="button" className={btn} onClick={() => setDup(null)}>
              إلغاء
            </button>
          </div>
        </form>
      )}
      {ren?.slug === p.slug && (
        <form
          className="mt-4 grid gap-3 rounded-xl bg-[#fbf6ea] p-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const body: Record<string, string> = { courseName: ren.courseName };
            if (!p.isStandard && ren.newSlug !== p.slug) body["slug"] = ren.newSlug;
            void run(async () => {
              await api(`page/${p.slug}/meta`, { method: "PATCH", body });
              setRen(null);
            }, "حُفظ الاسم.");
          }}
        >
          <label className="text-sm">
            اسم الدورة
            <input required className={input} value={ren.courseName} onChange={(e) => setRen({ ...ren, courseName: e.target.value })} />
          </label>
          <label className="text-sm">
            الرابط المختصر
            <input dir="ltr" disabled={p.isStandard} className={input} value={ren.newSlug} onChange={(e) => setRen({ ...ren, newSlug: e.target.value.toLowerCase() })} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={primary}>
              حفظ
            </button>
            <button type="button" className={btn} onClick={() => setRen(null)}>
              إلغاء
            </button>
          </div>
        </form>
      )}
    </li>
  );

  return (
    <main className="admin-root min-h-screen bg-[#f3ead7]/60 text-[#071027]" dir="rtl" lang="ar">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#071027] px-5 py-4 text-[#f3ead7] sm:px-8">
        <div className="flex items-center gap-3">
          <Emblem className="h-10 w-auto text-[#f3ead7]" />
          <div>
            <p className="font-arabic text-xl font-bold">لوحة التحكم</p>
            <p className="text-xs opacity-70">صفحات الهبوط · أَكاديمِيَّةُ شُكْران إِيدْيُو</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminNav />
          <button
            type="button"
            className="rounded-full border border-[#f3ead7]/40 px-4 py-2 text-sm hover:bg-[#f3ead7]/10"
            onClick={async () => {
              await api("logout", { method: "POST" });
              window.location.reload();
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        {msg && (
          <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            {msg}
          </p>
        )}
        {err && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {err}
          </p>
        )}
        <h2 className="text-2xl font-semibold">الصفحات</h2>
        <p className="mt-1 text-sm text-[#071027]/70">«نسخ الصفحة» ينسخ اللغات كلها إلى رابط جديد كمسودة. الصفحة القياسية هي القالب.</p>
        <ul className="mt-5 space-y-4">{active.map(card)}</ul>
        {archived.length > 0 && (
          <>
            <h2 className="mt-10 text-xl font-semibold">الأرشيف</h2>
            <ul className="mt-4 space-y-4">{archived.map(card)}</ul>
          </>
        )}

        <section className="mt-12 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#071027]/10">
          <h2 className="text-xl font-semibold">الإعدادات العامة: اللغات والشعار</h2>
          <p className="mt-1 text-sm text-[#071027]/70">العبارة التعريفية تحت الشعار لكل لغة. اللغة التي ليس لها عبارة تُعرض بالإنجليزية. إضافة لغة هنا لا تحتاج أي تعديل في الكود.</p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => setSite((await api<{ site: SiteConfig }>("site", { method: "PUT", body: { site } })).site), "حُفظت الإعدادات العامة.");
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                الاسم بالعربية
                <input className={input} dir="rtl" value={site.brand.arabic} onChange={(e) => setSite({ ...site, brand: { ...site.brand, arabic: e.target.value } })} />
              </label>
              <label className="text-sm">
                الاسم باللاتينية
                <input className={input} dir="ltr" value={site.brand.latin} onChange={(e) => setSite({ ...site, brand: { ...site.brand, latin: e.target.value } })} />
              </label>
            </div>
            {site.languages.map((l) => (
              <label key={`name-${l.code}`} className="block text-sm">
                اسم الأكاديمية في الشعار — {l.label}
                <input className={input} dir={l.dir} lang={l.code} value={site.brand.names?.[l.code] ?? ""} placeholder={site.brand.names?.["en"]} onChange={(e) => setSite({ ...site, brand: { ...site.brand, names: { ...site.brand.names, [l.code]: e.target.value } } })} />
              </label>
            ))}
            {site.languages.map((l) => (
              <label key={l.code} className="block text-sm">
                العبارة التعريفية — {l.label}
                <textarea rows={2} dir={l.dir} lang={l.code} className={input} value={site.tagline[l.code] ?? ""} placeholder={site.tagline[site.fallbackLanguage]} onChange={(e) => setSite({ ...site, tagline: { ...site.tagline, [l.code]: e.target.value } })} />
              </label>
            ))}
            <fieldset className="rounded-xl bg-[#fbf6ea] p-4">
              <legend className="px-1 text-sm font-semibold">إضافة لغة</legend>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem_auto]">
                <label className="text-sm">
                  الرمز (مثل fr)
                  <input dir="ltr" className={input} value={newLang.code} onChange={(e) => setNewLang({ ...newLang, code: e.target.value.toLowerCase() })} />
                </label>
                <label className="text-sm">
                  الاسم كما يظهر
                  <input className={input} value={newLang.label} onChange={(e) => setNewLang({ ...newLang, label: e.target.value })} />
                </label>
                <label className="text-sm">
                  الاتجاه
                  <select className={input} value={newLang.dir} onChange={(e) => setNewLang({ ...newLang, dir: e.target.value === "rtl" ? "rtl" : "ltr" })}>
                    <option value="ltr">من اليسار</option>
                    <option value="rtl">من اليمين</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className={btn}
                    disabled={!/^[a-z]{2,3}$/.test(newLang.code) || !newLang.label.trim() || site.languages.some((l) => l.code === newLang.code)}
                    onClick={() => {
                      setSite({ ...site, languages: [...site.languages, { code: newLang.code, label: newLang.label.trim(), dir: newLang.dir }] });
                      setNewLang({ code: "", label: "", dir: "ltr" });
                    }}
                  >
                    إضافة
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-[#071027]/60">تبدأ اللغة الجديدة بنسخة من النص الإنجليزي في كل صفحة، ثم تُترجم من المحرر. اضغط «حفظ» لاعتمادها.</p>
            </fieldset>
            <button type="submit" className={primary}>
              حفظ الإعدادات العامة
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
