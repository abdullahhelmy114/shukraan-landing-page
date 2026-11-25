"use client";

import { useCallback, useMemo, useState } from "react";

import type { CourseType, Gender } from "@/components/shukraan/data";
import { DAYS, LEVELS, TIME_SLOT_KEYS, filterWaitlist, type DemandRow, type WaitlistEntry, type WaitlistFilter } from "@/lib/groups";
import { api, arDate } from "./api";
import { AdminFrame } from "./AdminFrame";
import { btn, cell, COURSE_AR, DAY_AR, GENDER_AR, input, primaryBtn, TIME_AR, waHref } from "./labels";

export type WaitlistInitial = { entries: WaitlistEntry[]; demand: DemandRow[]; openThreshold: number };

/** «قائمة الانتظار»: the entries with filters, CSV, deleting; the demand summary and its open-threshold. */
export function WaitlistAdmin({ initial }: { initial: WaitlistInitial }) {
  const [entries, setEntries] = useState<WaitlistEntry[]>(initial.entries);
  const [demand, setDemand] = useState<DemandRow[]>(initial.demand);
  const [threshold, setThreshold] = useState(initial.openThreshold);
  const [filter, setFilter] = useState<WaitlistFilter>({});
  const [olderThan, setOlderThan] = useState(90);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<WaitlistInitial>("waitlist");
    setEntries(r.entries);
    setDemand(r.demand);
    setThreshold(r.openThreshold);
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr("");
    setMsg("");
    try {
      const said = await fn();
      await load();
      setMsg(typeof said === "string" ? said : ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "حدث خطأ.");
    }
  };

  const shown = useMemo(() => filterWaitlist(entries, filter), [entries, filter]);
  const exportHref = `/api/admin/waitlist/export?${new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString()}`;
  const setF = (k: keyof WaitlistFilter, v: string) => setFilter((f) => ({ ...f, [k]: v || undefined }));

  return (
    <AdminFrame title="قائمة الانتظار">
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

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#071027]/10">
        <h2 className="text-lg font-semibold">ملخّص الطلب</h2>
        <p className="mt-1 text-sm text-[#071027]/70">عدد المسجّلين لكل دورة ونوع مجموعة ومستوى ووقت. يظهر «Yeni grup açılabilir» حين يبلغ السطر حدّ الفتح.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label>
            حدّ الفتح <input type="number" min={1} max={100} className={`${input} w-20`} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </label>
          <button type="button" className={btn} onClick={() => void run(() => api("groups/settings", { method: "PUT", body: { openThreshold: threshold } }), "حُفظ حدّ الفتح.")}>
            حفظ
          </button>
          <span className="text-[#071027]/60">سعة كل مجموعة تُضبط في صفحة «المجموعات».</span>
        </div>
        <table data-demand className="mt-3 w-full text-sm">
          <thead className="bg-[#071027]/5 text-xs">
            <tr>
              <th className="px-3 py-2 text-start">الدورة</th>
              <th className="px-3 py-2 text-start">النوع</th>
              <th className="px-3 py-2 text-start">المستوى</th>
              <th className="px-3 py-2 text-start">الوقت</th>
              <th className="px-3 py-2 text-start">العدد</th>
              <th className="px-3 py-2 text-start" />
            </tr>
          </thead>
          <tbody>
            {demand.map((d) => (
              <tr key={`${d.course}${d.gender}${d.level}${d.time}`} data-can-open={d.canOpen}>
                <td className={cell}>{COURSE_AR[d.course]}</td>
                <td className={cell}>{GENDER_AR[d.gender]}</td>
                <td className={cell}>{d.level}</td>
                <td className={cell}>{TIME_AR[d.time]}</td>
                <td className={cell}>{d.count}</td>
                <td className={cell}>{d.canOpen && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Yeni grup açılabilir</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#071027]/10">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="الدورة" className={input} value={filter.course ?? ""} onChange={(e) => setF("course", e.target.value)}>
            <option value="">كل الدورات</option>
            {(["regular", "intensive"] as CourseType[]).map((c) => (
              <option key={c} value={c}>
                {COURSE_AR[c]}
              </option>
            ))}
          </select>
          <select aria-label="النوع" className={input} value={filter.gender ?? ""} onChange={(e) => setF("gender", e.target.value)}>
            <option value="">كل الأنواع</option>
            {(["Kadın", "Erkek"] as Gender[]).map((g) => (
              <option key={g} value={g}>
                {GENDER_AR[g]}
              </option>
            ))}
          </select>
          <select aria-label="المستوى" className={input} value={filter.level ?? ""} onChange={(e) => setF("level", e.target.value)}>
            <option value="">كل المستويات</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select aria-label="اليوم" className={input} value={filter.day ?? ""} onChange={(e) => setF("day", e.target.value)}>
            <option value="">كل الأيام</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {DAY_AR[d]}
              </option>
            ))}
          </select>
          <select aria-label="الوقت" className={input} value={filter.time ?? ""} onChange={(e) => setF("time", e.target.value)}>
            <option value="">كل الأوقات</option>
            {TIME_SLOT_KEYS.map((t) => (
              <option key={t} value={t}>
                {TIME_AR[t]}
              </option>
            ))}
          </select>
          <a data-export href={exportHref} download className={primaryBtn}>
            تنزيل CSV
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="number" min={1} max={3650} aria-label="X" className={`${input} w-20`} value={olderThan} onChange={(e) => setOlderThan(Number(e.target.value))} />
          <button
            type="button"
            data-purge
            className={btn}
            onClick={() => {
              if (!window.confirm(`${olderThan} günden eski kayıtları sil?`)) return;
              void run(async () => {
                const r = await api<{ removed: number }>("waitlist/purge", { method: "POST", body: { days: olderThan } });
                return `حُذف ${r.removed}.`;
              }, "");
            }}
          >
            {olderThan} günden eski kayıtları sil
          </button>
        </div>
        <p className="mt-3 text-sm text-[#071027]/60">
          {shown.length} / {entries.length}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table data-waitlist-table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#071027]/5 text-xs">
              <tr>
                <th className="px-3 py-2 text-start">التاريخ</th>
                <th className="px-3 py-2 text-start">الاسم</th>
                <th className="px-3 py-2 text-start">واتساب</th>
                <th className="px-3 py-2 text-start">الدورة</th>
                <th className="px-3 py-2 text-start">النوع</th>
                <th className="px-3 py-2 text-start">المستوى</th>
                <th className="px-3 py-2 text-start">الأيام</th>
                <th className="px-3 py-2 text-start">الوقت</th>
                <th className="px-3 py-2 text-start">الملاحظة</th>
                <th className="px-3 py-2 text-start" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} data-entry={e.id}>
                  <td className={cell}>{arDate(e.at)}</td>
                  <td className={cell}>{e.name}</td>
                  <td className={cell} dir="ltr">
                    <a href={waHref(e.whatsapp)} target="_blank" rel="noopener noreferrer" className="underline">
                      {e.whatsapp}
                    </a>
                  </td>
                  <td className={cell}>{COURSE_AR[e.course]}</td>
                  <td className={cell}>{GENDER_AR[e.gender]}</td>
                  <td className={cell}>{e.level}</td>
                  <td className={cell}>{e.days.map((d) => DAY_AR[d]).join("، ")}</td>
                  <td className={cell}>{TIME_AR[e.time]}</td>
                  <td className={cell}>{e.note}</td>
                  <td className={cell}>
                    <button type="button" data-delete={e.id} className={btn} onClick={() => window.confirm("حذف هذا السجل؟") && void run(() => api(`waitlist/${e.id}`, { method: "DELETE" }), "حُذف السجل.")}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminFrame>
  );
}
