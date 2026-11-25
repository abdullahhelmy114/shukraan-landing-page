"use client";

import { useEffect, useMemo, useState } from "react";

import { groupDigits, makeT } from "@/lib/cms/i18n";
import type { PageBundle } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import type { CourseType } from "../data";
import { DiscountProvider, useDiscountState } from "../discount";
import { useScrollMotion } from "../motion";
import type { Preset } from "../RegisterForm";
import { whatsappHref } from "@/lib/whatsapp-link";
import { WhatsAppFloat } from "../WhatsAppFloat";
import { Footer, Header } from "./Chrome";
import { DEFAULT_GROUPS, toPublic, type PublicGroup } from "@/lib/groups";

import { go, PageProvider, type EditApi, type PageCtx } from "./context";
import { Sections } from "./sections";

/**
 * A landing page from its content: the header band, the sections in order and the footer band,
 * with the mobile sign-up bar and the floating WhatsApp button. The editor renders the same view
 * with `edit` set, so what is edited is the real page.
 */
const DEFAULT_PUBLIC_GROUPS = DEFAULT_GROUPS.map((g) => toPublic(g, 0)).filter((g): g is PublicGroup => g !== null);

export function PageView({ bundle, referral, edit = null }: { bundle: PageBundle; referral?: string; edit?: EditApi | null }) {
  const { site, meta, settings, content, lang, fallbackUi, links, isStandard } = bundle;
  const groups = bundle.groups ?? DEFAULT_PUBLIC_GROUPS;
  const t = useMemo(() => makeT(content.ui, fallbackUi), [content.ui, fallbackUi]);
  const ctx: PageCtx = useMemo(() => {
    const sep = t("numberGroup");
    return {
      site,
      meta,
      settings,
      content,
      lang: lang.code,
      dir: lang.dir,
      isStandard,
      t,
      num: (n: number) => groupDigits(n, sep === "numberGroup" ? "." : sep),
      links,
      edit,
      groups,
    };
  }, [site, meta, settings, content, lang, isStandard, t, links, edit, groups]);

  useScrollMotion();
  // One discount code for the whole page: entered in the prices or the payment step, shown in every price.
  const discount = useDiscountState();
  const { applyReferral, applyPromo } = discount;
  // A referral link applies its own code; otherwise the page's offer code (if any) is applied, so
  // the prices show the old price struck through and the price that is charged.
  const promo = settings.checkout.mode === "standard" ? settings.checkout.promoCode : "";
  useEffect(() => {
    if (referral) void applyReferral(referral);
    else if (promo) void applyPromo(promo);
  }, [referral, applyReferral, promo, applyPromo]);
  const [preset, setPreset] = useState<Preset>(null);
  // A price card's button opens the form with its course chosen.
  const paymentId = content.sections.find((s) => s.type === "payment" && !s.hidden)?.id;
  const chooseCourse = (course: CourseType) => {
    setPreset({ course, nonce: Date.now() });
    if (paymentId) go(paymentId);
  };

  // The mobile sign-up bar stays out of the way while prices, the form, the closing band (which
  // has its own button) or the footer are on screen.
  const [ctaHidden, setCtaHidden] = useState(false);
  useEffect(() => {
    if (edit) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      setCtaHidden(visible.size > 0);
    });
    document.querySelectorAll("[data-cta-zone], #iletisim").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [edit, content.sections]);
  const showBar = !edit && !!content.header.mobileCta && !!content.header.cta.target;
  // The floating WhatsApp button reads this to sit above the sign-up bar while it shows.
  useEffect(() => {
    const root = document.documentElement;
    if (showBar) root.dataset["ctaBar"] = ctaHidden ? "off" : "on";
    return () => {
      delete root.dataset["ctaBar"];
    };
  }, [ctaHidden, showBar]);

  // Analytics events say which page and language they come from (beyond the standard page in
  // the default language).
  useEffect(() => {
    if (edit) return;
    const root = document.documentElement;
    if (!isStandard) root.dataset["page"] = meta.slug;
    if (lang.code !== site.defaultLanguage) root.dataset["analyticsLang"] = lang.code;
    return () => {
      delete root.dataset["page"];
      delete root.dataset["analyticsLang"];
    };
  }, [edit, isStandard, meta.slug, lang.code, site.defaultLanguage]);

  const wa = settings.whatsapp;
  return (
    <PageProvider value={ctx}>
      <DiscountProvider value={discount}>
        <div lang={lang.code} dir={lang.dir} className={cn("page-root", edit && "cms-editing")}>
          <Header />
          <main className="min-h-screen bg-background">
            <Sections onChooseCourse={chooseCourse} preset={preset} />
            {showBar && (
              <button
                type="button"
                onClick={() => go(content.header.cta.target)}
                className={`fixed inset-x-4 bottom-4 z-40 rounded-full bg-gold py-3.5 text-sm font-semibold text-accent-foreground shadow-gold transition-opacity md:hidden ${ctaHidden ? "pointer-events-none opacity-0" : ""}`}
              >
                {content.header.mobileCta}
              </button>
            )}
          </main>
          <Footer />
          {!edit && wa.number && <WhatsAppFloat href={whatsappHref(wa.number, wa.message[lang.code] ?? "")} ariaLabel={t("float.aria")} label={t("float.label")} />}
        </div>
      </DiscountProvider>
    </PageProvider>
  );
}
