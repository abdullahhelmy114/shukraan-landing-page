import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { WaitlistAdmin } from "@/components/admin/WaitlistAdmin";
import { SESSION_COOKIE, verifySession } from "@/lib/cms/auth.server";
import { waitlistView } from "@/lib/groups-admin.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "قائمة الانتظار", robots: { index: false, follow: false } };

/** The waitlist and its demand summary (the panel only). */
export default async function Page() {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/admin");
  return <WaitlistAdmin initial={await waitlistView()} />;
}
