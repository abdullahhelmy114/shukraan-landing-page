import type { CourseType, Gender } from "@/components/shukraan/data";

/**
 * Groups open one at a time. Each group has a course, a group type (Kadın / Erkek), optionally a
 * level, its days and starting hour, a status and an internal capacity. The page only ever sees a
 * PublicGroup: no capacity, no seat counts. Server side: src/lib/groups.server.ts.
 */
export type GroupStatus = "open" | "full" | "closed";
export type Level = "A2" | "B1" | "B2";
export const LEVELS: Level[] = ["A2", "B1", "B2"];
/** Teaching days, Monday first; there are no lessons on Friday (Cuma). */
export const DAYS = ["mon", "tue", "wed", "thu", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
/** The waitlist's time windows (Turkish time), [from, to). */
export const TIME_SLOTS = { morning: ["09:00", "12:00"], noon: ["12:00", "17:00"], evening: ["17:00", "22:00"] } as const;
export type TimeSlot = keyof typeof TIME_SLOTS;
export const TIME_SLOT_KEYS = Object.keys(TIME_SLOTS) as TimeSlot[];

export type Group = {
  id: string;
  course: CourseType;
  gender: Gender;
  /** "" for a group open to every level (the academy sets each person's level after payment). */
  level: Level | "";
  days: Day[];
  /** First lesson's start, "HH:MM" (each meeting is two 50-minute lessons with a 10-minute break). */
  hour: string;
  /** As set in the panel. An open group becomes full by itself once its paid registrations reach its capacity. */
  status: GroupStatus;
  /** Internal only: never sent to the page. */
  capacity: number;
};

/** What the page gets: open and full groups only, without capacity or counts. */
export type PublicGroup = Pick<Group, "id" | "course" | "gender" | "level" | "days" | "hour"> & { status: "open" | "full" };

export const DEFAULT_CAPACITY = 5;
export const DEFAULT_OPEN_THRESHOLD = 4;

/** The four groups the page shows today, all open. Their ids are also their WhatsApp files' names. */
export const DEFAULT_GROUPS: Group[] = [
  { id: "normal-kadin", course: "regular", gender: "Kadın", level: "", days: ["sat"], hour: "11:00", status: "open", capacity: DEFAULT_CAPACITY },
  { id: "normal-erkek", course: "regular", gender: "Erkek", level: "", days: ["sat"], hour: "17:00", status: "open", capacity: DEFAULT_CAPACITY },
  { id: "yogun-kadin", course: "intensive", gender: "Kadın", level: "", days: ["sat", "sun"], hour: "14:00", status: "open", capacity: DEFAULT_CAPACITY },
  { id: "yogun-erkek", course: "intensive", gender: "Erkek", level: "", days: ["sat", "sun"], hour: "20:00", status: "open", capacity: DEFAULT_CAPACITY },
];

/** The course and group type's community WhatsApp files (whatsapp-gruplari/), used by a group without its own. */
export const communityFile = (course: CourseType, gender: Gender) => `${course === "regular" ? "normal" : "yogun"}-${gender === "Kadın" ? "kadin" : "erkek"}`;

/** The group id saved with a registration, as before: the gender, with "+" for Yoğun. */
export const savedGroupId = (g: Pick<Group, "course" | "gender">) => `${g.gender}${g.course === "intensive" ? "+" : ""}`;

export const isHour = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "11:00" → "11:00 - 11:50 + 12:00 - 12:50": two 50-minute lessons with a 10-minute break. */
export function meetingTimes(hour: string): string {
  const s = minutes(hour);
  return `${clock(s)} - ${clock(s + 50)} + ${clock(s + 60)} - ${clock(s + 110)}`;
}

/** The waitlist time window a group's starting hour falls in (null outside 09:00–22:00). */
export function slotOf(hour: string): TimeSlot | null {
  const m = minutes(hour);
  for (const k of TIME_SLOT_KEYS) if (m >= minutes(TIME_SLOTS[k][0]) && m < minutes(TIME_SLOTS[k][1])) return k;
  return null;
}

/** Days in week order, without repeats or unknown values. */
export const sortDays = (days: readonly unknown[]): Day[] => DAYS.filter((d) => days.includes(d));

/** "Cumartesi ve Pazar", "Saturday and Sunday", "السبت والأحد": the page's day names (ui day.*, days.and, days.comma). */
export function daysText(days: readonly Day[], t: (key: string) => string): string {
  const names = sortDays(days).map((d) => t(`day.${d}`));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(t("days.comma"))}${t("days.and")}${names.at(-1)}`;
}

/** What a group is now: closed and full as set in the panel; an open group is full at capacity. */
export function effectiveStatus(g: Pick<Group, "status" | "capacity">, paid: number): GroupStatus {
  if (g.status === "closed") return "closed";
  if (g.status === "full" || paid >= g.capacity) return "full";
  return "open";
}

export function toPublic(g: Group, paid: number): PublicGroup | null {
  const status = effectiveStatus(g, paid);
  if (status === "closed") return null;
  return { id: g.id, course: g.course, gender: g.gender, level: g.level, days: g.days, hour: g.hour, status };
}

// ── The waitlist ─────────────────────────────────────────────────────────────────────────────
export type WaitlistEntry = {
  id: string;
  /** ISO time it was sent. */
  at: string;
  name: string;
  whatsapp: string;
  course: CourseType;
  gender: Gender;
  level: Level;
  days: Day[];
  time: TimeSlot;
  note: string;
};

/** A WhatsApp number's digits only (a leading 00 counts as +), for spotting the same number twice. */
export const phoneKey = (s: string) => s.replace(/\D/g, "").replace(/^00/, "");

/** The same number for the same course and group type is one entry. */
export const isDuplicate = (a: Pick<WaitlistEntry, "whatsapp" | "course" | "gender">, list: readonly WaitlistEntry[]) =>
  list.some((e) => e.course === a.course && e.gender === a.gender && phoneKey(e.whatsapp) === phoneKey(a.whatsapp));

export type DemandRow = { course: CourseType; gender: Gender; level: Level; time: TimeSlot; count: number; canOpen: boolean };

/** Entries per course × group type × level × time window, most first; canOpen once a line reaches the threshold. */
export function demandSummary(entries: readonly WaitlistEntry[], threshold: number): DemandRow[] {
  const rows = new Map<string, DemandRow>();
  for (const e of entries) {
    const key = `${e.course}|${e.gender}|${e.level}|${e.time}`;
    const row = rows.get(key) ?? { course: e.course, gender: e.gender, level: e.level, time: e.time, count: 0, canOpen: false };
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, canOpen: r.count >= threshold }))
    .sort((a, b) => b.count - a.count || `${a.course}${a.gender}${a.level}${a.time}`.localeCompare(`${b.course}${b.gender}${b.level}${b.time}`));
}

/** Waitlist entries a group suits: same course and group type, its level (any for an all-levels group), its time window and at least one of its days. */
export function matchingEntries(g: Pick<Group, "course" | "gender" | "level" | "days" | "hour">, entries: readonly WaitlistEntry[]): WaitlistEntry[] {
  const slot = slotOf(g.hour);
  return entries.filter((e) => e.course === g.course && e.gender === g.gender && (!g.level || e.level === g.level) && e.time === slot && e.days.some((d) => g.days.includes(d)));
}

export type WaitlistFilter = Partial<{ course: CourseType; gender: Gender; level: Level; day: Day; time: TimeSlot }>;

/** The panel's filters (any left empty matches everything). */
export const filterWaitlist = (entries: readonly WaitlistEntry[], f: WaitlistFilter) =>
  entries.filter(
    (e) => (!f.course || e.course === f.course) && (!f.gender || e.gender === f.gender) && (!f.level || e.level === f.level) && (!f.day || e.days.includes(f.day)) && (!f.time || e.time === f.time),
  );
