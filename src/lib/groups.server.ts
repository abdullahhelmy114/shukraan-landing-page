import { z } from "zod";

import { repo } from "@/lib/cms/repo/index.server";
import {
  DAYS,
  DEFAULT_CAPACITY,
  DEFAULT_GROUPS,
  DEFAULT_OPEN_THRESHOLD,
  LEVELS,
  TIME_SLOT_KEYS,
  communityFile,
  effectiveStatus,
  isDuplicate,
  isHour,
  matchingEntries,
  sortDays,
  toPublic,
  type Group,
  type GroupStatus,
  type PublicGroup,
  type WaitlistEntry,
} from "@/lib/groups";

/**
 * The groups, their paid places and the waitlist, kept on the server only (DATA_DIR on Coolify:
 * groups.json, registrations.json, waitlist.json; D1 on Workers). Nothing here reaches the page
 * except publicGroups(): open and full groups without capacity or counts.
 */
export type GroupsDoc = { groups: Group[]; openThreshold: number };
/**
 * A paid place in a group, by its payment attempt (ref, so a retried save never takes a second
 * place). overflow: the payment came after the group filled; the team contacts that person.
 */
export type Seat = { ref: string; group: string; at: string; overflow: boolean; name?: string; whatsapp?: string; email?: string };
type SeatsDoc = { seats: Seat[] };
type WaitlistDoc = { entries: WaitlistEntry[] };

export class GroupError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const withDefaults = (doc: GroupsDoc | null): GroupsDoc => ({
  groups: doc?.groups?.length ? doc.groups : DEFAULT_GROUPS.map((g) => ({ ...g, days: [...g.days] })),
  openThreshold: doc?.openThreshold ?? DEFAULT_OPEN_THRESHOLD,
});

export async function readGroups(): Promise<GroupsDoc> {
  return withDefaults(await (await repo()).getDoc<GroupsDoc>("groups"));
}
async function readSeats(): Promise<Seat[]> {
  return (await (await repo()).getDoc<SeatsDoc>("registrations"))?.seats ?? [];
}
export const paidCount = (seats: readonly Seat[], groupId: string) => seats.filter((s) => s.group === groupId && !s.overflow).length;

export type GroupState = Group & { paid: number; left: number; now: GroupStatus };

/** Every group with its paid places, places left and status now (the panel only). */
export async function groupStates(): Promise<{ groups: GroupState[]; openThreshold: number; overflow: Seat[] }> {
  const [doc, seats] = await Promise.all([readGroups(), readSeats()]);
  return {
    openThreshold: doc.openThreshold,
    groups: doc.groups.map((g) => {
      const paid = paidCount(seats, g.id);
      return { ...g, paid, left: Math.max(0, g.capacity - paid), now: effectiveStatus(g, paid) };
    }),
    overflow: seats.filter((s) => s.overflow).reverse(),
  };
}

/** What the page shows: open and full groups, in order, without capacity or counts. */
export async function publicGroups(): Promise<PublicGroup[]> {
  try {
    const [doc, seats] = await Promise.all([readGroups(), readSeats()]);
    return doc.groups.map((g) => toPublic(g, paidCount(seats, g.id))).filter((g): g is PublicGroup => g !== null);
  } catch (e) {
    // The store is unreadable: show the four groups as they are rather than break the page.
    console.error("[groups] could not read the groups; showing the default ones", e);
    return DEFAULT_GROUPS.map((g) => toPublic(g, 0)).filter((g): g is PublicGroup => g !== null);
  }
}

/**
 * Takes a place in a group for a paid registration, atomically: the payment that reaches a full
 * group (it filled while this person was paying) is kept as overflow, with the contact details,
 * for the team. The same ref always gets the same answer.
 */
