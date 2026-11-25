/// <reference types="bun" />
// Groups that open one at a time, the full state, the last-place race and the waitlist, on both
// store backends (files in DATA_DIR, and D1 through Bun's SQLite with the real migrations).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { useRepo } from "@/lib/cms/repo/index.server";
import { BACKENDS, type Backend } from "@/lib/cms/repo/test-backends";
import {
  DEFAULT_GROUPS,
  daysText,
  demandSummary,
  effectiveStatus,
  matchingEntries,
  meetingTimes,
  slotOf,
  type WaitlistEntry,
} from "@/lib/groups";
import {
  addGroup,
  addToWaitlist,
  deleteWaitlistEntry,
  groupStates,
  listWaitlist,
  publicGroups,
  purgeWaitlist,
  reserveSeat,
  updateGroup,
  waitlistCsv,
} from "@/lib/groups.server";

const person = (n: number) => ({ name: `Kişi ${n}`, whatsapp: `+90 555 000 00 ${String(n).padStart(2, "0")}`, email: `k${n}@example.com` });
const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  name: "Ayşe",
  whatsapp: "+90 555 111 22 33",
  course: "regular",
  gender: "Kadın",
  level: "B1",
  days: ["sat", "mon"],
  time: "morning",
  note: "",
  consent: true,
  ...over,
});

describe("group rules (no store)", () => {
  test("the four groups the page shows today are open, with capacity 5", () => {
    expect(DEFAULT_GROUPS.map((g) => [g.id, g.status, g.capacity, g.days.join("+"), g.hour])).toEqual([
      ["normal-kadin", "open", 5, "sat", "11:00"],
      ["normal-erkek", "open", 5, "sat", "17:00"],
      ["yogun-kadin", "open", 5, "sat+sun", "14:00"],
      ["yogun-erkek", "open", 5, "sat+sun", "20:00"],
    ]);
  });
  test("an open group is full once its paid registrations reach its capacity; closed stays closed", () => {
    expect(effectiveStatus({ status: "open", capacity: 5 }, 4)).toBe("open");
    expect(effectiveStatus({ status: "open", capacity: 5 }, 5)).toBe("full");
    expect(effectiveStatus({ status: "open", capacity: 5 }, 6)).toBe("full");
    expect(effectiveStatus({ status: "full", capacity: 5 }, 0)).toBe("full");
    expect(effectiveStatus({ status: "closed", capacity: 5 }, 9)).toBe("closed");
  });
  test("the page's times and days read as they did in the timetable", () => {
    expect(meetingTimes("11:00")).toBe("11:00 - 11:50 + 12:00 - 12:50");
    expect(meetingTimes("20:00")).toBe("20:00 - 20:50 + 21:00 - 21:50");
    const tr = (k: string) => ({ "day.sat": "Cumartesi", "day.sun": "Pazar", "day.mon": "Pazartesi", "days.and": " ve ", "days.comma": ", " })[k] ?? k;
    const ar = (k: string) => ({ "day.sat": "السبت", "day.sun": "الأحد", "days.and": " و", "days.comma": "، " })[k] ?? k;
    expect(daysText(["sun", "sat"], tr)).toBe("Cumartesi ve Pazar");
    expect(daysText(["sat", "sun", "mon"], tr)).toBe("Pazartesi, Cumartesi ve Pazar");
    expect(daysText(["sat", "sun"], ar)).toBe("السبت والأحد");
    expect([slotOf("09:00"), slotOf("11:59"), slotOf("12:00"), slotOf("17:00"), slotOf("21:30"), slotOf("22:00")]).toEqual(["morning", "morning", "noon", "evening", "evening", null]);
  });
  test("demand summary: entries per course × group type × level × time, and the open-threshold", () => {
    const e = (course: string, gender: string, level: string, time: string) => ({ course, gender, level, time }) as WaitlistEntry;
    const list = [e("regular", "Kadın", "B1", "evening"), e("regular", "Kadın", "B1", "evening"), e("regular", "Kadın", "B1", "evening"), e("regular", "Kadın", "B1", "morning"), e("intensive", "Erkek", "A2", "evening")];
    const at3 = demandSummary(list, 3);
    expect(at3.map((r) => [r.course, r.gender, r.level, r.time, r.count, r.canOpen])).toEqual([
      ["regular", "Kadın", "B1", "evening", 3, true],
      ["intensive", "Erkek", "A2", "evening", 1, false],
      ["regular", "Kadın", "B1", "morning", 1, false],
    ]);
    expect(demandSummary(list, 4).some((r) => r.canOpen)).toBe(false);
    expect(demandSummary([], 4)).toEqual([]);
  });
});

