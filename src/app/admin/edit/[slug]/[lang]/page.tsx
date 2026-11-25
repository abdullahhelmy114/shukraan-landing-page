import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Editor } from "@/components/admin/Editor";
import { SESSION_COOKIE, verifySession } from "@/lib/cms/auth.server";
import { withSeedUi } from "@/lib/cms/seed";
import { hasUnpublished, listVersions, readDraft, readPublished, readSite, readTrash } from "@/lib/cms/store.server";
import { publicGroups } from "@/lib/groups.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تحرير الصفحة", robots: { index: false, follow: false } };

export default async function EditPage({ params }: { params: Promise<{ slug: string; lang: string }> }) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/admin");
  const { slug, lang } = await params;
  const site = await readSite();
  if (!site.languages.some((l) => l.code === lang)) notFound();
  const draft = await readDraft(slug, site);
  if (!draft) notFound();
  const [trash, versions, unpublished, live, groups] = await Promise.all([readTrash(slug), listVersions(slug), hasUnpublished(slug), readPublished(slug, site), publicGroups()]);
  // Interface strings added since this page was stored show (and can be edited) with the seed's text.
  const content = Object.fromEntries(Object.entries(draft.content).map(([code, c]) => [code, withSeedUi(code, c, site.fallbackLanguage)]));
  return <Editor key={`${slug}/${lang}`} slug={slug} lang={lang} initial={{ site, ...draft, content, trash, versions, unpublished, published: live !== null, groups }} />;
}