export async function reserveSeat(input: { ref: string; groupId: string; name: string; whatsapp: string; email: string; at?: string }): Promise<{ seat: boolean; group: Group }> {
  const { groups } = await readGroups();
  const group = groups.find((g) => g.id === input.groupId);
  if (!group) throw new GroupError("Bilinmeyen grup.", 400);
  return (await repo()).updateDoc<SeatsDoc, { seat: boolean; group: Group }>("registrations", (current) => {
    const seats = current?.seats ?? [];
    const known = seats.find((s) => s.ref === input.ref);
    if (known) return { value: { seats }, result: { seat: !known.overflow, group } };
    const seat = effectiveStatus(group, paidCount(seats, group.id)) === "open";
    const at = input.at ?? new Date().toISOString();
    const entry: Seat = seat
      ? { ref: input.ref, group: group.id, at, overflow: false }
      : { ref: input.ref, group: group.id, at, overflow: true, name: input.name, whatsapp: input.whatsapp, email: input.email };
    return { value: { seats: [...seats, entry] }, result: { seat, group } };
  });
}

// ── The panel's changes ──────────────────────────────────────────────────────────────────────
const groupPatch = z
  .object({
    status: z.enum(["open", "full", "closed"]),
    capacity: z.number().int().min(0).max(500),
    level: z.enum(["", ...LEVELS] as ["", "A2", "B1", "B2"]),
    days: z.array(z.enum(DAYS)).min(1).max(DAYS.length),
    hour: z.string().refine(isHour, "HH:MM"),
  })
  .partial()
  .strict();

const newGroup = z
  .object({
    course: z.enum(["regular", "intensive"]),
    gender: z.enum(["Kadın", "Erkek"]),
    level: z.enum(["", ...LEVELS] as ["", "A2", "B1", "B2"]).default(""),
    days: z.array(z.enum(DAYS)).min(1).max(DAYS.length),
    hour: z.string().refine(isHour, "HH:MM"),
    capacity: z.number().int().min(0).max(500).default(DEFAULT_CAPACITY),
  })
  .strict();

/** Changes a group (status, capacity, level, days, hour). Opening a closed group returns the waitlist entries it suits. */
export async function updateGroup(id: string, patch: unknown): Promise<{ group: Group; opened: boolean; matches: WaitlistEntry[] }> {
  const p = groupPatch.safeParse(patch);
  if (!p.success) throw new GroupError("Geçersiz grup bilgisi.");
  // Only the fields sent (zod leaves the others undefined).
  const change = Object.fromEntries(Object.entries({ ...p.data, ...(p.data.days ? { days: sortDays(p.data.days) } : {}) }).filter(([, v]) => v !== undefined)) as Partial<Group>;
  const { group, opened } = await (await repo()).updateDoc<GroupsDoc, { group: Group; opened: boolean }>("groups", (current) => {
    const doc = withDefaults(current);
    const i = doc.groups.findIndex((g) => g.id === id);
    if (i < 0) throw new GroupError("Bilinmeyen grup.", 404);
    const before = doc.groups[i]!;
    const after: Group = { ...before, ...change };
    const groups = doc.groups.map((g, j) => (j === i ? after : g));
    return { value: { ...doc, groups }, result: { group: after, opened: before.status === "closed" && after.status !== "closed" } };
  });
  return { group, opened, matches: opened ? matchingEntries(group, await listWaitlist()) : [] };
}

/** Adds a group, closed, after the others; its id is its course and group type's files' name with a number. */
export async function addGroup(input: unknown): Promise<Group> {
  const p = newGroup.safeParse(input);
  if (!p.success) throw new GroupError("Geçersiz grup bilgisi.");
  return (await repo()).updateDoc<GroupsDoc, Group>("groups", (current) => {
    const doc = withDefaults(current);
    const base = communityFile(p.data.course, p.data.gender);
    let n = 2;
    while (doc.groups.some((g) => g.id === `${base}-${n}`)) n += 1;
    const group: Group = { id: `${base}-${n}`, ...p.data, days: sortDays(p.data.days), status: "closed" };
    return { value: { ...doc, groups: [...doc.groups, group] }, result: group };
  });
}

export async function setOpenThreshold(n: unknown): Promise<number> {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100) throw new GroupError("Geçersiz eşik.");
  return (await repo()).updateDoc<GroupsDoc, number>("groups", (current) => ({ value: { ...withDefaults(current), openThreshold: n }, result: n }));
}