describe.each(BACKENDS.map((b) => [b.name, b] as const))("%s store", (_name: string, backend: Backend) => {
  let current: ReturnType<Backend["make"]>;
  beforeEach(() => {
    current = backend.make();
    useRepo(current.repo);
  });
  afterEach(() => {
    useRepo(null);
    current.cleanup();
  });

  test("full at capacity: the fifth paid place fills the group; the page then shows it as full, with no numbers", async () => {
    for (let i = 1; i <= 4; i++) expect((await reserveSeat({ ref: `p${i}`, groupId: "normal-kadin", ...person(i) })).seat).toBe(true);
    expect((await publicGroups()).find((g) => g.id === "normal-kadin")?.status).toBe("open");
    expect((await reserveSeat({ ref: "p5", groupId: "normal-kadin", ...person(5) })).seat).toBe(true);
    const page = await publicGroups();
    expect(page.find((g) => g.id === "normal-kadin")?.status).toBe("full");
    expect(page.find((g) => g.id === "normal-erkek")?.status).toBe("open");
    for (const g of page) expect(Object.keys(g).sort()).toEqual(["course", "days", "gender", "hour", "id", "level", "status"]);
    const panel = (await groupStates()).groups.find((g) => g.id === "normal-kadin")!;
    expect([panel.paid, panel.left, panel.capacity, panel.now]).toEqual([5, 0, 5, "full"]);
    // A sixth payment gets no place; it is kept, with the contact details, for the team.
    expect((await reserveSeat({ ref: "p6", groupId: "normal-kadin", ...person(6) })).seat).toBe(false);
    const { overflow } = await groupStates();
    expect(overflow.map((o) => [o.ref, o.group, o.name, o.email])).toEqual([["p6", "normal-kadin", "Kişi 6", "k6@example.com"]]);
  });

  test("the last-place race: two payments for one place, at the same moment, get one place between them", async () => {
    await updateGroup("yogun-erkek", { capacity: 1 });
    const [a, b] = await Promise.all([reserveSeat({ ref: "race-a", groupId: "yogun-erkek", ...person(1) }), reserveSeat({ ref: "race-b", groupId: "yogun-erkek", ...person(2) })]);
    expect([a.seat, b.seat].sort()).toEqual([false, true]);
    const s = await groupStates();
    expect(s.groups.find((g) => g.id === "yogun-erkek")!.paid).toBe(1);
    expect(s.overflow).toHaveLength(1);
    // A retried save of either payment gets the same answer and takes nothing more.
    expect((await reserveSeat({ ref: "race-a", groupId: "yogun-erkek", ...person(1) })).seat).toBe(a.seat);
    expect((await reserveSeat({ ref: "race-b", groupId: "yogun-erkek", ...person(2) })).seat).toBe(b.seat);
    expect((await groupStates()).overflow).toHaveLength(1);
  });

  test("many payments at once for a group of five: exactly five places", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => reserveSeat({ ref: `m${i}`, groupId: "yogun-kadin", ...person(i) })));
    expect(results.filter((r) => r.seat)).toHaveLength(5);
    expect((await groupStates()).groups.find((g) => g.id === "yogun-kadin")!.paid).toBe(5);
  });

  test("a closed group is not on the page; opening it in the panel puts it there and lists the waitlist entries it suits", async () => {
    await addToWaitlist(entry({ name: "Uygun", whatsapp: "+90 555 000 11 11", days: ["mon", "wed"], time: "evening", level: "B1" }));
    await addToWaitlist(entry({ name: "Başka saat", whatsapp: "+90 555 000 22 22", days: ["mon"], time: "morning", level: "B1" }));
    await addToWaitlist(entry({ name: "Başka gün", whatsapp: "+90 555 000 33 33", days: ["sun"], time: "evening", level: "B1" }));
    await addToWaitlist(entry({ name: "Erkek", whatsapp: "+90 555 000 44 44", gender: "Erkek", days: ["mon"], time: "evening", level: "B1" }));
    const g = await addGroup({ course: "regular", gender: "Kadın", level: "B1", days: ["mon"], hour: "19:00" });
    expect([g.id, g.status, g.capacity]).toEqual(["normal-kadin-2", "closed", 5]);
    expect((await publicGroups()).some((p) => p.id === g.id)).toBe(false);
    const opened = await updateGroup(g.id, { status: "open", days: ["wed", "mon"], hour: "18:30" });
    expect(opened.opened).toBe(true);
    expect(opened.group.days).toEqual(["mon", "wed"]);
    expect(opened.matches.map((m) => [m.name, m.whatsapp])).toEqual([["Uygun", "+90 555 000 11 11"]]);
    expect((await publicGroups()).find((p) => p.id === g.id)).toMatchObject({ status: "open", days: ["mon", "wed"], hour: "18:30", level: "B1" });
    // Closing hides it again; the files and the group itself stay.
    await updateGroup(g.id, { status: "closed" });
    expect((await publicGroups()).some((p) => p.id === g.id)).toBe(false);
    expect((await groupStates()).groups.some((p) => p.id === g.id)).toBe(true);
  });

  test("duplicate waitlist entries: the same number for the same course and group type is refused, written any way", async () => {
    await addToWaitlist(entry());
    await expect(addToWaitlist(entry({ whatsapp: "0090 555 111 2233", name: "Ayşe Y." }))).rejects.toMatchObject({ status: 409 });
    await expect(addToWaitlist(entry({ whatsapp: "+90 (555) 111-22-33", level: "B2", days: ["sun"] }))).rejects.toMatchObject({ status: 409 });
    // Another course, or the other group type, is a different entry.
    await addToWaitlist(entry({ course: "intensive" }));
    await addToWaitlist(entry({ gender: "Erkek" }));
    expect(await listWaitlist()).toHaveLength(3);
  });

  test("the waitlist refuses what the form would not send: no consent, no day, Friday, an unknown time", async () => {
    for (const bad of [{ consent: false }, { days: [] }, { days: ["fri"] }, { time: "night" }, { level: "C1" }, { whatsapp: "12" }, { name: "" }])
      await expect(addToWaitlist(entry(bad))).rejects.toMatchObject({ status: 400 });
    expect(await listWaitlist()).toHaveLength(0);
  });

  test("the panel deletes one entry, or every entry older than X days; CSV has every field", async () => {
    const old = await addToWaitlist(entry({ whatsapp: "+90 555 000 00 01" }), new Date("2026-01-01T10:00:00Z"));
    const recent = await addToWaitlist(entry({ whatsapp: "+90 555 000 00 02", note: 'Akşam, "uygun"' }), new Date("2026-11-20T10:00:00Z"));
    await addToWaitlist(entry({ whatsapp: "+90 555 000 00 03" }), new Date("2026-11-21T10:00:00Z"));
    const csv = waitlistCsv(await listWaitlist());
    expect(csv.startsWith("﻿Tarih,Adın,WhatsApp numaran,Kurs türü,Grup türü,Arapça seviyen,Sana uygun günler,Sana uygun saat,Notun\r\n")).toBe(true);
    expect(csv).toContain('"Akşam, ""uygun"""');
    expect(csv).toContain("Pazartesi, Cumartesi");
    expect(await purgeWaitlist(30, Date.parse("2026-11-25T00:00:00Z"))).toBe(1);
    expect((await listWaitlist()).some((e) => e.id === old.id)).toBe(false);
    expect(await deleteWaitlistEntry(recent.id)).toBe(true);
    expect(await deleteWaitlistEntry(recent.id)).toBe(false);
    expect(await listWaitlist()).toHaveLength(1);
  });
});

