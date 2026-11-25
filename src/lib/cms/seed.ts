import siteJson from "../../../content/site.json";
import ar from "../../../content/pages/standart/ar.json";
import en from "../../../content/pages/standart/en.json";
import meta from "../../../content/pages/standart/meta.json";
import settings from "../../../content/pages/standart/settings.json";
import tr from "../../../content/pages/standart/tr.json";
import type { LangContent, PageMeta, PageSettings, SiteConfig } from "./types";

/**
 * The seed: the repository's content/ files, built into the server bundle so no host has to read
 * them from disk (Cloudflare Workers have no file system). A page that exists only here is served
 * as it is; the panel's first change to it is stored (DATA_DIR or D1). scripts/import-seed.mjs loads
 * the same files into D1.
 */
export type SeedPage = { meta: PageMeta; settings: PageSettings; content: Record<string, LangContent> };

export const SEED_SITE = siteJson as unknown as SiteConfig;

/**
 * A stored page with the seed's interface strings for keys it lacks: strings added to the site
 * since the page was stored (the waitlist's, for one) show without anyone editing the page.
 */
export function withSeedUi(code: string, c: LangContent, fallbackCode: string): LangContent {
  const seed = SEED_PAGES["standart"]?.content[code]?.ui ?? SEED_PAGES["standart"]?.content[fallbackCode]?.ui ?? {};
  return { ...c, ui: { ...seed, ...c.ui } };
}

export const SEED_PAGES: Record<string, SeedPage> = {
  standart: {
    meta: meta as unknown as PageMeta,
    settings: settings as unknown as PageSettings,
    content: { tr: tr as unknown as LangContent, en: en as unknown as LangContent, ar: ar as unknown as LangContent },
  },
};
