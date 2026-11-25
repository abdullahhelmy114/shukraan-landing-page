import { NextResponse } from "next/server";

import { DAYS, LEVELS, TIME_SLOT_KEYS, demandSummary, filterWaitlist, matchingEntries, type WaitlistFilter } from "@/lib/groups";
import { defaultSource, parseLink } from "@/lib/whatsapp-invites";
import {
  addGroup,
  deleteWaitlistEntry,
  GroupError,
  groupLabelTr,
  groupStates,
  listWaitlist,
  purgeWaitlist,
  readGroups,
  setOpenThreshold,
  updateGroup,
  waitlistCsv,
} from "@/lib/groups.server";

/**
 * The panel's groups and waitlist (behind the session, see app/api/admin/[...path]/route.ts):
 *
 *   GET groups · POST groups (a new group, closed) · PUT groups/<id> · GET groups/<id>/matches
 *   PUT groups/settings (the open-threshold)
 *   GET waitlist · GET waitlist/export (CSV, with the same filters) · DELETE waitlist/<id>
 *   POST waitlist/purge ({ days }: entries older than that many days)
 *
 * Nothing here sends a message: the team writes to the people listed by hand.
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The groups page's data: every group with its label, counts and whether it has its own WhatsApp link; late payments. */
export async function groupsView() {
  const s = await groupStates();
  const src = defaultSource();
  const groups = await Promise.all(
    s.groups.map(async (g) => {
      const text = await src.text(g.id).catch(() => null);
      // ownLink: the group's own link file (else its course and group type's community link).
      return { ...g, label: groupLabelTr(g), ownLink: text !== null && parseLink(text) !== null && !/^(normal|yogun)-(kadin|erkek)$/.test(g.id) };
    }),
  );
  return { ...s, groups };
}

/** The waitlist page's data: entries (newest first), the demand summary and its open-threshold. */
export async function waitlistView() {
  const [entries, { openThreshold }] = await Promise.all([listWaitlist(), readGroups()]);
  return { entries, openThreshold, demand: demandSummary(entries, openThreshold) };
}

function filterFrom(params: URLSearchParams): WaitlistFilter {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const v = params.get(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  };
  const f: WaitlistFilter = {};
  const course = pick("course", ["regular", "intensive"] as const);
  const gender = pick("gender", ["Kadın", "Erkek"] as const);
  const level = pick("level", LEVELS);
  const day = pick("day", DAYS);
  const time = pick("time", TIME_SLOT_KEYS);
  if (course) f.course = course;
  if (gender) f.gender = gender;
  if (level) f.level = level;
  if (day) f.day = day;
  if (time) f.time = time;
  return f;
}

export async function groupsApi(route: string, method: string, url: URL, body: () => Promise<unknown>): Promise<Response | null> {
  try {
    if (route === "groups" && method === "GET") return json(await groupsView());
    if (route === "groups" && method === "POST") return json({ group: await addGroup(await body()) });
    if (route === "groups/settings" && method === "PUT") {
      const b = (await body()) as { openThreshold?: unknown } | null;
      return json({ openThreshold: await setOpenThreshold(b?.openThreshold) });
    }
    const one = /^groups\/([a-z0-9-]{1,60})(\/matches)?$/.exec(route);
    if (one && !one[2] && method === "PUT") return json(await updateGroup(one[1]!, await body()));
    if (one && one[2] && method === "GET") {
      const group = (await readGroups()).groups.find((g) => g.id === one[1]);
      if (!group) return json({ error: "Bilinmeyen grup." }, 404);
      return json({ matches: matchingEntries(group, await listWaitlist()) });
    }

    if (route === "waitlist" && method === "GET") return json(await waitlistView());
    if (route === "waitlist/export" && method === "GET") {
      const entries = filterWaitlist(await listWaitlist(), filterFrom(url.searchParams));
      return new Response(waitlistCsv(entries), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bekleme-listesi-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (route === "waitlist/purge" && method === "POST") {
      const b = (await body()) as { days?: unknown } | null;
      return json({ removed: await purgeWaitlist(b?.days) });
    }
    const entry = /^waitlist\/([a-f0-9]{16})$/.exec(route);
    if (entry && method === "DELETE") return json({ removed: await deleteWaitlistEntry(entry[1]!) });
  } catch (e) {
    if (e instanceof GroupError) return json({ error: e.message }, e.status);
    throw e;
  }
  return null;
}
