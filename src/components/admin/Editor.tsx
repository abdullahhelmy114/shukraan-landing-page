"use client";

import Link from "next/link";
import type { PublicGroup } from "@/lib/groups";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { Emblem } from "@/components/shukraan/Emblem";
import { PageView } from "@/components/shukraan/page/PageView";
import type { EditApi } from "@/components/shukraan/page/context";
import { SCHEMES, TONE_LABELS, resolveScheme } from "@/lib/cms/lockup";
import { pageHref } from "@/lib/cms/links";
import { applyOp, getAt, type Drafts, type Op } from "@/lib/cms/ops";
import { SECTION_LABELS, sectionTitle } from "@/lib/cms/sections";
import { SECTION_TYPES, type ImageField, type LockupSetting, type PageBundle, type PageMeta, type PageSettings, type Scheme, type SiteConfig, type TrashEntry, type Tone, type VersionInfo } from "@/lib/cms/types";
import { api, arDate } from "./api";

export type EditorInitial = {
  /** The groups the page shows (open and full), without capacity or counts. */
  groups?: PublicGroup[];
  site: SiteConfig;
  meta: PageMeta;
  settings: PageSettings;
  content: Drafts;
  trash: TrashEntry[];
  versions: VersionInfo[];
  unpublished: boolean;
  /** Whether visitors can see the page at all (it has been published at least once). */
  published: boolean;
};

type Drawer = null | "sections" | "texts" | "settings" | "versions" | "trash" | { fields: string };

const btn = "rounded-full border border-[#f3ead7]/25 px-3 py-1.5 text-[13px] text-[#f3ead7] transition hover:bg-[#f3ead7]/10 disabled:opacity-40";
const lightBtn = "rounded-full border border-[#071027]/20 px-3 py-1.5 text-sm text-[#071027] transition hover:border-[#d0a348] hover:bg-[#d0a348]/15 disabled:opacity-40";
const primary = "rounded-full bg-[#d0a348] px-4 py-1.5 text-sm font-semibold text-[#071027] transition hover:bg-[#e8cf8f] disabled:opacity-60";
const darkPrimary = "rounded-full bg-[#071027] px-4 py-2 text-sm font-semibold text-[#f3ead7] transition hover:bg-[#0d1936] disabled:opacity-60";
const input = "w-full rounded-xl border border-[#071027]/20 bg-white px-3 py-2 text-sm text-[#071027] outline-none focus:border-[#d0a348] focus:ring-2 focus:ring-[#d0a348]/40";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Fields set once for every language (links, switches, course keys); every other text is per language. */
const SHARED_KEYS = new Set(["target", "course", "imageSide", "href", "consent", "showDiscount"]);
const UI_GROUPS: [string, string][] = [
  ["form.", "نموذج التسجيل"],
  ["done.", "بعد الدفع ورابط واتساب"],
  ["discount.", "كود الخصم"],
  ["checkout.", "الدفع"],
  ["course.", "أسماء الدورات"],
  ["group.", "أسماء المجموعات"],
  ["timetable.", "جدول المواعيد"],
  ["float.", "زر واتساب العائم"],
  ["notFound.", "صفحة غير موجودة"],
  ["", "عام"],
];

