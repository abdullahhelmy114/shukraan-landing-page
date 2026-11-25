import { useEffect, useRef, useState } from "react";
import { priceFor, type CourseType, type Gender, type WhatsAppInvite } from "./data";
import { Amount, DiscountField, useDiscount } from "./discount";
import { Button } from "@/components/ui/button";
import { WHOP_PLANS } from "@/lib/whop-plans";
import {
  DONE_STEP,
  EMPTY_ANSWERS,
  PAY_STEP,
  forgetPayingStep,
  markPaid,
  onSave,
  refusedStep,
  rememberPayingStep,
  resumePoint,
  saveRegistrations,
  type Answers,
} from "./registration";
import { WhopCheckout } from "./WhopCheckout";
import { courseKey, trackOnce, track, typeKey } from "@/lib/analytics";
import { daysText, meetingTimes, type PublicGroup } from "@/lib/groups";
import { go, usePage } from "./page/context";

export type Preset = { course: CourseType; nonce: number } | null;

const field =
  "w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";
const label = "mb-1.5 block text-xs font-medium text-foreground";

const STEPS = [0, 1, 2, 3];
const genderKey = (g: Gender) => (g === "Kadın" ? "female" : "male");

/** Counts a completed payment once per payment attempt, whether Whop reports it or the return does. */
function completePayment(course: CourseType, attempt: string | null) {
  const data = { course: courseKey(course) };
  if (attempt) trackOnce(`payment_complete:${attempt}`, "payment_complete", data);
  else track("payment_complete", data);
}

/** «Tercih ettiğin grup»: the open groups of a course and group type (full and closed ones cannot be chosen). */
const openGroups = (groups: readonly PublicGroup[], course: CourseType, gender: Gender | "") =>
  groups.filter((g) => g.status === "open" && g.course === course && g.gender === gender);
/** The group to keep after the course or group type changes: the same one if still offered, the only one if there is one. */
const keepGroup = (groups: readonly PublicGroup[], course: CourseType, gender: Gender | "", current: string) => {
  const options = openGroups(groups, course, gender);
  return options.some((g) => g.id === current) ? current : options.length === 1 ? options[0]!.id : "";
};

