import type { PublicGroup } from "@/lib/groups";

/** Content model for the landing pages (shared by the server, the page and the editor). */

export type Language = { code: string; label: string; dir: "ltr" | "rtl" };

export type SiteConfig = {
  defaultLanguage: string;
  /** Shown when a language has no text of its own (for example the tagline). */
  fallbackLanguage: string;
  /** The standard template, served at "/" and "/<language>". */
  standardPage: string;
  languages: Language[];
  /**
   * The academy's name: in Arabic and in Latin letters, and the form the lockup shows on each
   * language's page ("Arabic | Latin" on Arabic pages, "Latin | Arabic" elsewhere), exactly as the
   * owner wrote it. A language without its own form uses the English one.
   */
  brand: { arabic: string; latin: string; names: Record<string, string> };
  tagline: Record<string, string>;
};

/** The background a lockup sits on. */
export type Tone = "navy" | "cream" | "gold";
/**
 * 1 cream on dark navy · 2 light gold on dark navy · 3 dark navy on cream · 4 dark navy on mustard gold.
 */
export type Scheme = 1 | 2 | 3 | 4;
export type LockupSetting = { tone: Tone; scheme: "auto" | Scheme };

export type CheckoutMode = "standard" | "plan" | "link";

export type PageSettings = {
  /**
   * standard: the two-course registration form; plan: one Whop plan embedded; link: a Whop checkout
   * link. promoCode (standard only): a discount code applied when the page opens, so the prices show
   * the old price struck through and the price that is charged ("" for none).
   */
  checkout: { mode: CheckoutMode; planId: string; url: string; promoCode: string };
  whatsapp: { number: string; message: Record<string, string> };
  lockup: { header: LockupSetting; footer: LockupSetting };
};

export type PageMeta = { slug: string; courseName: string; archived: boolean; createdAt?: string; updatedAt?: string; publishedAt?: string };

export const SECTION_TYPES = [
  "hero",
  "features",
  "timetable",
  "pricing",
  "payment",
  "faq",
  "testimonials",
  "cta",
  "whatsapp",
  "richtext",
  "phrases",
  "program",
  "steps",
  "instructor",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type Section = { id: string; type: SectionType; hidden?: boolean; fields: Record<string, unknown> };

export type ImageField = { src: string; alt: string };

export type LangContent = {
  seo: { title: string; description: string; shareDescription: string; image: string };
  header: {
    nav: { id: string; label: string; target: string }[];
    cta: { label: string; target: string };
    mobileCta: string;
  };
  footer: { contact: string; social: { id: string; label: string; href: string }[] };
  ui: Record<string, string>;
  sections: Section[];
};

/** Everything a page view needs. */
export type PageBundle = {
  site: SiteConfig;
  meta: PageMeta;
  settings: PageSettings;
  lang: Language;
  content: LangContent;
  /** The fallback language's interface strings, for keys this language lacks. */
  fallbackUi: Record<string, string>;
  /** Where each language of this page lives, for the language switcher. */
  links: { code: string; label: string; href: string }[];
  isStandard: boolean;
  /** The groups the page shows (open and full), without capacity or counts. */
  groups?: PublicGroup[];
};

/** A trashed section: its content in every language, kept 30 days. */
export type TrashEntry = { id: string; deletedAt: string; index: number; type: SectionType; title: string; sections: Record<string, Section> };

export type VersionInfo = { id: string; publishedAt: string; note?: string };