/** The in-place editor: the real page in one language, with the panel's tools around it. */
export function Editor({ slug, lang, initial }: { slug: string; lang: string; initial: EditorInitial }) {
  const { site } = initial;
  const [meta, setMeta] = useState(initial.meta);
  const [content, setContent] = useState<Drafts>(initial.content);
  const [settings, setSettings] = useState(initial.settings);
  const [trash, setTrash] = useState(initial.trash);
  const [versions, setVersions] = useState(initial.versions);
  const [unpublished, setUnpublished] = useState(initial.unpublished);
  const [published, setPublished] = useState(initial.published);
  const [share, setShare] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [image, setImage] = useState<{ path: string[]; image: ImageField } | null>(null);
  // The rich-text element with focus (kept in a ref; the flag re-renders the formatting buttons).
  const richRef = useRef<HTMLElement | null>(null);
  const [rich, setRichOn] = useState(false);
  const [preview, setPreview] = useState("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const language = site.languages.find((l) => l.code === lang)!;

  /** Runs a request after the ones before it, counting it as pending. */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>) => {
    setPending((n) => n + 1);
    const run = queue.current.then(fn, fn).finally(() => setPending((n) => n - 1));
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const r = await api<EditorInitial>(`page/${slug}`);
    setContent(r.content);
    setSettings(r.settings);
    setTrash(r.trash);
    setVersions(r.versions);
    setUnpublished(r.unpublished);
  }, [slug]);

  const apply = useCallback(
    (ops: Op[]) => {
      setError("");
      // Shown at once; the server's copy (sanitised) replaces it when it answers.
      setContent((prev) => {
        const next = clone(prev);
        try {
          for (const op of ops) applyOp(next, op);
          return next;
        } catch {
          return prev;
        }
      });
      enqueue(() => api<{ content: Drafts; trash: TrashEntry[] }>(`page/${slug}/ops`, { body: { ops } }))
        .then((r) => {
          setContent(r.content);
          setTrash(r.trash);
          setUnpublished(true);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "تعذّر الحفظ.");
          void reload();
        });
    },
    [enqueue, reload, slug],
  );

  const edit: EditApi = useMemo(
    () => ({
      lang,
      apply,
      pickImage: (path, img) => setImage({ path, image: img }),
      openFields: (id) => setDrawer({ fields: id }),
      focusRich: (el) => {
        richRef.current = el;
        setRichOn(!!el);
      },
      shareSection: (id) => setShare(id),
    }),
    [lang, apply],
  );

  const bundle: PageBundle = useMemo(
    () => ({
      site,
      meta,
      settings,
      lang: language,
      content: content[lang]!,
      fallbackUi: (content[site.fallbackLanguage] ?? content[lang]!).ui,
      links: [],
      isStandard: meta.slug === site.standardPage,
      ...(initial.groups ? { groups: initial.groups } : {}),
    }),
    [site, meta, settings, language, content, lang, initial.groups],
  );

  const saveSettings = (next: PageSettings) => {
    setSettings(next);
    enqueue(() => api<{ settings: PageSettings; unpublished: boolean }>(`page/${slug}/settings`, { method: "PUT", body: { settings: next } }))
      .then((r) => {
        setSettings(r.settings);
        setUnpublished(r.unpublished);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "تعذّر الحفظ."));
  };

  const publishNow = async () => {
    const note = window.prompt("نشر المسودة بكل لغاتها للزوار. ملاحظة لهذه النسخة (اختياري):", "");
    if (note === null) return;
    try {
      const r = await enqueue(() => api<{ versions: VersionInfo[] }>(`page/${slug}/publish`, { body: { note } }));
      setVersions(r.versions);
      setUnpublished(false);
      setPublished(true);
      setNotice("تم النشر. حُفظت نسخة يمكن الرجوع إليها.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر النشر.");
    }
  };

  const makePreview = async () => {
    try {
      const r = await api<{ token: string }>(`page/${slug}/preview`, { method: "POST" });
      setPreview(`${window.location.origin}/preview/${slug}/${lang}?t=${encodeURIComponent(r.token)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إنشاء الرابط.");
    }
  };

  // Formatting for the rich text that has focus.
  const format = (cmd: "bold" | "italic" | "insertUnorderedList" | "insertOrderedList" | "createLink" | "unlink") => {
    const el = richRef.current;
    if (!el) return;
    if (cmd === "createLink") {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      el.dataset["hold"] = "1";
      const url = window.prompt("عنوان الرابط (يبدأ بـ https:// أو mailto: أو #قسم):", "https://");
      el.focus();
      if (range) {
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      delete el.dataset["hold"];
      if (url && url !== "https://") document.execCommand("createLink", false, url);
      return;
    }
    document.execCommand(cmd);
  };

  const status = pending > 0 ? "يتم الحفظ…" : unpublished ? "مسودة محفوظة · تعديلات غير منشورة" : "كل التعديلات منشورة";
  const sections = content[lang]?.sections ?? [];

  return (
    <div className="admin-root" lang="ar" dir="rtl">
      <div className="fixed inset-x-0 top-0 z-[70] bg-[#071027] text-[#f3ead7] shadow-lg">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-5">
          <Link href="/admin" className={btn}>
            → الصفحات
          </Link>
          <div className="me-2 min-w-0">
            <p className="truncate text-sm font-semibold">{meta.courseName}</p>
            <p className="text-[11px] opacity-70" role="status" data-save-status>
              {status}
            </p>
          </div>
          <nav aria-label="لغة التحرير" className="flex rounded-full border border-[#f3ead7]/25 p-0.5">
            {site.languages.map((l) => (
              <Link key={l.code} href={`/admin/edit/${slug}/${l.code}`} lang={l.code} aria-current={l.code === lang ? "page" : undefined} className={`rounded-full px-3 py-1 text-[13px] ${l.code === lang ? "bg-[#d0a348] font-semibold text-[#071027]" : "opacity-80 hover:opacity-100"}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            <button type="button" className={btn} onClick={() => setDrawer("sections")}>
              الأقسام
            </button>
            <button type="button" className={btn} onClick={() => setDrawer("texts")}>
              نصوص أخرى
            </button>
            <button type="button" className={btn} onClick={() => setDrawer("settings")}>
              إعدادات الصفحة
            </button>
            <button type="button" className={btn} onClick={() => setDrawer("versions")}>
              النسخ ({versions.length})
            </button>
            <button type="button" className={btn} onClick={() => setDrawer("trash")}>
              سلة المحذوفات ({trash.length})
            </button>
            <button type="button" className={btn} onClick={makePreview}>
              رابط المعاينة
            </button>
            <button type="button" className={primary} onClick={publishNow} disabled={pending > 0} data-publish>
              نشر
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#f3ead7]/10 px-3 py-1.5 text-[12px] sm:px-5" aria-label="تنسيق النص">
          <span className="opacity-70">تنسيق النص المحدد:</span>
          {(
            [
              ["bold", "عريض", "font-bold"],
              ["italic", "مائل", "italic"],
              ["createLink", "رابط", ""],
              ["unlink", "إزالة الرابط", ""],
              ["insertUnorderedList", "• قائمة", ""],
              ["insertOrderedList", "1. قائمة مرقّمة", ""],
            ] as const
          ).map(([cmd, label, cls]) => (
            <button key={cmd} type="button" disabled={!rich} onMouseDown={(e) => e.preventDefault()} onClick={() => format(cmd)} className={`${btn} ${cls} py-1`}>
              {label}
            </button>
          ))}
          <span className="opacity-60">{rich ? "" : "انقر داخل فقرة لتفعيل التنسيق. العناوين نص عادي."}</span>
        </div>
        {(error || notice || preview) && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[#f3ead7]/10 px-3 py-2 text-sm sm:px-5">
            {error && (
              <p role="alert" className="text-red-300">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-emerald-300">
                {notice}{" "}
                <button type="button" className="underline" onClick={() => setNotice("")}>
                  إغلاق
                </button>
              </p>
            )}
            {preview && (
              <p className="flex flex-wrap items-center gap-2">
                رابط المعاينة (صالح 7 أيام):
                <input readOnly dir="ltr" value={preview} className="w-72 rounded-lg bg-white/10 px-2 py-1 text-xs" onFocus={(e) => e.currentTarget.select()} data-preview-link />
                <button type="button" className={btn} onClick={() => navigator.clipboard?.writeText(preview)}>
                  نسخ
                </button>
                <a href={preview} target="_blank" rel="noopener" className={btn}>
                  فتح
                </a>
                <button type="button" className="underline" onClick={() => setPreview("")}>
                  إغلاق
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-[118px]">
        <PageView bundle={bundle} edit={edit} />
      </div>

      {drawer && (
        <Panel title={drawerTitle(drawer)} onClose={() => setDrawer(null)}>
          {drawer === "sections" && <SectionsPanel sections={sections} apply={apply} close={() => setDrawer(null)} openFields={(id) => setDrawer({ fields: id })} />}
          {drawer === "trash" && (
            <TrashPanel
              trash={trash}
              lang={lang}
              restore={async (id) => {
                try {
                  const r = await enqueue(() => api<{ content: Drafts; trash: TrashEntry[] }>(`page/${slug}/trash/${id}/restore`, { method: "POST" }));
                  setContent(r.content);
                  setTrash(r.trash);
                  setUnpublished(true);
                  setNotice("استُعيد القسم في مكانه.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "تعذّرت الاستعادة.");
                }
              }}
            />
          )}
          {drawer === "versions" && (
            <VersionsPanel
              versions={versions}
              restore={async (id) => {
                if (!window.confirm("استعادة هذه النسخة إلى المسودة؟ تحلّ محلّ المسودة الحالية في كل اللغات، ثم اضغط «نشر» لإعادتها للزوار.")) return;
                try {
                  const r = await enqueue(() => api<{ content: Drafts; settings: PageSettings; unpublished: boolean }>(`page/${slug}/versions/${id}/restore`, { method: "POST" }));
                  setContent(r.content);
                  setSettings(r.settings);
                  setUnpublished(r.unpublished);
                  setNotice("استُعيدت النسخة إلى المسودة. راجعها ثم اضغط «نشر».");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "تعذّرت الاستعادة.");
                }
              }}
            />
          )}
          {drawer === "settings" && (
            <SettingsPanel
              site={site}
              lang={lang}
              meta={meta}
              settings={settings}
              content={content}
              saveSettings={saveSettings}
              apply={apply}
              saveMeta={async (patch) => {
                try {
                  const r = await enqueue(() => api<{ meta: PageMeta }>(`page/${slug}/meta`, { method: "PATCH", body: patch }));
                  setMeta(r.meta);
                  if (r.meta.slug !== slug) window.location.assign(`/admin/edit/${r.meta.slug}/${lang}`);
                  else setNotice("حُفظ اسم الدورة.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "تعذّر الحفظ.");
                }
              }}
            />
          )}
          {drawer === "texts" && <TextsPanel lang={lang} content={content} fallback={site.fallbackLanguage} apply={apply} />}
          {typeof drawer === "object" && (
            <FieldsPanel
              base={drawer.fields === "header" ? ["header"] : drawer.fields === "footer" ? ["footer"] : ["sections", `#${drawer.fields}`, "fields"]}
              value={getAt(content[lang], drawer.fields === "header" ? ["header"] : drawer.fields === "footer" ? ["footer"] : ["sections", `#${drawer.fields}`, "fields"])}
              lang={lang}
              sectionIds={sections.map((s) => s.id)}
              apply={apply}
              pickImage={(path, img) => setImage({ path, image: img })}
            />
          )}
        </Panel>
      )}

      {share && (
        <ShareDialog
          site={site}
          meta={meta}
          lang={lang}
          content={content}
          sectionId={share}
          published={published}
          unpublished={unpublished}
          onClose={() => setShare(null)}
          setError={setError}
        />
      )}

      {image && (
        <ImageDialog
          site={site}
          content={content}
          path={image.path}
          onClose={() => setImage(null)}
          apply={apply}
          setError={setError}
        />
      )}
    </div>
  );
}

function drawerTitle(d: Exclude<Drawer, null>) {
  if (typeof d === "object") return d.fields === "header" ? "حقول الترويسة" : d.fields === "footer" ? "حقول التذييل" : "حقول القسم";
  return { sections: "الأقسام", texts: "نصوص أخرى", settings: "إعدادات الصفحة", versions: "النسخ المنشورة", trash: "سلة المحذوفات" }[d];
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside role="dialog" aria-label={title} className="fixed inset-y-0 start-0 z-[80] flex w-full max-w-md flex-col bg-[#fbf6ea] text-[#071027] shadow-2xl" dir="rtl" lang="ar">
      <div className="flex items-center justify-between border-b border-[#071027]/10 px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" className={lightBtn} onClick={onClose}>
          إغلاق
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </aside>
  );
}

// ── Sections: drag to reorder, hide/show, duplicate, delete, add ─────────────────────────────
function SectionsPanel({ sections, apply, close, openFields }: { sections: { id: string; type: (typeof SECTION_TYPES)[number]; hidden?: boolean; fields: Record<string, unknown> }[]; apply: (ops: Op[]) => void; close: () => void; openFields: (id: string) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [type, setType] = useState<(typeof SECTION_TYPES)[number]>("richtext");
  return (
    <div>
      <p className="text-sm text-[#071027]/70">اسحب قسمًا لتغيير ترتيبه. التغييرات تسري على كل اللغات.</p>
      <ol className="mt-4 space-y-2" data-sections-list>
        {sections.map((s, i) => (
          <li
            key={s.id}
            data-section-row={s.id}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", s.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || (drag !== null ? sections[drag]?.id : undefined);
              setDrag(null);
              setOver(null);
              if (id && sections[i]?.id !== id) apply([{ op: "moveSection", id, to: i }]);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            className={`flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ${over === i ? "ring-2 ring-[#d0a348]" : "ring-[#071027]/10"} ${s.hidden ? "opacity-60" : ""}`}
          >
            <span className="cursor-grab select-none px-1 text-lg text-[#071027]/40" aria-hidden>
              ⋮⋮
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-start"
              onClick={() => {
                close();
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="block text-sm font-semibold">{SECTION_LABELS[s.type]}</span>
              <span className="block truncate text-xs text-[#071027]/60">{sectionTitle(s as never) || `#${s.id}`}</span>
            </button>
            {s.hidden && <span className="rounded-full bg-gray-200 px-2 text-[11px]">مخفي</span>}
            <div className="flex shrink-0 gap-1">
              <button type="button" className="rounded px-1.5 text-xs hover:bg-[#d0a348]/20" title="تحريك للأعلى" disabled={i === 0} onClick={() => apply([{ op: "moveSection", id: s.id, to: i - 1 }])}>
                ↑
              </button>
              <button type="button" className="rounded px-1.5 text-xs hover:bg-[#d0a348]/20" title="تحريك للأسفل" disabled={i === sections.length - 1} onClick={() => apply([{ op: "moveSection", id: s.id, to: i + 1 }])}>
                ↓
              </button>
              <button type="button" className="rounded px-1.5 text-xs hover:bg-[#d0a348]/20" onClick={() => apply([{ op: "setHidden", id: s.id, hidden: !s.hidden }])}>
                {s.hidden ? "إظهار" : "إخفاء"}
              </button>
              <button type="button" className="rounded px-1.5 text-xs hover:bg-[#d0a348]/20" onClick={() => apply([{ op: "duplicateSection", id: s.id }])}>
                تكرار
              </button>
              <button type="button" className="rounded px-1.5 text-xs hover:bg-[#d0a348]/20" onClick={() => openFields(s.id)}>
                الحقول
              </button>
              <button
                type="button"
                className="rounded px-1.5 text-xs text-red-700 hover:bg-red-100"
                onClick={() => {
                  if (window.confirm("حذف هذا القسم من كل اللغات؟ يبقى في سلة المحذوفات 30 يومًا.")) apply([{ op: "deleteSection", id: s.id }]);
                }}
              >
                حذف
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex gap-2 rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
        <select className={input} value={type} onChange={(e) => setType(e.target.value as (typeof SECTION_TYPES)[number])} aria-label="نوع القسم الجديد">
          {SECTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {SECTION_LABELS[t]}
            </option>
          ))}
        </select>
        <button type="button" className={darkPrimary} onClick={() => apply([{ op: "addSection", type }])}>
          إضافة في النهاية
        </button>
      </div>
    </div>
  );
}

function TrashPanel({ trash, lang, restore }: { trash: TrashEntry[]; lang: string; restore: (id: string) => void }) {
  const [now] = useState(() => Date.now());
  if (!trash.length) return <p className="text-sm text-[#071027]/70">سلة المحذوفات فارغة. الأقسام المحذوفة تبقى هنا 30 يومًا.</p>;
  return (
    <ul className="space-y-2" data-trash-list>
      {trash.map((t) => {
        const days = Math.max(0, 30 - Math.floor((now - Date.parse(t.deletedAt)) / 86_400_000));
        const title = (t.sections[lang] && sectionTitle(t.sections[lang])) || t.title;
        return (
          <li key={t.id + t.deletedAt} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{SECTION_LABELS[t.type]}</p>
              <p className="truncate text-xs text-[#071027]/60">{title}</p>
              <p className="text-[11px] text-[#071027]/50">
                حُذف {arDate(t.deletedAt)} · يبقى {days} يومًا
              </p>
            </div>
            <button type="button" className={lightBtn} onClick={() => restore(t.id)}>
              استعادة
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function VersionsPanel({ versions, restore }: { versions: VersionInfo[]; restore: (id: string) => void }) {
  return (
    <div>
      <p className="text-sm text-[#071027]/70">كل نشر يحفظ نسخة (آخر 30 نسخة). الاستعادة تضع النسخة في المسودة، ثم «نشر» يعيدها للزوار.</p>
      {versions.length === 0 ? (
        <p className="mt-4 text-sm">لا توجد نسخ منشورة بعد.</p>
      ) : (
        <ul className="mt-4 space-y-2" data-versions-list>
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {arDate(v.publishedAt)} {i === 0 && <span className="ms-1 rounded-full bg-emerald-100 px-2 text-[11px] text-emerald-800">المنشورة حاليًا</span>}
                </p>
                {v.note && <p className="truncate text-xs text-[#071027]/60">{v.note}</p>}
              </div>
              <button type="button" className={lightBtn} onClick={() => restore(v.id)}>
                استعادة إلى المسودة
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Page settings ────────────────────────────────────────────────────────────────────────────
function LockupPicker({ label, value, onChange }: { label: string; value: LockupSetting; onChange: (v: LockupSetting) => void }) {
  const scheme = resolveScheme(value);
  return (
    <fieldset className="rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          الخلفية (للاختيار التلقائي)
          <select className={input} value={value.tone} onChange={(e) => onChange({ ...value, tone: e.target.value as Tone })}>
            {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
              <option key={t} value={t}>
                {TONE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          نظام الألوان
          <select className={input} value={String(value.scheme)} onChange={(e) => onChange({ ...value, scheme: e.target.value === "auto" ? "auto" : (Number(e.target.value) as Scheme) })}>
            <option value="auto">تلقائي حسب الخلفية</option>
            {([1, 2, 3, 4] as Scheme[]).map((n) => (
              <option key={n} value={n}>
                {n} · {SCHEMES[n].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: SCHEMES[scheme].bg, color: SCHEMES[scheme].fg }}>
        <Emblem className="h-6 w-auto" style={{ color: SCHEMES[scheme].fg }} />
        النظام المستخدم: {scheme} · {SCHEMES[scheme].name}
      </div>
    </fieldset>
  );
}

function SettingsPanel({
  site,
  lang,
  meta,
  settings,
  content,
  saveSettings,
  saveMeta,
  apply,
}: {
  site: SiteConfig;
  lang: string;
  meta: PageMeta;
  settings: PageSettings;
  content: Drafts;
  saveSettings: (s: PageSettings) => void;
  saveMeta: (patch: { courseName?: string; slug?: string }) => void;
  apply: (ops: Op[]) => void;
}) {
  const [name, setName] = useState(meta.courseName);
  const [slugInput, setSlugInput] = useState(meta.slug);
  const [s, setS] = useState(settings);
  const standard = meta.slug === site.standardPage;
  const seo = content[lang]?.seo;
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-semibold">الدورة</h3>
        <label className="block text-sm">
          اسم الدورة
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          الرابط المختصر {standard && <span className="text-xs text-[#071027]/60">(الصفحة القياسية تبقى على الرابط الرئيسي)</span>}
          <input className={input} dir="ltr" disabled={standard} value={slugInput} onChange={(e) => setSlugInput(e.target.value.toLowerCase())} />
        </label>
        <button type="button" className={darkPrimary} onClick={() => saveMeta({ courseName: name, ...(standard || slugInput === meta.slug ? {} : { slug: slugInput }) })}>
          حفظ الاسم والرابط
        </button>
      </section>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveSettings(s);
        }}
      >
        <section className="space-y-2">
          <h3 className="font-semibold">الدفع (Whop)</h3>
          {(
            [
              ["standard", "النموذج القياسي: الدورتان العادية والمكثّفة مع كود الخصم ومجموعات واتساب"],
              ["plan", "خطة Whop واحدة مضمّنة في الصفحة"],
              ["link", "زر يفتح رابط الدفع في Whop"],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="flex items-start gap-2 text-sm">
              <input type="radio" name="mode" checked={s.checkout.mode === mode} onChange={() => setS({ ...s, checkout: { ...s.checkout, mode } })} className="mt-1" />
              {label}
            </label>
          ))}
          {s.checkout.mode === "standard" && (
            <label className="block text-sm">
              كود العرض المطبَّق تلقائيًا (فارغ = بلا عرض)
              <input className={input} dir="ltr" value={s.checkout.promoCode ?? ""} onChange={(e) => setS({ ...s, checkout: { ...s.checkout, promoCode: e.target.value.trim().toUpperCase() } })} placeholder="KONUSMA40" data-promo-code />
              <span className="mt-1 block text-xs text-[#071027]/60">يُطبَّق عند فتح الصفحة، فيظهر السعر القديم مشطوبًا والسعر بعد الخصم، ويُدفع السعر بعد الخصم. يجب أن يكون الكود معرَّفًا على الخادم.</span>
            </label>
          )}
          {s.checkout.mode === "plan" && (
            <label className="block text-sm">
              معرّف الخطة (plan_…)
              <input className={input} dir="ltr" value={s.checkout.planId} onChange={(e) => setS({ ...s, checkout: { ...s.checkout, planId: e.target.value.trim() } })} placeholder="plan_XXXXXXXX" />
            </label>
          )}
          {s.checkout.mode === "link" && (
            <label className="block text-sm">
              رابط الدفع
              <input className={input} dir="ltr" value={s.checkout.url} onChange={(e) => setS({ ...s, checkout: { ...s.checkout, url: e.target.value.trim() } })} placeholder="https://whop.com/checkout/…" />
            </label>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">واتساب</h3>
          <label className="block text-sm">
            الرقم مع رمز الدولة (أرقام فقط)
            <input className={input} dir="ltr" value={s.whatsapp.number} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, number: e.target.value.replace(/\D/g, "") } })} />
          </label>
          {site.languages.map((l) => (
            <label key={l.code} className="block text-sm">
              الرسالة الجاهزة — {l.label}
              <textarea rows={2} className={input} dir={l.dir} value={s.whatsapp.message[l.code] ?? ""} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, message: { ...s.whatsapp.message, [l.code]: e.target.value } } })} />
            </label>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">ألوان الشعار</h3>
          <p className="text-xs text-[#071027]/70">تلقائي: ذهبي فاتح على الكحلي، وكحلي على الكريمي أو الذهبي الخردلي. يمكن فرض نظام لكل قسم.</p>
          <LockupPicker label="الترويسة" value={s.lockup.header} onChange={(v) => setS({ ...s, lockup: { ...s.lockup, header: v } })} />
          <LockupPicker label="التذييل" value={s.lockup.footer} onChange={(v) => setS({ ...s, lockup: { ...s.lockup, footer: v } })} />
          <button type="button" className={lightBtn} onClick={() => setS({ ...s, lockup: { header: s.lockup.header, footer: { ...s.lockup.header } } })}>
            تطبيق اختيار الترويسة على الصفحة كلها
          </button>
        </section>

        <button type="submit" className={darkPrimary} data-save-settings>
          حفظ إعدادات الصفحة
        </button>
      </form>

      {seo && (
        <section className="space-y-2">
          <h3 className="font-semibold">محركات البحث والمشاركة — {site.languages.find((l) => l.code === lang)?.label}</h3>
          {(
            [
              ["title", "عنوان الصفحة"],
              ["description", "الوصف"],
              ["shareDescription", "وصف المشاركة"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block text-sm">
              {label}
              <textarea
                key={`${lang}-${k}-${seo[k]}`}
                rows={k === "title" ? 1 : 2}
                className={input}
                defaultValue={seo[k]}
                onBlur={(e) => {
                  if (e.currentTarget.value !== seo[k]) apply([{ op: "setText", lang, path: ["seo", k], value: e.currentTarget.value }]);
                }}
              />
            </label>
          ))}
          <div className="text-sm">
            صورة المشاركة
            <div className="mt-1 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {seo.image && <img src={seo.image} alt="" className="h-16 w-28 rounded-lg object-cover ring-1 ring-[#071027]/10" />}
              <label className={lightBtn + " cursor-pointer"}>
                {uploading ? "جارٍ الرفع…" : "رفع صورة"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const form = new FormData();
                      form.append("file", file);
                      const r = await api<{ src: string }>("media", { form });
                      apply([{ op: "setText", lang, path: ["seo", "image"], value: r.src }]);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </section>
      )}
      <p className="rounded-xl bg-white p-3 text-xs text-[#071027]/70 ring-1 ring-[#071027]/10">أحداث Umami تتبع هذه الصفحة تلقائيًا: كل حدث يحمل رابط الصفحة المختصر ولغتها.</p>
    </div>
  );
}

// ── Other texts: the page's interface strings (form, payment, WhatsApp step …) ───────────────
function TextsPanel({ lang, content, fallback, apply }: { lang: string; content: Drafts; fallback: string; apply: (ops: Op[]) => void }) {
  const ui = content[lang]?.ui ?? {};
  const fb = content[fallback]?.ui ?? {};
  const keys = Array.from(new Set([...Object.keys(fb), ...Object.keys(ui)])).sort();
  const used = new Set<string>();
  return (
    <div className="space-y-6">
      <p className="text-sm text-[#071027]/70">نصوص لا تظهر كنص قابل للنقر في الصفحة: نموذج التسجيل والدفع ورسائله. الحقل الفارغ يعرض النص الإنجليزي.</p>
      {UI_GROUPS.map(([prefix, title]) => {
        const group = keys.filter((k) => !used.has(k) && (prefix ? k.startsWith(prefix) : true));
        group.forEach((k) => used.add(k));
        if (!group.length) return null;
        return (
          <section key={prefix || "misc"}>
            <h3 className="mb-2 font-semibold">{title}</h3>
            <div className="space-y-2">
              {group.map((k) => (
                <label key={k} className="block text-xs">
                  <span dir="ltr" className="font-mono text-[11px] text-[#071027]/60">
                    {k}
                  </span>
                  <input
                    key={`${lang}-${k}-${ui[k] ?? ""}`}
                    className={input}
                    defaultValue={ui[k] ?? ""}
                    placeholder={fb[k]}
                    data-ui-key={k}
                    onBlur={(e) => {
                      if (e.currentTarget.value !== (ui[k] ?? "")) apply([{ op: "setText", lang, path: ["ui", k], value: e.currentTarget.value }]);
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── A section's fields (links, switches and anything not clickable on the page) ──────────────
const FIELD_LABELS: Record<string, string> = {
  label: "النص",
  target: "ينتقل إلى القسم",
  course: "الدورة (السعر من بيانات الدورة)",
  imageSide: "موضع الصورة",
  href: "الرابط",
  consent: "موافقة المتعلّم على النشر",
  showDiscount: "إظهار حقل كود الخصم",
  title: "العنوان",
  text: "النص",
  eyebrow: "السطر العلوي",
  intro: "المقدمة",
  name: "الاسم",
  button: "الزر",
  primary: "الزر الأول",
  secondary: "الزر الثاني",
  cta: "زر التسجيل",
  mobileCta: "شريط التسجيل في الهاتف",
  nav: "روابط الترويسة",
  social: "الحسابات",
  contact: "جملة التواصل",
  image: "الصورة",
};

function FieldsPanel({ base, value, lang, sectionIds, apply, pickImage }: { base: string[]; value: unknown; lang: string; sectionIds: string[]; apply: (ops: Op[]) => void; pickImage: (path: string[], img: ImageField) => void }) {
  if (!value || typeof value !== "object") return <p className="text-sm">لا توجد حقول.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-[#071027]/70">النصوص هنا لهذه اللغة؛ الروابط والخيارات تسري على كل اللغات.</p>
      <FieldTree path={base} value={value as Record<string, unknown>} lang={lang} sectionIds={sectionIds} apply={apply} pickImage={pickImage} />
    </div>
  );
}

function FieldTree({ path, value, lang, sectionIds, apply, pickImage }: { path: string[]; value: Record<string, unknown>; lang: string; sectionIds: string[]; apply: (ops: Op[]) => void; pickImage: (path: string[], img: ImageField) => void }) {
  return (
    <div className="space-y-3">
      {Object.entries(value).map(([k, v]) => {
        if (k === "id") return null;
        const p = [...path, k];
        const label = FIELD_LABELS[k] ?? k;
        const shared = SHARED_KEYS.has(k);
        if (typeof v === "boolean")
          return (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v} onChange={(e) => apply([{ op: "setValue", path: p, value: e.target.checked }])} />
              {label}
            </label>
          );
        if (typeof v === "string") {
          if (k === "target")
            return (
              <label key={k} className="block text-xs">
                {label}
                <select className={input} value={v} onChange={(e) => apply([{ op: "setValue", path: p, value: e.target.value }])}>
                  <option value="">—</option>
                  {sectionIds.map((id) => (
                    <option key={id} value={id}>
                      #{id}
                    </option>
                  ))}
                </select>
              </label>
            );
          if (k === "course")
            return (
              <label key={k} className="block text-xs">
                {label}
                <select className={input} value={v} onChange={(e) => apply([{ op: "setValue", path: p, value: e.target.value }])}>
                  <option value="">سعر مكتوب يدويًا</option>
                  <option value="regular">الدورة العادية</option>
                  <option value="intensive">الدورة المكثّفة (+)</option>
                </select>
              </label>
            );
          if (k === "imageSide")
            return (
              <label key={k} className="block text-xs">
                {label}
                <select className={input} value={v} onChange={(e) => apply([{ op: "setValue", path: p, value: e.target.value }])}>
                  <option value="end">بعد النص</option>
                  <option value="start">قبل النص</option>
                </select>
              </label>
            );
          const long = k.endsWith("Html") || v.length > 80;
          const Tag = long ? "textarea" : "input";
          return (
            <label key={k} className="block text-xs">
              {label}
              {k.endsWith("Html") && <span className="text-[#071027]/50"> (HTML: b, i, a, ul, ol, li)</span>}
              <Tag
                key={`${lang}-${p.join("/")}-${v}`}
                className={input}
                defaultValue={v}
                dir={shared ? "ltr" : undefined}
                {...(long ? { rows: 3 } : {})}
                onBlur={(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  const next = e.currentTarget.value;
                  if (next === v) return;
                  apply([shared ? { op: "setValue", path: p, value: next } : { op: "setText", lang, path: p, value: next }]);
                }}
              />
            </label>
          );
        }
        if (Array.isArray(v))
          return (
            <fieldset key={k} className="rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
              <legend className="px-1 text-sm font-semibold">{label}</legend>
              <div className="space-y-3">
                {v.map((item, i) => {
                  const it = item as Record<string, unknown>;
                  const id = typeof it["id"] === "string" ? it["id"] : null;
                  if (!id) return null;
                  return (
                    <div key={id} className="rounded-lg border border-[#071027]/10 p-2">
                      <FieldTree path={[...p, `#${id}`]} value={it} lang={lang} sectionIds={sectionIds} apply={apply} pickImage={pickImage} />
                      <div className="mt-2 flex gap-1 text-xs">
                        <button type="button" className={lightBtn} disabled={i === 0} onClick={() => apply([{ op: "listMove", path: p, id, to: i - 1 }])}>
                          ↑
                        </button>
                        <button type="button" className={lightBtn} disabled={i === v.length - 1} onClick={() => apply([{ op: "listMove", path: p, id, to: i + 1 }])}>
                          ↓
                        </button>
                        <button type="button" className={lightBtn} onClick={() => apply([{ op: "listDelete", path: p, id }])}>
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button type="button" className={lightBtn} onClick={() => apply([{ op: "listAdd", path: p }])}>
                  + إضافة عنصر
                </button>
              </div>
            </fieldset>
          );
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if ("src" in o && "alt" in o)
            return (
              <div key={k} className="flex items-center gap-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {typeof o["src"] === "string" && o["src"] && <img src={o["src"]} alt="" className="h-14 w-20 rounded object-cover" />}
                <button type="button" className={lightBtn} onClick={() => pickImage(p, { src: String(o["src"] ?? ""), alt: String(o["alt"] ?? "") })}>
                  {label}: تغيير
                </button>
              </div>
            );
          return (
            <fieldset key={k} className="rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
              <legend className="px-1 text-sm font-semibold">{label}</legend>
              <FieldTree path={p} value={o} lang={lang} sectionIds={sectionIds} apply={apply} pickImage={pickImage} />
            </fieldset>
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Image dialog: upload (converted to WebP on the server) and alt text in every language ─────
function ImageDialog({ site, content, path, onClose, apply, setError }: { site: SiteConfig; content: Drafts; path: string[]; onClose: () => void; apply: (ops: Op[]) => void; setError: (s: string) => void }) {
  const current = getAt(content[site.fallbackLanguage] ?? Object.values(content)[0], path) as ImageField | undefined;
  const [src, setSrc] = useState(current?.src ?? "");
  const [alts, setAlts] = useState<Record<string, string>>(() => Object.fromEntries(site.languages.map((l) => [l.code, String((getAt(content[l.code], path) as ImageField | undefined)?.alt ?? "")])));
  const [busy, setBusy] = useState(false);
  const save = () => {
    const ops: Op[] = [];
    if (src !== (current?.src ?? "")) ops.push({ op: "setImage", path, src });
    for (const l of site.languages) {
      const before = String((getAt(content[l.code], path) as ImageField | undefined)?.alt ?? "");
      if (alts[l.code] !== before) ops.push({ op: "setAlt", lang: l.code, path, value: alts[l.code] ?? "" });
    }
    if (ops.length) apply(ops);
    onClose();
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="الصورة" className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" dir="rtl" lang="ar">
      <div className="w-full max-w-lg rounded-3xl bg-[#fbf6ea] p-6 text-[#071027] shadow-2xl">
        <h2 className="text-lg font-semibold">الصورة</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" className="mt-4 max-h-56 w-full rounded-2xl object-contain ring-1 ring-[#071027]/10" /> : <p className="mt-4 rounded-2xl border-2 border-dashed border-[#d0a348] p-8 text-center text-sm">لا توجد صورة</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className={lightBtn + " cursor-pointer"}>
            {busy ? "جارٍ الرفع…" : "رفع صورة جديدة"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              data-image-upload
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) {
                  setError("الحد الأقصى لحجم الصورة 10 ميغابايت.");
                  return;
                }
                setBusy(true);
                try {
                  const form = new FormData();
                  form.append("file", file);
                  setSrc((await api<{ src: string }>("media", { form })).src);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "تعذّر رفع الصورة.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {src && (
            <button type="button" className={lightBtn} onClick={() => setSrc("")}>
              إزالة الصورة
            </button>
          )}
          <span className="text-xs text-[#071027]/60">تُحوَّل إلى WebP وتُزال بياناتها الوصفية. الحد 10 ميغابايت.</span>
        </div>
        <div className="mt-4 space-y-2">
          {site.languages.map((l) => (
            <label key={l.code} className="block text-sm">
              النص البديل — {l.label}
              <input className={input} dir={l.dir} lang={l.code} value={alts[l.code] ?? ""} data-alt={l.code} onChange={(e) => setAlts({ ...alts, [l.code]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <button type="button" className={darkPrimary} onClick={save} disabled={busy} data-image-save>
            حفظ
          </button>
          <button type="button" className={lightBtn} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Share a section (from the panel only): its public link, share buttons and an image ───────
const HIDE_IN_IMAGE = ".cms-section-bar, .cms-item-tools, .cms-add-section, .cms-fields-btn, .cms-add";

function ShareDialog({
  site,
  meta,
  lang,
  content,
  sectionId,
  published,
  unpublished,
  onClose,
  setError,
}: {
  site: SiteConfig;
  meta: PageMeta;
  lang: string;
  content: Drafts;
  sectionId: string;
  published: boolean;
  unpublished: boolean;
  onClose: () => void;
  setError: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const section = content[lang]?.sections.find((x) => x.id === sectionId);
  if (!section) return null;
  const url = `${window.location.origin}${pageHref(site, meta.slug, lang)}#${sectionId}`;
  const text = sectionTitle(section) || content[lang]?.seo.title || site.brand.latin;
  const e = encodeURIComponent;
  const targets: [string, string][] = [
    ["واتساب", `https://wa.me/?text=${e(`${text}\n${url}`)}`],
    ["فيسبوك", `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`],
    ["X", `https://x.com/intent/post?text=${e(text)}&url=${e(url)}`],
    ["تيليغرام", `https://t.me/share/url?url=${e(url)}&text=${e(text)}`],
    ["لينكدإن", `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`],
  ];
  const warn = meta.archived
    ? "الصفحة مؤرشفة، فلن يفتح الرابط للزوار حتى تُستعاد."
    : !published
      ? "الصفحة لم تُنشر بعد، فلن يفتح الرابط للزوار حتى تضغط «نشر»."
      : section.hidden
        ? "هذا القسم مخفي، فلن يجده الزوار حتى تُظهره وتنشر."
        : unpublished
          ? "في المسودة تعديلات غير منشورة؛ يرى الزوار النسخة المنشورة حتى تضغط «نشر»."
          : "";

  /** The section as a PNG, as it looks on the page in this language (without the panel's buttons). */
  const image = async (): Promise<Blob | null> => {
    const el = document.getElementById(sectionId);
    if (!el) return null;
    (document.activeElement as HTMLElement | null)?.blur();
    const { toBlob } = await import("html-to-image");
    const bg = getComputedStyle(el).backgroundColor;
    return toBlob(el, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#fbf8f1",
      filter: (n) => !(n instanceof HTMLElement && n.matches(HIDE_IN_IMAGE)),
    });
  };
  const fileName = `${meta.slug}-${sectionId}-${lang}.png`;
  const download = async () => {
    setBusy(true);
    try {
      const blob = await image();
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      setError("تعذّر تجهيز الصورة. جرّب مجددًا.");
    } finally {
      setBusy(false);
    }
  };
  const nativeShare = async () => {
    try {
      const blob = await image().catch(() => null);
      const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: text, text: `${text}\n${url}` });
      else await navigator.share({ title: text, text, url });
    } catch {
      // The share sheet was closed.
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="مشاركة القسم" className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" dir="rtl" lang="ar" data-share-dialog>
      <div className="w-full max-w-lg rounded-3xl bg-[#fbf6ea] p-6 text-[#071027] shadow-2xl">
        <h2 className="text-lg font-semibold">مشاركة: {SECTION_LABELS[section.type]}</h2>
        <p className="mt-1 truncate text-sm text-[#071027]/70">{text}</p>
        <p className="mt-1 text-xs text-[#071027]/60">زر المشاركة يظهر في لوحة التحكم فقط، ولا يراه الزوار.</p>
        {warn && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warn}</p>}
        <label className="mt-4 block text-sm">
          رابط القسم ({site.languages.find((l) => l.code === lang)?.label})
          <span className="mt-1 flex gap-2">
            <input readOnly dir="ltr" value={url} className={input} onFocus={(ev) => ev.currentTarget.select()} data-share-url />
            <button
              type="button"
              className={lightBtn}
              onClick={async () => {
                await navigator.clipboard?.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? "نُسخ" : "نسخ"}
            </button>
          </span>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {targets.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={lightBtn} data-share-target={label}>
              {label}
            </a>
          ))}
          {typeof navigator.share === "function" && (
            <button type="button" className={lightBtn} onClick={nativeShare}>
              مشاركة من الجهاز…
            </button>
          )}
        </div>
        <div className="mt-5 rounded-xl bg-white p-3 ring-1 ring-[#071027]/10">
          <p className="text-sm font-semibold">صورة القسم لإنستغرام والقصص</p>
          {section.type === "payment" ? (
            <p className="mt-1 text-xs text-[#071027]/60">قسم الدفع لا يُصوَّر (النموذج تفاعلي)؛ شارك رابطه.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[#071027]/60">صورة PNG للقسم كما يظهر في الصفحة بهذه اللغة، دون أزرار اللوحة.</p>
              <button type="button" className={darkPrimary + " mt-2"} onClick={download} disabled={busy} data-share-image>
                {busy ? "جارٍ التجهيز…" : "تنزيل الصورة"}
              </button>
            </>
          )}
        </div>
        <div className="mt-6">
          <button type="button" className={lightBtn} onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
