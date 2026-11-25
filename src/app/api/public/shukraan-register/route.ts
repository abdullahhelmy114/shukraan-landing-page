import { neon } from "@neondatabase/serverless";

import { checkDataDir, dataDirError } from "@/lib/data-dir.server";
import { savedGroupId } from "@/lib/groups";
import { groupLabelTr, readGroups, reserveSeat } from "@/lib/groups.server";
import { registrationSchema as schema } from "@/lib/registration-schema";
import { inviteForScheduledGroup } from "@/lib/whatsapp-invites";

/**
 * Saves a paid registration. Its group's place is taken first, atomically (DATA_DIR/
 * registrations.json): if the group filled while this person was paying, the answer has no
 * WhatsApp link (full: true) and the payment is listed in the panel for the team. Then the
 * registration is stored in Neon as before, with the group and that outcome in `availability`.
 */
export async function POST(request: Request) {
  const url = process.env["DATABASE_URL"];
  if (!url) return Response.json({ error: "DATABASE_URL is not configured" }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // The chosen group; a page from before the groups sends none: its course and group type's first open group.
  const { groups } = await readGroups();
  const group =
    groups.find((g) => g.id === d.group) ??
    groups.find((g) => savedGroupId(g) === d.group_id && g.status !== "closed") ??
    groups.find((g) => savedGroupId(g) === d.group_id);
  if (!group || savedGroupId(group) !== d.group_id || group.gender !== d.gender) return Response.json({ error: "Invalid input" }, { status: 400 });

  const store = await checkDataDir();
  if (!store.ok) {
    console.error(dataDirError(store));
    return Response.json({ error: "Storage unavailable" }, { status: 503 });
  }
  let seat: boolean;
  try {
    ({ seat } = await reserveSeat({ ref: d.ref || `legacy:${d.email.toLowerCase()}:${d.group_id}`, groupId: group.id, name: d.full_name, whatsapp: d.whatsapp, email: d.email }));
  } catch (error) {
    console.error("shukraan register: could not record the group place", error);
    return Response.json({ error: "Storage error" }, { status: 500 });
  }
  const availability = `${group.id} · ${groupLabelTr(group)}${seat ? "" : " · DOLDU: yer kalmadı, ekip iletişime geçecek"}`;

  try {
    const sql = neon(url);
    await sql`
      CREATE TABLE IF NOT EXISTS shukraan_registrations (
        id BIGSERIAL PRIMARY KEY,
        gender TEXT NOT NULL,
        group_id TEXT NOT NULL,
        level TEXT NOT NULL,
        availability TEXT,
        full_name TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        email TEXT NOT NULL,
        goal TEXT NOT NULL,
        eligibility TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    const rows = await sql`
      INSERT INTO shukraan_registrations
        (gender, group_id, level, availability, full_name, whatsapp, email, goal, eligibility)
      VALUES (${d.gender}, ${d.group_id}, ${d.level}, ${availability}, ${d.full_name},
              ${d.whatsapp}, ${d.email}, ${d.goal}, ${d.eligibility})
      RETURNING id`;
    const id = rows[0]?.["id"] ?? null;
    // The group filled while this person was paying: no link; the team gets in touch.
    if (!seat) return Response.json({ ok: true, id, full: true, whatsapp: null });
    // The group's WhatsApp link and QR code (its own files, else its course and group type's).
    const whatsapp = await inviteForScheduledGroup(group).catch((error) => {
      console.error("shukraan whatsapp invite read failed", error);
      return null;
    });
    return Response.json({ ok: true, id, whatsapp });
  } catch (error) {
    console.error("shukraan register insert failed", error);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