// ── The waitlist ─────────────────────────────────────────────────────────────────────────────
export const waitlistSchema = z.object({
  name: z.string().trim().min(2).max(120),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .regex(/^\+?[0-9 ()-]+$/)
    .refine((s) => {
      const digits = s.replace(/\D/g, "").length;
      return digits >= 8 && digits <= 15;
    }),
  course: z.enum(["regular", "intensive"]),
  gender: z.enum(["Kadın", "Erkek"]),
  level: z.enum(LEVELS as ["A2", "B1", "B2"]),
  days: z.array(z.enum(DAYS)).min(1).max(DAYS.length),
  time: z.enum(TIME_SLOT_KEYS as ["morning", "noon", "evening"]),
  note: z.string().trim().max(1000).optional().default(""),
  consent: z.literal(true),
});

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Adds an entry; the same number for the same course and group type is refused (409). */
export async function addToWaitlist(input: unknown, now = new Date()): Promise<WaitlistEntry> {
  const p = waitlistSchema.safeParse(input);
  if (!p.success) throw new GroupError("invalid", 400);
  const { consent: _consent, ...d } = p.data;
  const entry: WaitlistEntry = { id: randomId(), at: now.toISOString(), ...d, days: sortDays(d.days) };
  return (await repo()).updateDoc<WaitlistDoc, WaitlistEntry>("waitlist", (current) => {
    const entries = current?.entries ?? [];
    if (isDuplicate(entry, entries)) throw new GroupError("duplicate", 409);
    return { value: { entries: [...entries, entry] }, result: entry };
  });
}

/** Newest first. */
export async function listWaitlist(): Promise<WaitlistEntry[]> {
  return [...((await (await repo()).getDoc<WaitlistDoc>("waitlist"))?.entries ?? [])].reverse();
}

export async function deleteWaitlistEntry(id: string): Promise<boolean> {
  return (await repo()).updateDoc<WaitlistDoc, boolean>("waitlist", (current) => {
    const entries = current?.entries ?? [];
    const kept = entries.filter((e) => e.id !== id);
    return { value: { entries: kept }, result: kept.length < entries.length };
  });
}

/** Deletes entries older than `days` days; returns how many. */
export async function purgeWaitlist(days: unknown, now = Date.now()): Promise<number> {
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 3650) throw new GroupError("Geçersiz gün sayısı.");
  const cutoff = now - days * 86_400_000;
  return (await repo()).updateDoc<WaitlistDoc, number>("waitlist", (current) => {
    const entries = current?.entries ?? [];
    const kept = entries.filter((e) => Date.parse(e.at) >= cutoff);
    return { value: { entries: kept }, result: entries.length - kept.length };
  });
}

/** "Normal · Kadın · Cumartesi 11:00" (the panel, the CSV and the saved registration). */
export const groupLabelTr = (g: Pick<Group, "course" | "gender" | "level" | "days" | "hour">) =>
  `${COURSE_TR[g.course]} · ${g.gender}${g.level ? ` · ${g.level}` : ""} · ${g.days.map((d) => DAY_TR[d]).join(" ve ")} ${g.hour}`;

const COURSE_TR = { regular: "Normal", intensive: "Yoğun (+)" } as const;
const DAY_TR: Record<string, string> = { mon: "Pazartesi", tue: "Salı", wed: "Çarşamba", thu: "Perşembe", sat: "Cumartesi", sun: "Pazar" };
const TIME_TR = { morning: "Sabah 09:00–12:00", noon: "Öğle 12:00–17:00", evening: "Akşam 17:00–22:00" } as const;

/** The waitlist as CSV (UTF-8 with a BOM, so spreadsheet programs read the Turkish letters). */
export function waitlistCsv(entries: readonly WaitlistEntry[]): string {
  const cell = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Tarih", "Adın", "WhatsApp numaran", "Kurs türü", "Grup türü", "Arapça seviyen", "Sana uygun günler", "Sana uygun saat", "Notun"];
  const rows = entries.map((e) => [e.at, e.name, e.whatsapp, COURSE_TR[e.course], e.gender, e.level, e.days.map((d) => DAY_TR[d]).join(", "), TIME_TR[e.time], e.note]);
  return "﻿" + [head, ...rows].map((r) => r.map((v) => cell(String(v))).join(",")).join("\r\n") + "\r\n";
}