export function RegisterForm({ preset }: { preset: Preset }) {
  const { t, groups: pageGroups } = usePage();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [f, setF] = useState<Answers>(EMPTY_ANSWERS);
  // The groups as last checked with the server (before the payment step); the page's until then.
  const [liveGroups, setLiveGroups] = useState<PublicGroup[] | null>(null);
  const groups = liveGroups ?? pageGroups;
  // The WhatsApp step's invite, from the save's answer: undefined while waiting, null if none.
  const [invite, setInvite] = useState<WhatsAppInvite | null | undefined>(undefined);
  // The group filled while this person was paying: no link; the team gets in touch.
  const [filledWhilePaying, setFilledWhilePaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const set = (k: keyof Answers, v: string) => setF((p) => ({ ...p, [k]: v }));
  const choose = (course: CourseType, gender: Gender | "") => setF((p) => ({ ...p, course, gender, group: keepGroup(groups, course, gender, p.group) }));
  const options = openGroups(groups, f.course, f.gender);
  const group = options.some((g) => g.id === f.group) ? f.group : options.length === 1 ? options[0]!.id : "";
  // The page's one discount code, entered in the payment step.
  const { discount, restore } = useDiscount();

  // A price card's course prefills the form (adjusting state while rendering).
  const [appliedPreset, setAppliedPreset] = useState<Preset>(null);
  if (preset !== appliedPreset) {
    setAppliedPreset(preset);
    if (preset) {
      setF((p) => ({ ...p, course: preset.course, group: keepGroup(groups, preset.course, p.gender, p.group) }));
      setStep(0);
    }
  }

  // The save that follows payment answers with the group's WhatsApp link and QR code.
  useEffect(
    () =>
      onSave((e) => {
        if (e.answers.gender !== f.gender || e.answers.course !== f.course || e.answers.email !== f.email) return;
        if (e.saved && e.full) setFilledWhilePaying(true);
        if (e.saved) setInvite(e.invite);
        else setInvite((prev) => (prev === undefined ? null : prev));
      }),
    [f.gender, f.course, f.email],
  );

  // With a real link, the buyer is taken on to the WhatsApp community automatically; the step
  // (link and QR code) stays behind as a fallback.
  useEffect(() => {
    if (step !== DONE_STEP || !invite) return;
    const timer = setTimeout(() => window.location.assign(invite.url), 1_500);
    return () => clearTimeout(timer);
  }, [step, invite]);

  // Back from Whop's returnUrl, or reloaded mid-payment: resume from session storage.
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("status");
    if (status !== null || url.searchParams.has("payment")) {
      url.searchParams.delete("status");
      url.searchParams.delete("payment");
      window.history.replaceState(window.history.state, "", url);
    }
    const point = resumePoint(status);
    saveRegistrations();
    if (!point) return;
    // Session storage exists only in the browser, so a resumed form is applied after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setF(point.answers);
    setStep(point.step);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Back from Whop with status=succeeded: this is where the WhatsApp step opens.
    if (point.step === DONE_STEP && point.completed !== undefined) completePayment(point.answers.course, point.completed);
    if (point.discount) restore(point.discount);
    document.getElementById("basvuru")?.scrollIntoView();
  }, [restore]);

  // While the payment step is open, its answers and step are kept for the return from Whop.
  useEffect(() => {
    if (step === PAY_STEP) rememberPayingStep(f, discount);
    else if (step < PAY_STEP) forgetPayingStep();
  }, [step, f, discount]);

  const PRICE = priceFor(f.course);
  // A valid code opens its discounted plan; otherwise the regular plan.
  const planId = discount?.plans[f.course].planId ?? WHOP_PLANS[f.course].planId;

  const validate = (i: number) => {
    const root = ref.current?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    if (!root) return true;
    for (const c of root.querySelectorAll<HTMLInputElement>("input,select,textarea")) {
      if (c.required && c.type !== "checkbox" && c.tagName !== "SELECT")
        c.setCustomValidity(c.value.trim() ? "" : t("form.required"));
      if (!c.checkValidity()) {
        c.reportValidity();
        c.focus();
        return false;
      }
    }
    return true;
  };

  const next = async () => {
    if (!validate(step)) return;
    setErr("");
    if (step === 0 && !group) return setErr(t("group.fullLine"));
    if (step === 0 && group !== f.group) setF((p) => ({ ...p, group }));
    if (step < PAY_STEP - 1) {
      if (step === 0 && f.gender) track("group_select", { course: courseKey(f.course), type: typeKey(f.gender) });
      return setStep(step + 1);
    }
    // Nobody pays for a registration the API would refuse: check it with the API's own rules.
    const refused = refusedStep({ ...f, code: discount?.code ?? "" });
    if (refused !== null) {
      setStep(refused);
      setErr(t("form.invalid"));
      return;
    }
    // Nobody pays for a group that has just filled: ask the server (the save checks it again, atomically).
    const fresh = await fetch("/api/public/groups", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ groups?: PublicGroup[] }>) : null))
      .catch(() => null);
    if (Array.isArray(fresh?.groups)) {
      const live = fresh.groups;
      setLiveGroups(live);
      if (!live.some((g) => g.id === f.group && g.status === "open")) {
        setF((p) => ({ ...p, group: keepGroup(live, p.course, p.gender, "") }));
        setStep(0);
        setErr(t("group.fullLine"));
        return;
      }
    }
    track("payment_step_open", { course: courseKey(f.course) });
    setStep(PAY_STEP);
  };

  /** Whop reported the payment complete: open the WhatsApp step and save the registration (once). */
  const paid = () => {
    completePayment(f.course, markPaid({ ...f, code: discount?.code ?? "" }));
    setStep(DONE_STEP);
    // Whop usually sends the tab to returnUrl right away; that page then does the saving.
    saveRegistrations(1_500);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const progress = (
    <div className="flex gap-2">
      {STEPS.map((i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-gold" : "bg-border"}`}
        />
      ))}
    </div>
  );

  if (step === DONE_STEP && f.gender) {
    const title = t(`done.title.${genderKey(f.gender)}`);
    const groupName = t(`group.${f.course}.${genderKey(f.gender)}`);
    return (
      <div ref={ref} className="glass scroll-mt-28 rounded-3xl p-6 sm:p-8">
        {progress}
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
          {STEPS.length} / {STEPS.length} · {t("done.label")}
        </p>
        <h3 className="mt-2 text-3xl font-semibold text-primary">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("done.saved")}</p>
        {filledWhilePaying ? (
          <p data-filled className="mt-6 rounded-2xl bg-secondary p-4 text-sm font-medium text-primary">
            {t("done.full")}
          </p>
        ) : invite === undefined ? (
          <div aria-busy="true" className="mt-6 h-24 animate-pulse rounded-2xl bg-secondary" />
        ) : invite ? (
          <div data-invite className="mt-6">
            <div className="mx-auto w-fit max-w-full rounded-2xl bg-white p-5 text-center shadow-gold ring-1 ring-gold/40 sm:p-6">
              <p className="text-base font-semibold text-primary">{groupName}</p>
              <img
                src={invite.qr}
                width={invite.width}
                height={invite.width}
                alt={t("done.qrAlt", { group: groupName })}
                className="mx-auto mt-4 h-auto max-w-full"
                style={{ width: invite.width }}
              />
              <a
                href={invite.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("whatsapp_group_join_click")}
                className="mt-5 inline-flex w-full justify-center rounded-full bg-gold px-6 py-3 text-sm font-semibold text-accent-foreground shadow-gold transition hover:scale-[1.03] sm:w-auto"
              >
                {t("done.join")}
              </a>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("done.hint")}
            </p>
          </div>
        ) : (
          <p data-no-invite className="mt-6 rounded-2xl bg-secondary p-4 text-sm text-primary">
            {t("done.noLink")}
          </p>
        )}
        <div className="mt-6">
          <Button
            type="button"
            onClick={() => {
              setInvite(undefined);
              setFilledWhilePaying(false);
              setStep(0);
            }}
            variant="outline" className="h-auto rounded-full border border-primary/30 px-5 py-2.5 text-sm font-medium text-primary"
          >
            {t("done.again")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="glass scroll-mt-28 rounded-3xl p-6 sm:p-8">
      {progress}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
        {step + 1} / {STEPS.length} · {t(`form.step${step + 1}.label`)}
      </p>
      <h3 className="mt-1 text-2xl font-semibold text-primary">{t(`form.step${step + 1}.title`)}</h3>

      <form onSubmit={(e) => e.preventDefault()} onInput={(e) => (e.target as HTMLInputElement).setCustomValidity?.("")} className="mt-6">
        <div data-step="0" hidden={step !== 0} className="space-y-4">
          <fieldset>
            <legend className={label}>{t("form.course")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["regular", "intensive"] as CourseType[]).map((course) => (
                <label key={course} className="flex cursor-pointer items-start gap-2 rounded-lg border border-input bg-card p-3 text-sm text-primary">
                  <input type="radio" name="course" value={course} checked={f.course === course} onChange={() => choose(course, f.gender)} className="mt-1 accent-primary" />
                  <span>{t(`course.${course}`)}<span className="mt-1 block text-xs text-muted-foreground">{t("lessons", { n: priceFor(course).lessons })} · <Amount course={course} kind="total" /></span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className={label}>{t("form.gender")}</label>
            <select
              required
              className={field}
              value={f.gender}
              onChange={(e) => choose(f.course, e.target.value as Gender)}
            >
              <option value="">{t("form.gender.placeholder")}</option>
              <option value="Kadın">{t("form.gender.female")}</option>
              <option value="Erkek">{t("form.gender.male")}</option>
            </select>
          </div>
          {f.gender &&
            (options.length ? (
              <div>
                <label className={label} htmlFor="register-group">{t("form.group")}</label>
                <select id="register-group" name="group" required className={field} value={group} onChange={(e) => set("group", e.target.value)}>
                  {options.length > 1 && <option value="">{t("form.group.placeholder")}</option>}
                  {options.map((g) => (
                    <option key={g.id} value={g.id}>
                      {daysText(g.days, t)} · {meetingTimes(g.hour)}
                      {g.level ? ` · ${g.level}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div data-no-group className="rounded-2xl bg-secondary p-4 text-sm text-primary">
                <p>{t("group.fullLine")}</p>
                <button type="button" onClick={() => go("bekleme")} className="mt-3 rounded-full border border-primary/30 px-4 py-2 text-sm font-semibold text-primary">
                  {t("waitlist.title")}
                </button>
              </div>
            ))}
        </div>

        <div data-step="1" hidden={step !== 1} className="space-y-4">
          <div>
            <label className={label}>{t("form.name")}</label>
            <input required className={field} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={t("form.name.placeholder")} />
          </div>
          <div>
            <label className={label}>{t("form.phone")}</label>
            <input required type="tel" dir="ltr" pattern="\+?[0-9 ]{8,}" className={field} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("form.phone.placeholder")} />
          </div>
          <div>
            <label className={label}>{t("form.email")}</label>
            <input required type="email" dir="ltr" className={field} value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={t("form.email.placeholder")} />
          </div>
          <div>
            <label className={label}>{t("form.goal")}</label>
            <textarea required rows={3} className={field} value={f.goal} onChange={(e) => set("goal", e.target.value)} placeholder={t("form.goal.placeholder")} />
          </div>
          <p className="rounded-2xl bg-secondary p-4 text-sm text-primary">
            <Amount course={f.course} kind="perLesson" /> {t("unitPerLesson")} × {t("lessons", { n: PRICE.lessons })} = <Amount course={f.course} kind="total" />
          </p>
        </div>

        {step === PAY_STEP && (
          <div data-step="2" data-plan-id={planId} className="space-y-4">
            <div className="rounded-2xl bg-secondary p-4 text-sm text-primary">
              <p className="font-semibold">{t(`course.${f.course}`)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("lessons", { n: PRICE.lessons })} · <Amount course={f.course} kind="total" /></p>
            </div>
            <DiscountField />
            <div data-checkout-area>
              <WhopCheckout key={planId} planId={planId} onPaid={paid} />
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" onClick={() => setStep(step - 1)} variant="outline" className="h-auto rounded-full border border-primary/30 px-6 py-3 text-sm font-medium text-primary">
              {t("form.back")}
            </Button>
          ) : (
            <span />
          )}
          {step < PAY_STEP && (
            <Button type="button" onClick={() => void next()} className="h-auto whitespace-normal disabled:opacity-60 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:scale-[1.03]">
              {t("form.next")}
            </Button>
          )}
        </div>
        {err && <p className="mt-4 text-sm text-destructive">{err}</p>}
      </form>
    </div>
  );
}
