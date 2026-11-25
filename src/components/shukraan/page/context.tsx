"use client";

import { createContext, use, type ReactNode } from "react";

import type { Op } from "@/lib/cms/ops";
import type { Translate } from "@/lib/cms/i18n";
import type { ImageField, LangContent, PageMeta, PageSettings, SiteConfig } from "@/lib/cms/types";
import type { PublicGroup } from "@/lib/groups";

/** What the editor supplies while a page is in edit mode. */
export type EditApi = {
  lang: string;
  apply: (ops: Op[]) => void;
  /** Opens the image dialog (upload, alt text in every language) for the image at `path`. */
  pickImage: (path: string[], image: ImageField) => void;
  /** Opens the field list of a section (links, switches and anything not shown on the page). */
  openFields: (sectionId: string) => void;
  /** Tells the editor a rich-text field has focus (for its formatting buttons). */
  focusRich: (el: HTMLElement | null) => void;
  /** Opens the share dialog for a section (its public link, share buttons and an image). */
  shareSection: (sectionId: string) => void;
};

export type PageCtx = {
  site: SiteConfig;
  meta: PageMeta;
  settings: PageSettings;
  content: LangContent;
  lang: string;
  dir: "ltr" | "rtl";
  isStandard: boolean;
  t: Translate;
  /** An amount with this language's digit grouping. */
  num: (n: number) => string;
  /** Other languages of this page, for the language switcher. */
  links: { code: string; label: string; href: string }[];
  edit: EditApi | null;
  /** The groups the page shows (open and full), without capacity or counts. */
  groups: PublicGroup[];
};

const Ctx = createContext<PageCtx | null>(null);

export function PageProvider({ value, children }: { value: PageCtx; children: ReactNode }) {
  return <Ctx value={value}>{children}</Ctx>;
}

export function usePage(): PageCtx {
  const v = use(Ctx);
  if (!v) throw new Error("usePage needs a PageProvider");
  return v;
}

/** The page context, or null outside a page (the form also runs on its own in tests). */
export const usePageMaybe = () => use(Ctx);

/** Scrolls to a section by id. */
export const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