describe("files under DATA_DIR", () => {
  test("every document is written atomically and nothing temporary is left", async () => {
    const backend = BACKENDS.find((b) => b.name === "file")!;
    const current = backend.make();
    useRepo(current.repo);
    try {
      await Promise.all(Array.from({ length: 8 }, (_, i) => reserveSeat({ ref: `f${i}`, groupId: "normal-erkek", ...person(i) })));
      await addToWaitlist(entry());
      await updateGroup("normal-erkek", { capacity: 6 });
      const dir = process.env["DATA_DIR"]!;
      expect(readdirSync(dir).sort()).toEqual(["groups.json", "registrations.json", "waitlist.json"]);
      for (const f of readdirSync(dir)) expect(() => JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))).not.toThrow();
    } finally {
      useRepo(null);
      current.cleanup();
    }
  });

  test("matching ignores level for an all-levels group and needs a shared day and the time window", () => {
    const e = { course: "regular", gender: "Kadın", level: "A2", days: ["sat"], time: "morning" } as WaitlistEntry;
    expect(matchingEntries({ course: "regular", gender: "Kadın", level: "", days: ["sat"], hour: "11:00" }, [e])).toHaveLength(1);
    expect(matchingEntries({ course: "regular", gender: "Kadın", level: "B1", days: ["sat"], hour: "11:00" }, [e])).toHaveLength(0);
    expect(matchingEntries({ course: "regular", gender: "Kadın", level: "", days: ["sun"], hour: "11:00" }, [e])).toHaveLength(0);
    expect(matchingEntries({ course: "regular", gender: "Kadın", level: "", days: ["sat"], hour: "13:00" }, [e])).toHaveLength(0);
  });
});
