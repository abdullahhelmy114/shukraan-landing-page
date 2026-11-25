"use client";

import { useCallback, useState } from "react";

import type { CourseType, Gender } from "@/components/shukraan/data";
import { DAYS, LEVELS, isHour, type Day, type GroupStatus, type Level, type WaitlistEntry } from "@/lib/groups";
import { api, arDate } from "./api";
import { AdminFrame } from "./AdminFrame";
import { btn, cell, COURSE_AR, DAY_AR, GENDER_AR, input, primaryBtn, STATUS_AR, TIME_AR, waHref } from "./labels";

type Row = {
  id: string;
  label: string;
  course: CourseType;
  gender: Gender;
  level: Level | "";
  days: Day[];
  hour: string;
  status: GroupStatus;
  capacity: number;
  paid: number;
  left: number;
  now: GroupStatus;
  ownLink: boolean;
};
type Overflow = { ref: string; group: string; at: string; name?: string; whatsapp?: string; email?: string };
type Draft = Pick<Row, "level" | "days" | "hour" | "capacity">;
export type GroupsInitial = { groups: Row[]; overflow: Overflow[] };
const draftsOf = (groups: Row[]) => Object.fromEntries(groups.map((g) => [g.id, { level: g.level, days: g.days, hour: g.hour, capacity: g.capacity }]));

const NEW: { course: CourseType; gender: Gender; level: Level | ""; days: Day[]; hour: string; capacity: number } = { course: "regular", gender: "Kadın", level: "", days: ["sat"], hour: "19:00", capacity: 5 };

