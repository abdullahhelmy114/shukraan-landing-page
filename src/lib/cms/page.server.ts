import type { Metadata } from "next";
import { headers } from "next/headers";

import { nameFor } from "./i18n";
import { pageHref } from "./links";
import { publicGroups } from "@/lib/groups.server";

import { withSeedUi } from "./seed";
import { readDraft, readPublished, readSite, type PageState } from "./store.server";
import { sanitizeContent } from "./sanitize.server";
import type { PageBundle, SiteConfig } from "./types";

export { pageHref };

async function toBundle(site: SiteConfig, state: PageState, langCode: string, referral?: string): Promise<PageBundle | null> {
  const lang = site.languages.find((l) => l.code === langCode);
  const stored = state.content[langCode];
  if (!lang || !stored) return null;
  const content = withSeedUi(langCode, stored, site.fallbackLanguage);
  const fallback = withSeedUi(site.fallbackLanguage, state.content[site.fallbackLanguage] ?? stored, site.fallbackLanguage);
  return {
    site,
    meta: state.meta,
    settings: state.settings,
    lang,
    content: sanitizeContent(content),
    fallbackUi: fallback.ui,
    links: site.languages.map((l) => ({ code: l.code, label: l.label, href: pageHref(site, state.meta.slug, l.code, referral) })),
    isStandard: state.meta.slug === site.standardPage,
    groups: await publicGroups(),
  };
}

/** A published, not archived page in a language, as visitors see it; null when there is none. */
export async function loadPublic(slug: string, langCode: string, referral?: string): Promise<PageBundle | null> {
  const site = await readSite();
  const state = await readPublished(slug, site);
  if (!state || state.meta.archived) return null;
  return toBundle(site, state, langCode, referral);
}

/** A page's draft in a language (the editor and preview links). */
export async function loadDraft(slug: string, langCode: string): Promise<PageBundle | null> {
  const site = await readSite();
  const state = await readDraft(slug, site);
  if (!state) return null;
  return toBundle(site, state, langCode);
}

/** The site's address as the visitor reached it, for absolute share-image URLs. */
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return new URL(`${proto.split(",")[0]!.trim()}://${host}`);
}

const OG_LOCALE: Record<string, string> = { tr: "tr_TR", en: "en_US", ar: "ar_AR" };

/** Title, description, share card and language alternates for a page. */
export async function pageMetadata(b: PageBundle, opts: { noindex?: boolean } = {}): Promise<Metadata> {
  const seo = b.content.seo;
  const image = seo.image || `/images/og/og-${b.lang.code}.png`;
  return {
    metadataBase: await origin(),
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: b.links.find((l) => l.code === b.lang.code)?.href ?? "/",
      languages: Object.fromEntries(b.links.map((l) => [l.code, l.href])),
    },
    openGraph: {
      title: seo.title,
      description: seo.shareDescription || seo.description,
      type: "website",
      locale: OG_LOCALE[b.lang.code] ?? b.lang.code,
      images: [{ url: image, width: 1200, height: 630, alt: nameFor(b.site.brand, b.lang.code) }],
    },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.shareDescription || seo.description, images: [image] },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** The page language for a request path (the root layout's <html lang dir>). */
export async function languageForPath(pathname: string) {
  const site = await readSite();
  const seg = pathname.split("/").filter(Boolean);
  let code = site.defaultLanguage;
  if (seg[0] === "admin") code = "ar";
  else if (seg[0] === "preview" && seg[2]) code = decodeURIComponent(seg[2]);
  else if (seg[0] && site.languages.some((l) => l.code === seg[0])) code = seg[0];
  const lang = site.languages.find((l) => l.code === code);
  return { site, code: lang?.code ?? (code === "ar" ? "ar" : site.defaultLanguage), dir: lang?.dir ?? (code === "ar" ? "rtl" : "ltr") };
}
