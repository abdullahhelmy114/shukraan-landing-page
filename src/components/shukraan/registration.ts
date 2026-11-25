import { isDiscount, type Discount } from "@/lib/discount";
import { registrationSchema, type RegistrationPayload } from "@/lib/registration-schema";
import { groupIdFor, type CourseType, type Gender, type WhatsAppInvite } from "./data";

/** The form's steps: course and group type, details, payment, WhatsApp. */
export const PAY_STEP = 2;
export const DONE_STEP = 3;

/**
 * The form's answers (steps 1–2), the discount code a paid registration used ("" for none) and,
 * once paid, its payment attempt's id (the save's reference: a retry never takes a second place).
 */
export type Answers = {
  course: CourseType;
  gender: Gender | "";
  /** The group chosen in «Tercih ettiğin grup» (src/lib/groups.ts). */
  group: string;
  name: string;
  phone: string;
  email: string;
  goal: string;
  code: string;
  attempt?: string;
};

export const EMPTY_ANSWERS: Answers = {
  course: "intensive",
  gender: "",
  group: "",
  name: "",
  phone: "",
  email: "",
  goal: "",
  code: "",
};

const ENDPOINT = "/api/public/shukraan-register";

/** The registration as the API stores it: the WhatsApp group, no level (set after payment). */
function toPayload(a: Answers): Record<keyof RegistrationPayload, string> {
  return {
    gender: a.gender,
    group_id: groupIdFor(a.course, a.gender),
    level: "",
    availability: "",
    full_name: a.name,
    whatsapp: a.phone,
    email: a.email,
    goal: a.goal,
    // The column that held the Dâd answer now holds the discount code used ("" without one).
    eligibility: a.code,
    group: a.group,
    ref: a.attempt ?? "",
  };
}

const FIELD_STEP: Record<keyof RegistrationPayload, number> = {
  gender: 0,
  group_id: 0,
  level: 0,
  availability: 0,
  full_name: 1,
  whatsapp: 1,
  email: 1,
  goal: 1,
  // The discount code is entered in the payment step.
  eligibility: PAY_STEP,
  group: 0,
  ref: 0,
};

/** The first step holding an answer the API would refuse, or null if the API would accept them all. */
export function refusedStep(a: Answers): number | null {
  const result = registrationSchema.safeParse(toPayload(a));
  if (result.success) return null;
  const key = result.error.issues[0]?.path[0];
  return typeof key === "string" && key in FIELD_STEP ? FIELD_STEP[key as keyof RegistrationPayload] : 0;
}

// ── Session storage ──────────────────────────────────────────────────────────────────────────
// PAYING: the answers and step while the payment step is open, so a return from Whop resumes.
// PAID: paid registrations not saved yet. Both are emptied once the registration is saved.
const PAYING_KEY = "shukraan.registration.paying";
const PAID_KEY = "shukraan.registration.paid";

function read(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode quota): the in-page flow still works.
  }
}
function remove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
const asAnswers = (v: unknown): Answers | null =>
  v && typeof v === "object" ? { ...EMPTY_ANSWERS, ...(v as Partial<Answers>) } : null;
const readPaid = (): Answers[] => {
  const v = read(PAID_KEY);
  return Array.isArray(v) ? v.map(asAnswers).filter((a): a is Answers => a !== null) : [];
};

/** A new id for one payment attempt (kept while the payment step is open). */
const newAttempt = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function rememberPayingStep(a: Answers, discount: Discount | null) {
  const kept = read(PAYING_KEY) as { attempt?: unknown } | null;
  const attempt = typeof kept?.attempt === "string" ? kept.attempt : newAttempt();
  write(PAYING_KEY, { answers: a, step: PAY_STEP, discount, attempt });
}
export function forgetPayingStep() {
  remove(PAYING_KEY);
}

/**
 * Whop reported the payment complete: queue the registration for saving. Returns the payment
 * attempt's id (null if the payment step's record is gone), so the completion is counted once.
 */