function DayPicker({ value, onChange }: { value: Day[]; onChange: (d: Day[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAYS.map((d) => (
        <label key={d} className="inline-flex items-center gap-1 rounded-md border border-[#071027]/15 px-1.5 py-0.5 text-xs">
          <input type="checkbox" checked={value.includes(d)} onChange={(e) => onChange(e.currentTarget.checked ? DAYS.filter((x) => x === d || value.includes(x)) : value.filter((x) => x !== d))} />
          {DAY_AR[d]}
        </label>
      ))}
    </div>
  );
}

/** «المجموعات»: each group's status, capacity, paid places and places left; opening, closing and adding groups. */
export function GroupsAdmin({ initial }: { initial: GroupsInitial }) {
  const [rows, setRows] = useState<Row[]>(initial.groups);
  const [overflow, setOverflow] = useState<Overflow[]>(initial.overflow);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => draftsOf(initial.groups));
  const [matches, setMatches] = useState<{ label: string; entries: WaitlistEntry[] } | null>(null);
  const [add, setAdd] = useState(NEW);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<GroupsInitial>("groups");
    setRows(r.groups);
    setOverflow(r.overflow);
    setDrafts(draftsOf(r.groups));
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr("");
    setMsg("");
    try {
      await fn();
      await load();
      setMsg(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "حدث خطأ.");
    }
  };

  const setStatus = (g: Row, status: GroupStatus) =>
    run(async () => {
      const r = await api<{ opened: boolean; matches: WaitlistEntry[] }>(`groups/${g.id}`, { method: "PUT", body: { status } });
      if (r.opened) setMatches({ label: g.label, entries: r.matches });
    }, status === "closed" ? "أُغلقت المجموعة وأُخفيت من الصفحة." : "حُفظت حالة المجموعة.");

  const save = (g: Row) => {
    const d = drafts[g.id]!;
    if (!isHour(d.hour) || !d.days.length) return setErr("اختر يومًا واحدًا على الأقل ووقتًا بصيغة 19:00.");
    return run(() => api(`groups/${g.id}`, { method: "PUT", body: { level: d.level, days: d.days, hour: d.hour, capacity: d.capacity } }), "حُفظت المجموعة.");
  };

  return (
    <AdminFrame title="المجموعات">
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
      <p className="mb-4 text-sm text-[#071027]/70">
        تظهر على الصفحة المجموعات المفتوحة والمكتملة فقط، دون أي أرقام. تصبح المجموعة المفتوحة مكتملة وحدها عندما تبلغ تسجيلاتها المدفوعة سعتها. لكل مجموعة ملف رابط خاص بها
        (<span dir="ltr">whatsapp-gruplari/&lt;id&gt;.txt</span>، ويُقرأ عند البناء)؛ وما لم يوجد تستعمل رابط مجتمع دورتها ونوعها.
      </p>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-[#071027]/10">
        <table data-groups-table className="w-full min-w-[880px] text-sm">
          <thead className="bg-[#071027]/5 text-xs">
            <tr>
              <th className="px-3 py-2 text-start">المجموعة</th>
              <th className="px-3 py-2 text-start">الحالة</th>
              <th className="px-3 py-2 text-start">السعة</th>
              <th className="px-3 py-2 text-start">المدفوع</th>
              <th className="px-3 py-2 text-start">المتبقي</th>
              <th className="px-3 py-2 text-start">الأيام والوقت والمستوى</th>
              <th className="px-3 py-2 text-start">الرابط</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const d = drafts[g.id] ?? g;
              const setD = (p: Partial<Draft>) => setDrafts((all) => ({ ...all, [g.id]: { ...d, ...p } }));
              return (
                <tr key={g.id} data-group-row={g.id} data-now={g.now}>
                  <td className={cell}>
                    <p className="font-semibold">
                      {COURSE_AR[g.course]} · {GENDER_AR[g.gender]}
                    </p>
                    <p className="text-xs text-[#071027]/60" dir="ltr">
                      {g.id}
                    </p>
                  </td>
                  <td className={cell}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${g.now === "open" ? "bg-emerald-100 text-emerald-800" : g.now === "full" ? "bg-amber-100 text-amber-900" : "bg-gray-200 text-gray-700"}`}>{STATUS_AR[g.now]}</span>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {g.status === "closed" ? (
                        <button type="button" data-open={g.id} className={primaryBtn} onClick={() => void setStatus(g, "open")}>
                          افتح المجموعة
                        </button>
                      ) : (
                        <>
                          {g.status !== "full" && (
                            <button type="button" className={btn} onClick={() => void setStatus(g, "full")}>
                              اجعلها مكتملة
                            </button>
                          )}
                          {g.status === "full" && (
                            <button type="button" className={btn} onClick={() => void setStatus(g, "open")}>
                              أعد فتحها
                            </button>
                          )}
                          <button type="button" data-close={g.id} className={btn} onClick={() => void setStatus(g, "closed")}>
                            أغلق وأخفِ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className={cell}>
                    <input type="number" min={0} max={500} className={`${input} w-20`} value={d.capacity} onChange={(e) => setD({ capacity: Number(e.target.value) })} />
                  </td>
                  <td className={cell} data-paid>
                    {g.paid}
                  </td>
                  <td className={cell} data-left>
                    {g.left}
                  </td>
                  <td className={cell}>
                    <DayPicker value={d.days} onChange={(days) => setD({ days })} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="time" step={300} dir="ltr" className={input} value={d.hour} onChange={(e) => setD({ hour: e.target.value })} />
                      <select className={input} value={d.level} onChange={(e) => setD({ level: e.target.value as Level | "" })}>
                        <option value="">كل المستويات</option>
                        {LEVELS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                      <button type="button" className={btn} onClick={() => void save(g)}>
                        حفظ
                      </button>
                    </div>
                  </td>
                  <td className={cell}>{g.ownLink ? "رابط خاص" : "رابط المجتمع"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {matches && (
        <section data-matches className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#071027]/10">
          <h2 className="text-lg font-semibold">فُتحت المجموعة: {matches.label}</h2>
          <p className="mt-1 text-sm text-[#071027]/70">
            هؤلاء في قائمة الانتظار ويناسبهم هذا الموعد ({matches.entries.length}). لا يُرسَل إليهم شيء تلقائيًا: راسلهم بنفسك.
          </p>
          <ul className="mt-3 divide-y divide-[#071027]/10 text-sm">
            {matches.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {e.name} · {e.level} · {e.days.map((x) => DAY_AR[x]).join("، ")} · {TIME_AR[e.time]}
                </span>
                <a href={waHref(e.whatsapp)} target="_blank" rel="noopener noreferrer" dir="ltr" className="underline">
                  {e.whatsapp}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#071027]/10">
        <h2 className="text-lg font-semibold">أضف مجموعة (تُضاف مغلقة)</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={input} value={add.course} onChange={(e) => setAdd({ ...add, course: e.target.value as CourseType })}>
            <option value="regular">{COURSE_AR.regular}</option>
            <option value="intensive">{COURSE_AR.intensive}</option>
          </select>
          <select className={input} value={add.gender} onChange={(e) => setAdd({ ...add, gender: e.target.value as Gender })}>
            <option value="Kadın">{GENDER_AR.Kadın}</option>
            <option value="Erkek">{GENDER_AR.Erkek}</option>
          </select>
          <select className={input} value={add.level} onChange={(e) => setAdd({ ...add, level: e.target.value as Level | "" })}>
            <option value="">كل المستويات</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <input type="time" step={300} dir="ltr" className={input} value={add.hour} onChange={(e) => setAdd({ ...add, hour: e.target.value })} />
          <label className="text-sm">
            السعة <input type="number" min={0} max={500} className={`${input} w-20`} value={add.capacity} onChange={(e) => setAdd({ ...add, capacity: Number(e.target.value) })} />
          </label>
        </div>
        <div className="mt-2">
          <DayPicker value={add.days} onChange={(days) => setAdd({ ...add, days })} />
        </div>
        <button type="button" data-add-group className={`${primaryBtn} mt-3`} disabled={!add.days.length || !isHour(add.hour)} onClick={() => void run(() => api("groups", { method: "POST", body: add }), "أُضيفت المجموعة مغلقة. افتحها حين تريد ظهورها على الصفحة.")}>
          أضف
        </button>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#071027]/10">
        <h2 className="text-lg font-semibold">مدفوعات وصلت بعد اكتمال المجموعة</h2>
        <p className="mt-1 text-sm text-[#071027]/70">لم يحصل أصحابها على رابط واتساب، وظهرت لهم رسالة بأننا سنتواصل معهم فورًا.</p>
        {overflow.length === 0 ? (
          <p className="mt-3 text-sm text-[#071027]/60">لا شيء.</p>
        ) : (
          <ul data-overflow className="mt-3 divide-y divide-[#071027]/10 text-sm">
            {overflow.map((o) => (
              <li key={o.ref} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {arDate(o.at)} · <span dir="ltr">{o.group}</span> · {o.name}
                </span>
                <span dir="ltr">
                  {o.whatsapp && (
                    <a href={waHref(o.whatsapp)} target="_blank" rel="noopener noreferrer" className="underline">
                      {o.whatsapp}
                    </a>
                  )}{" "}
                  {o.email}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminFrame>
  );
}
