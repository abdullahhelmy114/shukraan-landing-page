import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { GroupsAdmin } from "@/components/admin/GroupsAdmin";
import { SESSION_COOKIE, verifySession } from "@/lib/cms/auth.server";
import { groupsView } from "@/lib/groups-admin.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المجموعات", robots: { index: false, follow: false } };

/** The groups: status, capacity, paid places and places left (the panel only). */
export default async function Page() {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/admin");
  return <GroupsAdmin initial={await groupsView()} />;
}