export function markPaid(a: Answers): string | null {
  const kept = read(PAYING_KEY) as { attempt?: unknown } | null;
  const id = typeof kept?.attempt === "string" ? kept.attempt : null;
  write(PAID_KEY, [...readPaid(), id ? { ...a, attempt: id } : a]);
  remove(PAYING_KEY);
  return id;
}

/**
 * Where this visit resumes the form, if anywhere: a return to returnUrl with status=succeeded
 * (or a reload after paying) opens the WhatsApp step; any other return during payment reopens the
 * payment step.
 */
export function resumePoint(
  status: string | null,
): { answers: Answers; step: typeof PAY_STEP | typeof DONE_STEP; discount: Discount | null; completed?: string | null } | null {
  const kept = read(PAYING_KEY) as { answers?: unknown; discount?: unknown } | null;
  const paying = asAnswers(kept?.answers);
  if (paying) {
    const discount = isDiscount(kept?.discount) ? kept.discount : null;
    if (status !== "succeeded") return { answers: paying, step: PAY_STEP, discount };
    const completed = markPaid({ ...paying, code: discount?.code ?? "" });
    return { answers: paying, step: DONE_STEP, discount, completed };
  }
  const paid = readPaid().at(-1);
  return paid ? { answers: paid, step: DONE_STEP, discount: null } : null;
}

// ── Saving ───────────────────────────────────────────────────────────────────────────────────
/**
 * One save attempt's outcome; a saved registration comes with its group's invite (or null), or
 * full: the group filled while this person was paying (no link; the team gets in touch).
 */
export type SaveEvent = { answers: Answers; saved: boolean; invite: WhatsAppInvite | null; full: boolean };
const listeners = new Set<(event: SaveEvent) => void>();

/** Calls `listener` after every save attempt; returns the unsubscribe function. */
export function onSave(listener: (event: SaveEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The invite in the save API's answer, if it is well formed. */
function inviteFrom(body: unknown): WhatsAppInvite | null {
  const w = (body as { whatsapp?: Partial<WhatsAppInvite> | null } | null)?.whatsapp;
  return typeof w?.url === "string" && w.url.startsWith("https://") && typeof w.qr === "string" && w.qr.startsWith("data:image/") && typeof w.width === "number" && w.width > 0
    ? { url: w.url, qr: w.qr, width: w.width }
    : null;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let attempt = 0;

/**
 * Saves every paid registration through the existing API, oldest first, exactly once each,
 * retrying failures with backoff for as long as the page is open (and again on the next visit
 * in this tab, since they stay in session storage until saved).
 */
export function saveRegistrations(delayMs = 0) {
  if (inFlight || timer !== undefined) return;
  timer = setTimeout(run, delayMs);
}

async function run() {
  timer = undefined;
  const next = readPaid()[0];
  if (!next) return;
  inFlight = true;
  let saved = false;
  let invite: WhatsAppInvite | null = null;
  let full = false;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(next)),
      keepalive: true,
    });
    saved = res.ok;
    if (saved) {
      const data: unknown = await res.json().catch(() => null);
      invite = inviteFrom(data);
      full = (data as { full?: unknown } | null)?.full === true;
    }
  } catch {
    // Network error: retried below.
  }
  inFlight = false;
  listeners.forEach((listener) => listener({ answers: next, saved, invite, full }));
  if (saved) {
    const rest = readPaid().slice(1);
    if (rest.length) write(PAID_KEY, rest);
    else remove(PAID_KEY);
    attempt = 0;
    saveRegistrations();
  } else {
    attempt += 1;
    saveRegistrations(Math.min(30_000, 1_000 * 2 ** attempt));
  }
}

if (typeof window !== "undefined") {
  // Whop sends the tab to returnUrl right after onComplete. A save that has not started yet is
  // left to the page the tab lands on, so one payment is not saved twice by two pages.
  window.addEventListener("beforeunload", () => {
    if (timer === undefined || inFlight) return;
    clearTimeout(timer);
    timer = setTimeout(run, 10_000);
  });
}
