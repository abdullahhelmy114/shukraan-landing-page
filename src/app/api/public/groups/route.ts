import { publicGroups } from "@/lib/groups.server";

export const dynamic = "force-dynamic";

/** The groups the page shows (open or full), without capacity or counts: the form checks it before payment. */
export async function GET() {
  return Response.json({ groups: await publicGroups() }, { headers: { "Cache-Control": "no-store" } });
}
