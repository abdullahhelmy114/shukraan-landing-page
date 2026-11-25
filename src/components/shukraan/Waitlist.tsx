"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DAYS, LEVELS, TIME_SLOT_KEYS, type Day, type Level, type TimeSlot } from "@/lib/groups";
import type { CourseType, Gender } from "./data";
import { usePage } from "./page/context";

const field =
  "w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";
const label = "mb-1.5 block text-xs font-medium text-foreground";
const choice = "flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-primary";

type Form = { name: string; whatsapp: string; course: CourseType; gender: Gender | ""; level: Level | ""; days: Day[]; time: TimeSlot | ""; note: string; consent: boolean };
const EMPTY: Form = { name: "", whatsapp: "", course: "regular", gender: "", level: "", days: [], time: "", note: "", consent: false };

/**
 * «Bekleme listesine katıl»: under the groups. The entry goes to /api/public/waitlist and is kept on
 * the server only; nothing about it comes back to the page but whether it was saved.
 */
export function Waitlist() {
  const { t, edit } = usePage();
  const [f, setF] = useState<Form>(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const privacy = t("waitlist.privacyUrl");
  const privacyHref = privacy.startsWith("/") || privacy.startsWith("https://") ? privacy : "";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    const form = e.currentTarget;
    const firstDay = form.querySelector<HTMLInputElement>('input[name="waitlist-day"]');
    firstDay?.setCustomValidity(f.days.length ? "" : t("waitlist.days.required"));
    for (const c of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[required],textarea[required]"))
      if (c.type === "text" || c.type === "tel") c.setCustomValidity(c.value.trim() ? "" : t("form.required"));
    if (!form.reportValidity()) return;
    setState("sending");
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, note: f.note.trim() }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const code = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error;
      setErr(t(code === "duplicate" ? "waitlist.duplicate" : code === "rate" ? "waitlist.rate" : "waitlist.error"));
    } catch {
      setErr(t("waitlist.error"));
    }
    setState("idle");
  };

  return (
    <div id="bekleme" className="reveal mt-14 scroll-mt-24 rounded-3xl bg-card p-6 shadow-elegant ring-1 ring-gold/25 sm:p-8">
      <h3 className="text-2xl font-semibold text-primary sm:text-3xl">{t("waitlist.title")}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("waitlist.intro")}</p>
      {state === "done" ? (
        <p role="status" data-waitlist-done className="mt-6 rounded-2xl bg-secondary p-4 text-sm font-medium text-primary">
          {t("waitlist.thanks")}
        </p>
      ) : (
        <form onSubmit={submit} onInput={(e) => (e.target as HTMLInputElement).setCustomValidity?.("")} className="mt-6">
          <fieldset disabled={!!edit || state === "sending"} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="waitlist-name">{t("waitlist.name")}</label>
              <input id="waitlist-name" required minLength={2} maxLength={120} autoComplete="given-name" className={field} value={f.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="waitlist-phone">{t("waitlist.phone")}</label>
              <input id="waitlist-phone" required type="tel" dir="ltr" pattern="\+?[0-9 ()\-]{8,}" autoComplete="tel" className={field} value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder={t("form.phone.placeholder")} />
            </div>
            <fieldset>
              <legend className={label}>{t("waitlist.course")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["regular", "intensive"] as CourseType[]).map((c) => (
                  <label key={c} className={choice}>
                    <input type="radio" name="waitlist-course" required checked={f.course === c} onChange={() => set("course", c)} className="accent-primary" />
                    {t(`waitlist.course.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={label}>{t("waitlist.gender")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["Kadın", "Erkek"] as Gender[]).map((g) => (
                  <label key={g} className={choice}>
                    <input type="radio" name="waitlist-gender" required checked={f.gender === g} onChange={() => set("gender", g)} className="accent-primary" />
                    {t(g === "Kadın" ? "waitlist.gender.female" : "waitlist.gender.male")}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={label}>{t("waitlist.level")}</legend>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((l) => (
                  <label key={l} className={choice} dir="ltr">
                    <input type="radio" name="waitlist-level" required checked={f.level === l} onChange={() => set("level", l)} className="accent-primary" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={label}>{t("waitlist.time")}</legend>
              <div className="grid gap-2">
                {TIME_SLOT_KEYS.map((s) => (
                  <label key={s} className={choice}>
                    <input type="radio" name="waitlist-time" required checked={f.time === s} onChange={() => set("time", s)} className="accent-primary" />
                    {t(`waitlist.time.${s}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="sm:col-span-2">
              <legend className={label}>{t("waitlist.days")}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DAYS.map((d) => (
                  <label key={d} className={choice}>
                    <input
                      type="checkbox"
                      name="waitlist-day"
                      checked={f.days.includes(d)}
                      onChange={(e) => {
                        e.currentTarget.form?.querySelector<HTMLInputElement>('input[name="waitlist-day"]')?.setCustomValidity("");
                        set("days", e.currentTarget.checked ? DAYS.filter((x) => x === d || f.days.includes(x)) : f.days.filter((x) => x !== d));
                      }}
                      className="accent-primary"
                    />
                    {t(`day.${d}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="waitlist-note">{t("waitlist.note")}</label>
              <textarea id="waitlist-note" rows={3} maxLength={1000} className={field} value={f.note} onChange={(e) => set("note", e.target.value)} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-primary sm:col-span-2">
              <input type="checkbox" name="waitlist-consent" required checked={f.consent} onChange={(e) => set("consent", e.currentTarget.checked)} className="mt-1 accent-primary" />
              <span>
                {t("waitlist.consent")}
                {privacyHref && (
                  <>
                    {" "}
                    <a href={privacyHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {t("waitlist.privacy")}
                    </a>
                  </>
                )}
              </span>
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" data-waitlist-submit className="h-auto w-full whitespace-normal rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:scale-[1.02] sm:w-auto">
                {t("waitlist.submit")}
              </Button>
              {err && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {err}
                </p>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
