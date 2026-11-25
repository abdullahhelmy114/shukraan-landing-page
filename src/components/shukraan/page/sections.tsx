"use client";

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { courseKey, track, trackOnce } from "@/lib/analytics";
import { SECTION_LABELS } from "@/lib/cms/sections";
import { SECTION_TYPES, type ImageField, type Section, type SectionType } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import type { CourseType } from "../data";
import { DiscountField, useCoursePrice } from "../discount";
import { Emblem } from "../Emblem";
import { Eyebrow } from "../Eyebrow";
import { RegisterForm, type Preset } from "../RegisterForm";
import { Waitlist } from "../Waitlist";
import { daysText, meetingTimes } from "@/lib/groups";
import { SOCIAL_GLYPHS } from "../social-icons";
import { whatsappHref } from "@/lib/whatsapp-link";
import { WhopCheckout } from "../WhopCheckout";
import { go, usePage } from "./context";
import { Btn, Img, Item, ListAdd, Rich, Txt, type ButtonField } from "./Editable";

type Fields = Record<string, unknown>;
type Path = string[];
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T,>(v: unknown) => (v && typeof v === "object" ? (v as T) : undefined);
const css = (vars: Record<string, string | number>) => vars as CSSProperties;

export type SectionProps = { s: Section; base: Path; onChooseCourse: (course: CourseType) => void; preset: Preset };

/** An eyebrow line that disappears from the public page when empty. */
function Eye({ path, value, light }: { path: Path; value: unknown; light?: boolean }) {
  const { edit } = usePage();
  if (!edit && !str(value)) return null;
  return (
    <Eyebrow light={light}>
      <Txt path={path} value={str(value)} />
    </Eyebrow>
  );
}

const p = (base: Path) => (...k: string[]) => [...base, ...k];
const at = (id: string) => `#${id}`;

// ── Hero ─────────────────────────────────────────────────────────────────────────────────────
function Hero({ s, base }: SectionProps) {
  const { edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const badges = arr<{ id: string; text: string }>(f["badges"]);
  const img = obj<ImageField>(f["image"]);
  return (
    <section id={s.id} className="relative isolate flex min-h-[88svh] items-center overflow-hidden bg-navy-deep text-on-navy">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div className="reveal">
          {(badges.length > 0 || edit) && (
            <div className="flex flex-wrap gap-2">
              {badges.map((b, i) => (
                <Item key={b.id} list={P("badges")} id={b.id} index={i} count={badges.length} as="span" className="inline-flex rounded-full border border-gold/40 px-4 py-1.5 text-xs tracking-[0.2em] text-gold-soft">
                  <Txt path={P("badges", at(b.id), "text")} value={b.text} />
                </Item>
              ))}
              {badges.length === 0 && <ListAdd list={P("badges")} template={{ text: "" }} label="+ شارة" />}
            </div>
          )}
          <Txt as="p" path={P("arabicLine")} value={str(f["arabicLine"])} className="mt-6 font-arabic text-2xl text-gold sm:text-3xl" dir="rtl" />
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] sm:text-7xl">
            <Txt path={P("title")} value={str(f["title"])} />
            <Txt path={P("titleAccent")} value={str(f["titleAccent"])} className="mt-2 block italic text-gold" />
          </h1>
          <Rich path={P("bodyHtml")} html={str(f["bodyHtml"])} className="hero-body mt-7 max-w-xl text-base leading-relaxed text-on-navy/75 sm:text-lg" />
          <div className="mt-9 flex flex-wrap gap-3">
            <Btn path={P("primary")} value={obj<ButtonField>(f["primary"])} className="rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-accent-foreground transition hover:scale-[1.04]" />
            <Btn path={P("secondary")} value={obj<ButtonField>(f["secondary"])} className="rounded-full border border-on-navy/30 px-7 py-3.5 text-sm font-medium text-on-navy transition hover:border-gold hover:text-gold" />
          </div>
          <Txt as="p" path={P("note")} value={str(f["note"])} className="mt-6 text-xs tracking-wide text-on-navy/55" />
        </div>
        {(img?.src || edit) && (
          <div className="relative mx-auto w-full max-w-xl">
            <div className="pointer-events-none absolute -inset-3 rounded-[2rem] border border-gold/40" />
            <Img path={P("image")} image={img} className="relative aspect-[16/10] w-full rounded-[1.75rem] object-cover shadow-elegant" />
          </div>
        )}
      </div>
    </section>
  );
}

// ── Phrases (pinned scene: each phrase takes a turn, revealing its words on scroll) ──────────
function Phrases({ s, base }: SectionProps) {
  const { edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const items = arr<{ id: string; ar: string; level: string }>(f["items"]);
  return (
    <section id={s.id} data-pin={edit ? undefined : ""} className="phrase-scroll relative bg-navy-deep text-on-navy" style={css({ "--count": Math.max(1, items.length) })}>
      <div className="phrase-stage sticky top-0 flex h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-24 pt-16 sm:px-8">
        <Eye light path={P("eyebrow")} value={f["eyebrow"]} />
        <div className="relative mt-10 grid min-h-48 w-full max-w-3xl items-center">
          {items.map((ph, i) => (
            <Item
              key={ph.id}
              list={P("items")}
              id={ph.id}
              index={i}
              count={items.length}
              className="phrase-card glass-navy col-start-1 row-start-1 rounded-2xl px-6 py-8 text-center shadow-elegant sm:px-10 sm:py-12"
              style={css({ "--phrase": i, "--count": items.length })}
            >
              <Txt path={P("items", at(ph.id), "level")} value={ph.level} className="inline-flex rounded-full border border-gold/40 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-gold-soft" />
              <p className="mt-3 font-arabic text-3xl leading-loose text-gold sm:text-5xl" dir="rtl" lang="ar">
                {edit ? (
                  <Txt path={P("items", at(ph.id), "ar")} value={ph.ar} />
                ) : (
                  ph.ar.split(" ").map((word, wi, words) => (
                    <span key={wi} className="phrase-word inline-block" style={css({ "--word": wi, "--words": words.length })}>
                      {word}
                      {" "}
                    </span>
                  ))
                )}
              </p>
            </Item>
          ))}
          {items.length === 0 && <ListAdd list={P("items")} template={{ ar: "", level: "A2" }} />}
        </div>
      </div>
    </section>
  );
}

// ── Program (pinned two-column scene) ────────────────────────────────────────────────────────
function Program({ s, base }: SectionProps) {
  const { edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const quote = str(f["quote"]);
  const acts = arr<{ id: string; text: string }>(f["activities"]);
  return (
    <section id={s.id} data-pin={edit ? undefined : ""} className="program-scroll relative scroll-mt-4" style={css({ "--p": 0 })}>
      <div className="program-stage relative flex flex-col justify-center py-16">
        <Txt
          as="p"
          path={P("marquee")}
          value={str(f["marquee"])}
          className={edit ? "mx-auto mb-6 w-full max-w-7xl px-4 font-serif text-3xl italic text-primary/30 sm:px-8" : "program-marquee pointer-events-none absolute top-24 hidden whitespace-nowrap font-serif text-9xl font-semibold italic leading-none text-primary/[0.05] lg:block"}
        />
        <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-8 lg:grid-cols-2 lg:gap-12">
          <div className="program-col-a">
            <Eye path={P("eyebrow")} value={f["eyebrow"]} />
            <h2 className="mt-5 text-4xl font-semibold leading-tight text-primary sm:text-6xl">
              {edit ? (
                <Txt path={P("quote")} value={quote} />
              ) : (
                quote.split(" ").map((w, i, a) => (
                  <span key={i} className="program-word inline-block transition-opacity" style={{ opacity: `clamp(0.12, calc(var(--p) * ${a.length * 2.2} - ${i}), 1)` }}>
                    {w}
                    {" "}
                  </span>
                ))
              )}
            </h2>
            <Rich path={P("introHtml")} html={str(f["introHtml"])} className="mt-6 max-w-lg leading-relaxed text-muted-foreground" />
            <Rich path={P("audienceHtml")} html={str(f["audienceHtml"])} className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground" />
          </div>
          <div className="program-col-b min-w-0 lg:py-2">
            <Txt as="h3" path={P("activitiesTitle")} value={str(f["activitiesTitle"])} className="text-2xl font-semibold text-primary" />
            <ul className="mt-6 space-y-3">
              {acts.map((a, i) => (
                <Item
                  key={a.id}
                  list={P("activities")}
                  id={a.id}
                  index={i}
                  count={acts.length}
                  as="li"
                  className="program-activity flex items-start gap-4 rounded-2xl border border-gold/20 bg-card/70 p-4"
                  style={edit ? undefined : css({ "--a": `clamp(0, calc(var(--p) * 6 - ${i * 0.7}), 1)` })}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full gradient-navy font-serif text-sm text-gold">{i + 1}</span>
                  <Txt path={P("activities", at(a.id), "text")} value={a.text} className="pt-1 text-sm text-foreground" />
                </Item>
              ))}
            </ul>
            {acts.length === 0 && <ListAdd list={P("activities")} template={{ text: "" }} />}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Steps (stacked sticky cards) ─────────────────────────────────────────────────────────────
function Steps({ s, base }: SectionProps) {
  const f = s.fields;
  const P = p(base);
  const items = arr<{ id: string; n: string; title: string; body: string }>(f["items"]);
  return (
    <section id={s.id} className="relative scroll-mt-4 bg-secondary/60 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="lg:sticky lg:top-12 lg:self-start">
          <Eye path={P("eyebrow")} value={f["eyebrow"]} />
          <Txt as="h2" path={P("title")} value={str(f["title"])} className="mt-5 text-4xl font-semibold leading-tight text-primary sm:text-6xl" />
          <Txt as="p" path={P("subtitle")} value={str(f["subtitle"])} className="mt-5 max-w-md text-lg italic text-primary/80" />
        </div>
        <div className="space-y-8">
          {items.map((it, i) => (
            <Item key={it.id} list={P("items")} id={it.id} index={i} count={items.length} as="article" className="step-card sticky rounded-3xl bg-card p-8 shadow-elegant ring-1 ring-gold/25 sm:p-10" style={css({ "--i": i })}>
              <div className="flex items-start gap-6">
                <Txt path={P("items", at(it.id), "n")} value={it.n} className="font-serif text-6xl font-semibold text-gold-shine" />
                <div>
                  <Txt as="h3" path={P("items", at(it.id), "title")} value={it.title} className="text-2xl font-semibold text-primary" />
                  <Txt as="p" path={P("items", at(it.id), "body")} value={it.body} className="mt-3 leading-relaxed text-muted-foreground" multiline />
                </div>
              </div>
            </Item>
          ))}
          {items.length === 0 && <ListAdd list={P("items")} template={{ n: "01", title: "", body: "" }} />}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────────────────────
/** The offer line above the prices, with the offer's code picked out. */
function PromoNote({ path, text, code }: { path: Path; text: string; code: string }) {
  const { edit } = usePage();
  const pos = code ? text.indexOf(code) : -1;
  if (edit || pos < 0) return <Txt as="p" path={path} value={text} className="promo-note mt-5" />;
  return (
    <p className="promo-note mt-5">
      {text.slice(0, pos)}
      <b className="promo-code" dir="ltr">
        {code}
      </b>
      {text.slice(pos + code.length)}
    </p>
  );
}

type Card = { id: string; course: string; title: string; price?: string; total?: string; meta: string; live: string; button: string };
type Coffee = { title: string; text: string; small: string; sip: string };

function CoffeeCard({ path, c }: { path: Path; c: Coffee }) {
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    e.currentTarget.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const reset = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--mx", "0");
    e.currentTarget.style.setProperty("--my", "0");
  };
  return (
    <div onPointerMove={move} onPointerLeave={reset} className="coffee-card reveal group relative mt-12 overflow-hidden rounded-[2rem] bg-card p-8 text-foreground shadow-elegant sm:p-10">
      <div aria-hidden className="coffee-glow pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-gold/25 blur-3xl" />
      <div className="relative grid items-center gap-8 sm:grid-cols-[auto_1fr]">
        <div aria-hidden className="coffee-cup relative mx-auto h-36 w-32">
          <p className="coffee-hello absolute inset-x-0 top-0 text-center font-arabic text-2xl text-gold" dir="rtl">
            مرحبًا
          </p>
          <svg viewBox="0 0 120 140" className="absolute inset-0 h-full w-full">
            <g className="coffee-steam" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M45 50c-8-10 8-16 0-28" className="text-gold/70" />
              <path d="M60 52c-8-10 8-16 0-30" className="text-gold/70" />
              <path d="M75 50c-8-10 8-16 0-28" className="text-gold/70" />
            </g>
            <path d="M22 66h72v26c0 20-16 34-36 34S22 112 22 92z" className="fill-primary" />
            <path d="M94 74h6a12 12 0 0 1 0 24h-8" fill="none" strokeWidth="5" className="stroke-primary" />
            <path d="M28 70h60" strokeWidth="2" className="stroke-gold" />
            <ellipse cx="58" cy="132" rx="46" ry="5" className="fill-gold/40" />
          </svg>
        </div>
        <div>
          <Txt as="h3" path={[...path, "title"]} value={c.title} className="font-serif text-3xl font-semibold text-primary sm:text-4xl" />
          <Txt as="p" path={[...path, "text"]} value={c.text} className="mt-2 text-muted-foreground" />
          <Txt as="p" path={[...path, "small"]} value={c.small} className="mt-1 text-sm text-muted-foreground" />
          <Txt as="p" path={[...path, "sip"]} value={c.sip} className="coffee-sip mt-4 font-serif text-lg italic text-gold" />
        </div>
      </div>
    </div>
  );
}

function CoursePrice({ course }: { course: CourseType }) {
  const { regular, discounted } = useCoursePrice(course);
  const { num, t } = usePage();
  const now = discounted ?? regular;
  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1" title="">
        <p className="font-serif text-6xl font-semibold text-primary sm:text-7xl">
          {num(now.perLesson)} <span className="text-xl text-muted-foreground">{t("unitPerLesson")}</span>
        </p>
        {discounted && (
          <s className="pb-2 text-base text-muted-foreground decoration-2 sm:text-lg">
            {num(regular.perLesson)} {t("currency")}
          </s>
        )}
      </div>
      <p className="mt-3 text-base text-foreground">
        {t("packageTotal", { n: now.lessons })}{" "}
        {discounted && (
          <>
            <s className="text-muted-foreground decoration-2">
              {num(regular.total)} {t("currency")}
            </s>{" "}
          </>
        )}
        <b>
          {num(now.total)} {t("currency")}
        </b>
      </p>
    </>
  );
}

function Pricing({ s, base, onChooseCourse }: SectionProps) {
  const { settings, content, meta, edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const cards = arr<Card>(f["cards"]);
  const coffee = obj<Coffee>(f["coffee"]);
  const standard = settings.checkout.mode === "standard";
  const paymentId = content.sections.find((x) => x.type === "payment" && !x.hidden)?.id;
  const choose = (c: Card) => {
    const course = c.course === "regular" || c.course === "intensive" ? c.course : null;
    if (standard && course) {
      track("price_card_click", { course: courseKey(course) });
      onChooseCourse(course);
      return;
    }
    track("price_card_click", { course: meta.slug });
    if (paymentId) go(paymentId);
  };
  return (
    <section id={s.id} data-cta-zone className="relative isolate scroll-mt-4 overflow-hidden gradient-navy py-24 text-on-navy sm:py-32">
      <div data-speed="0.2" className="absolute inset-[-20%] -z-10 geo-pattern opacity-25" />
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="reveal max-w-2xl">
          <Eye light path={P("eyebrow")} value={f["eyebrow"]} />
          <h2 className="mt-5 text-4xl font-semibold leading-tight sm:text-6xl">
            <Txt path={P("title")} value={str(f["title"])} /> <Txt path={P("titleAccent")} value={str(f["titleAccent"])} className="italic text-gold" />
          </h2>
          <Txt as="p" path={P("intro")} value={str(f["intro"])} className="mt-5 text-on-navy/80" multiline />
          {standard && f["showDiscount"] !== false && (
            <>
              <PromoNote path={P("discountNote")} text={str(f["discountNote"])} code={settings.checkout.promoCode} />
              <div className="mt-4 max-w-md">
                <DiscountField tone="navy" />
              </div>
            </>
          )}
        </div>
        {coffee && <CoffeeCard path={P("coffee")} c={coffee} />}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {cards.map((c, i) => {
            const course = standard && (c.course === "regular" || c.course === "intensive") ? c.course : null;
            const C = (...k: string[]) => P("cards", at(c.id), ...k);
            return (
              <Item key={c.id} list={P("cards")} id={c.id} index={i} count={cards.length} className="reveal relative rounded-[2rem] bg-card p-8 text-foreground shadow-elegant sm:p-10" attrs={{ "data-course": c.course || undefined }}>
                <div className="absolute inset-x-10 -top-px h-px gold-rule" />
                <Txt as="p" path={C("title")} value={c.title} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70" />
                {course ? (
                  <CoursePrice course={course} />
                ) : (
                  <>
                    <Txt as="p" path={C("price")} value={c.price} className="mt-4 font-serif text-6xl font-semibold text-primary sm:text-7xl" placeholder="السعر" />
                    <Txt as="p" path={C("total")} value={c.total} className="mt-3 text-base text-foreground" placeholder="الإجمالي" />
                  </>
                )}
                <Txt as="p" path={C("meta")} value={c.meta} className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground" />
                <Txt as="p" path={C("live")} value={c.live} className="mt-1 text-sm text-muted-foreground" />
                {edit ? (
                  <span className="mt-6 inline-block rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-accent-foreground shadow-gold">
                    <Txt path={C("button")} value={c.button} />
                  </span>
                ) : (
                  c.button && (
                    <button type="button" onClick={() => choose(c)} className="mt-6 rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-accent-foreground shadow-gold transition hover:scale-[1.04]">
                      {c.button}
                    </button>
                  )
                )}
              </Item>
            );
          })}
        </div>
        {cards.length === 0 && <ListAdd list={P("cards")} template={{ course: "", title: "", price: "", total: "", meta: "", live: "", button: "" }} />}
      </div>
    </section>
  );
}

// ── Timetable ────────────────────────────────────────────────────────────────────────────────
/** A meeting written lesson by lesson ("11:00 - 11:50 + 12:00 - 12:50"); each lesson stays on one line. */
function LessonTimes({ value }: { value: string }) {
  return (
    <bdi dir="ltr" className="inline-block tabular-nums">
      {value.split(/\s*\+\s*/).map((slot, i) => (
        <Fragment key={i}>
          {i > 0 && " + "}
          <span className="whitespace-nowrap">{slot}</span>
        </Fragment>
      ))}
    </bdi>
  );
}

// The groups come from the panel's «المجموعات» page (src/lib/groups.ts): open ones, and full ones
// with «Doldu» and the way to the waitlist; closed ones are not shown. No capacity or count here.
function Timetable({ s, base }: SectionProps) {
  const { t, edit, groups } = usePage();
  const f = s.fields;
  const P = p(base);
  return (
    <section id={s.id} className="scroll-mt-4 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <div className="reveal max-w-2xl">
          <Eye path={P("eyebrow")} value={f["eyebrow"]} />
          <Txt as="h2" path={P("title")} value={str(f["title"])} className="mt-5 text-4xl font-semibold leading-tight text-primary sm:text-6xl" />
          <Txt as="p" path={P("intro")} value={str(f["intro"])} className="mt-5 text-muted-foreground" multiline />
        </div>
        <div role="table" aria-label={str(f["title"])} className="reveal mt-10 overflow-hidden rounded-3xl bg-card shadow-elegant ring-1 ring-gold/25">
          <div role="row" className="hidden grid-cols-[1.25fr_0.9fr_1fr_1.65fr] gap-4 bg-secondary/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-primary/70 md:grid">
            <span role="columnheader">{t("timetable.plan")}</span>
            <span role="columnheader">{t("timetable.group")}</span>
            <span role="columnheader">{t("timetable.days")}</span>
            <span role="columnheader">{t("timetable.time")}</span>
          </div>
          {groups.map((g) => (
            <div key={g.id} role="row" data-group={g.id} data-status={g.status} className="grid gap-1 border-t border-border px-6 py-4 first:border-t-0 md:grid-cols-[1.25fr_0.9fr_1fr_1.65fr] md:items-center md:gap-4 md:first:border-t">
              <span role="cell" className="flex flex-wrap items-center gap-2 font-semibold text-primary">
                {t(`course.${g.course}`)}
                {g.status === "full" && (
                  <span data-full-badge className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                    {t("group.full")}
                  </span>
                )}
              </span>
              <span role="cell" className="text-sm text-foreground">
                <span className="text-muted-foreground md:hidden">{t("timetable.group")}: </span>
                {t(g.gender === "Kadın" ? "form.gender.female" : "form.gender.male")}
                {g.level && <bdi dir="ltr"> · {g.level}</bdi>}
              </span>
              <span role="cell" className="text-sm text-foreground">
                <span className="text-muted-foreground md:hidden">{t("timetable.days")}: </span>
                {daysText(g.days, t)}
              </span>
              <span role="cell" className="font-serif text-lg font-semibold text-primary">
                <span className="font-sans text-sm font-normal text-muted-foreground md:hidden">{t("timetable.time")}: </span>
                <LessonTimes value={meetingTimes(g.hour)} />
              </span>
              {g.status === "full" && (
                <span role="cell" data-full-note className="mt-2 flex flex-col gap-3 rounded-2xl bg-secondary/70 p-4 text-sm text-primary sm:flex-row sm:items-center sm:justify-between md:col-span-4">
                  <span>{t("group.fullLine")}</span>
                  <button type="button" onClick={() => go("bekleme")} className="shrink-0 rounded-full border border-primary/30 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground">
                    {t("waitlist.title")}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
        {edit && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" dir="rtl" lang="ar">
            المجموعات ومواعيدها وحالتها تُدار من صفحة «المجموعات» في لوحة التحكم.
          </p>
        )}
        <Rich path={P("noteHtml")} html={str(f["noteHtml"])} className="reveal mt-6 rounded-2xl bg-secondary/70 p-5 text-sm leading-relaxed text-primary" />
        <Waitlist />
      </div>
    </section>
  );
}

// ── Instructor ───────────────────────────────────────────────────────────────────────────────
function Instructor({ s, base }: SectionProps) {
  const f = s.fields;
  const P = p(base);
  const creds = arr<{ id: string; text: string }>(f["credentials"]);
  return (
    <section id={s.id} className="relative scroll-mt-4 overflow-hidden bg-navy-deep text-on-navy">
      <div className="relative h-[60vh] min-h-[380px] overflow-hidden sm:h-[80vh]">
        <Img path={P("image")} image={obj<ImageField>(f["image"])} data-speed="0.25" className="absolute inset-0 h-[130%] w-full -translate-y-[10%] object-cover object-[65%_center]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-deep via-navy-deep/30 to-transparent" />
      </div>
      <div className="relative mx-auto -mt-32 max-w-7xl px-4 pb-24 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div className="reveal">
            <Eye light path={P("eyebrow")} value={f["eyebrow"]} />
            <Txt as="h2" path={P("name")} value={str(f["name"])} className="mt-4 text-5xl font-semibold text-gold-shine sm:text-7xl" />
            <Txt as="p" path={P("role")} value={str(f["role"])} className="mt-3 text-lg" />
            <Txt as="p" path={P("title")} value={str(f["title"])} className="font-serif text-xl italic text-gold-soft" />
            <Txt as="p" path={P("areas")} value={str(f["areas"])} className="mt-4 text-xs tracking-wide text-on-navy/60" />
            <Rich path={P("bioHtml")} html={str(f["bioHtml"])} className="bio mt-6 max-w-md leading-relaxed text-on-navy/75" />
          </div>
          <div className="glass-navy reveal rounded-3xl p-6 sm:p-8">
            <Txt as="h3" path={P("credentialsTitle")} value={str(f["credentialsTitle"])} className="text-2xl font-semibold" />
            <ul className="mt-5 space-y-3">
              {creds.map((c, i) => (
                <Item key={c.id} list={P("credentials")} id={c.id} index={i} count={creds.length} as="li" className="flex gap-3 text-sm leading-relaxed text-on-navy/80">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-gold" />
                  <Txt path={P("credentials", at(c.id), "text")} value={c.text} />
                </Item>
              ))}
            </ul>
            {creds.length === 0 && <ListAdd list={P("credentials")} template={{ text: "" }} />}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Price and payment ────────────────────────────────────────────────────────────────────────
/** One Whop plan embedded on the page (a course page made in the panel). */
function PlanCheckout() {
  const { settings, t, meta } = usePage();
  const planId = settings.checkout.planId;
  const [paid, setPaid] = useState(false);
  // Back from Whop's returnUrl after 3-D Secure: the payment is done.
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("status");
    if (status === null && !url.searchParams.has("payment")) return;
    const payment = url.searchParams.get("payment") ?? "";
    url.searchParams.delete("status");
    url.searchParams.delete("payment");
    window.history.replaceState(window.history.state, "", url);
    if (status !== "succeeded") return;
    trackOnce(`payment_complete:${meta.slug}:${payment}`, "payment_complete", { course: meta.slug });
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPaid(true);
  }, [meta.slug]);
  if (!planId) return null;
  return (
    <div className="glass scroll-mt-28 rounded-3xl p-6 sm:p-8">
      {paid ? (
        <p data-paid className="rounded-2xl bg-secondary p-4 text-sm text-primary">
          {t("checkout.paid")}
        </p>
      ) : (
        <div data-checkout-area>
          <WhopCheckout
            key={planId}
            planId={planId}
            onPaid={() => {
              trackOnce(`payment_complete:${meta.slug}:${Date.now()}`, "payment_complete", { course: meta.slug });
              setPaid(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CheckoutNote() {
  const { settings } = usePage();
  const c = settings.checkout;
  const text =
    c.mode === "standard"
      ? "النموذج القياسي: اختيار الدورة (العادية أو المكثّفة) ونوع المجموعة، ثم الدفع عبر Whop ورابط مجموعة واتساب."
      : c.mode === "plan"
        ? `خطة Whop مضمّنة: ${c.planId || "لم تُحدَّد بعد"}`
        : `زر يفتح صفحة الدفع: ${c.url || "لم يُحدَّد الرابط بعد"}`;
  return (
    <div dir="rtl" lang="ar" className="cms-note glass rounded-3xl p-6 sm:p-8">
      <p className="text-lg font-semibold text-primary">نموذج التسجيل والدفع</p>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <p className="mt-2 text-sm text-muted-foreground">تُعدَّل نصوص النموذج من «نصوص أخرى»، ونوع الدفع من «إعدادات الصفحة».</p>
    </div>
  );
}

function Payment({ s, base, preset }: SectionProps) {
  const { settings, edit, t, meta } = usePage();
  const f = s.fields;
  const P = p(base);
  const mode = settings.checkout.mode;
  return (
    <section id={s.id} data-cta-zone className="relative scroll-mt-4 overflow-hidden py-24 sm:py-32">
      <span data-speed="-0.2" aria-hidden="true" className="pointer-events-none absolute -start-24 top-10 h-[34rem] text-primary opacity-[0.04]">
        <Emblem className="h-full w-auto" />
      </span>
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="reveal lg:sticky lg:top-12 lg:self-start">
          <Eye path={P("eyebrow")} value={f["eyebrow"]} />
          <h2 className="mt-5 text-4xl font-semibold leading-tight text-primary sm:text-6xl">
            <Txt path={P("title")} value={str(f["title"])} />
            <Txt path={P("titleAccent")} value={str(f["titleAccent"])} className="block italic text-gold" />
          </h2>
        </div>
        {edit ? (
          <CheckoutNote />
        ) : mode === "standard" ? (
          <RegisterForm preset={preset} />
        ) : mode === "plan" ? (
          <PlanCheckout />
        ) : (
          settings.checkout.url && (
            <div className="glass self-start rounded-3xl p-6 sm:p-8">
              <a
                href={settings.checkout.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("payment_step_open", { course: meta.slug })}
                className="inline-flex rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-accent-foreground shadow-gold transition hover:scale-[1.04]"
              >
                {t("checkout.link")}
              </a>
            </div>
          )
        )}
      </div>
    </section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────────────────────
function Faq({ s, base }: SectionProps) {
  const { edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const items = arr<{ id: string; q: string; aHtml: string }>(f["items"]);
  return (
    <section id={s.id} className="scroll-mt-4 bg-secondary/60 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        <div className="reveal text-center">
          <Eye path={P("eyebrow")} value={f["eyebrow"]} />
          <Txt as="h2" path={P("title")} value={str(f["title"])} className="mt-5 text-4xl font-semibold text-primary sm:text-6xl" />
        </div>
        <div className="mt-12 space-y-3">
          {items.map((it, i) => (
            <Item key={it.id} list={P("items")} id={it.id} index={i} count={items.length} className="reveal">
              <details open={edit ? true : undefined} className="group rounded-2xl bg-card p-5 shadow-elegant ring-1 ring-gold/20 open:ring-gold">
                <summary onClick={edit ? (e) => e.preventDefault() : undefined} className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-xl font-semibold text-primary">
                  <Txt path={P("items", at(it.id), "q")} value={it.q} />
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/50 text-gold transition group-open:rotate-45">+</span>
                </summary>
                <Rich path={P("items", at(it.id), "aHtml")} html={it.aHtml} className="mt-4 text-sm leading-relaxed text-muted-foreground" />
              </details>
            </Item>
          ))}
          {items.length === 0 && <ListAdd list={P("items")} template={{ q: "", aHtml: "" }} />}
        </div>
      </div>
    </section>
  );
}

// ── Closing call to action ───────────────────────────────────────────────────────────────────
function Cta({ s, base }: SectionProps) {
  const f = s.fields;
  const P = p(base);
  return (
    <section id={s.id} data-cta-zone className="relative isolate overflow-hidden gradient-navy py-24 text-center text-on-navy sm:py-32">
      <div data-speed="0.2" className="absolute inset-[-20%] -z-10 geo-pattern opacity-25" />
      <div className="reveal mx-auto max-w-4xl px-4 sm:px-8">
        <h2 className="text-5xl font-semibold leading-tight sm:text-7xl">
          <Txt path={P("title")} value={str(f["title"])} /> <Txt path={P("titleAccent")} value={str(f["titleAccent"])} className="italic text-gold" />
        </h2>
        <Txt as="p" path={P("text")} value={str(f["text"])} className="mt-6 text-lg italic text-on-navy/80" multiline />
        <Btn path={P("button")} value={obj<ButtonField>(f["button"])} className="mt-10 inline-block rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-accent-foreground shadow-gold transition hover:scale-[1.04]" />
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────────────────────
function Features({ s, base }: SectionProps) {
  const f = s.fields;
  const P = p(base);
  const items = arr<{ id: string; title: string; body: string }>(f["items"]);
  return (
    <section id={s.id} className="scroll-mt-4 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="reveal max-w-2xl">
          <Eye path={P("eyebrow")} value={f["eyebrow"]} />
          <Txt as="h2" path={P("title")} value={str(f["title"])} className="mt-5 text-4xl font-semibold leading-tight text-primary sm:text-6xl" />
          <Txt as="p" path={P("intro")} value={str(f["intro"])} className="mt-5 text-muted-foreground" multiline />
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Item key={it.id} list={P("items")} id={it.id} index={i} count={items.length} className="reveal rounded-3xl bg-card p-7 shadow-elegant ring-1 ring-gold/20">
              <Txt as="h3" path={P("items", at(it.id), "title")} value={it.title} className="text-2xl font-semibold text-primary" />
              <Txt as="p" path={P("items", at(it.id), "body")} value={it.body} className="mt-3 leading-relaxed text-muted-foreground" multiline />
            </Item>
          ))}
        </div>
        {items.length === 0 && <ListAdd list={P("items")} template={{ title: "", body: "" }} />}
      </div>
    </section>
  );
}

// ── Testimonials (shown only with the learner's consent) ─────────────────────────────────────
function Testimonials({ s, base }: SectionProps) {
  const { edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const items = arr<{ id: string; name: string; text: string; consent?: boolean }>(f["items"]);
  const shown = items.map((it, i) => ({ it, i })).filter(({ it }) => edit || it.consent === true);
  if (!edit && shown.length === 0) return null;
  return (
    <section id={s.id} className="scroll-mt-4 bg-secondary/60 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="reveal max-w-2xl">
          <Eye path={P("eyebrow")} value={f["eyebrow"]} />
          <Txt as="h2" path={P("title")} value={str(f["title"])} className="mt-5 text-4xl font-semibold leading-tight text-primary sm:text-6xl" />
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ it, i }) => (
            <Item key={it.id} list={P("items")} id={it.id} index={i} count={items.length} as="figure" className="reveal rounded-3xl bg-card p-7 shadow-elegant ring-1 ring-gold/20">
              <Txt as="blockquote" path={P("items", at(it.id), "text")} value={it.text} className="block font-serif text-xl leading-relaxed text-primary" multiline />
              <figcaption className="mt-4 text-sm font-semibold text-muted-foreground">
                — <Txt path={P("items", at(it.id), "name")} value={it.name} />
              </figcaption>
              {edit && (
                <label dir="rtl" lang="ar" className="cms-consent">
                  <input type="checkbox" checked={it.consent === true} onChange={(e) => edit.apply([{ op: "setValue", path: P("items", at(it.id), "consent"), value: e.target.checked }])} />
                  وافق المتعلّم على نشر رأيه{it.consent === true ? "" : " — لن يظهر للزوار"}
                </label>
              )}
            </Item>
          ))}
        </div>
        {items.length === 0 && <ListAdd list={P("items")} template={{ name: "", text: "", consent: false }} />}
      </div>
    </section>
  );
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────────────────────
function WhatsApp({ s, base }: SectionProps) {
  const { settings, lang, t, edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const number = settings.whatsapp.number;
  const href = whatsappHref(number, settings.whatsapp.message[lang] ?? "");
  const cls = "inline-flex rounded-full bg-[#25d366] px-7 py-3.5 text-sm font-semibold text-[#071027] transition hover:scale-[1.04]";
  return (
    <section id={s.id} className="scroll-mt-4 py-20 sm:py-24">
      <div className="reveal mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-[2rem] bg-card px-6 py-12 text-center shadow-elegant ring-1 ring-gold/25 sm:px-12">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#25d366] text-white">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-7 w-7 fill-current">
            <path d={SOCIAL_GLYPHS.whatsapp} />
          </svg>
        </span>
        <Txt as="h2" path={P("title")} value={str(f["title"])} className="text-3xl font-semibold text-primary sm:text-5xl" />
        <Txt as="p" path={P("text")} value={str(f["text"])} className="max-w-xl text-muted-foreground" multiline />
        {edit ? (
          <span className={cls}>{t("whatsapp.button")}</span>
        ) : (
          number && (
            <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
              {t("whatsapp.button")}
            </a>
          )
        )}
      </div>
    </section>
  );
}

// ── Free text with an image ──────────────────────────────────────────────────────────────────
function RichText({ s, base }: SectionProps) {
  const { edit } = usePage();
  const f = s.fields;
  const P = p(base);
  const img = obj<ImageField>(f["image"]);
  const hasImg = !!img?.src || !!edit;
  const start = f["imageSide"] === "start";
  return (
    <section id={s.id} className="scroll-mt-4 py-20 sm:py-28">
      <div className={cn("mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-8", hasImg && "lg:grid-cols-2")}>
        <div className={cn("reveal", start && hasImg && "lg:order-2")}>
          <Txt as="h2" path={P("title")} value={str(f["title"])} className="text-4xl font-semibold leading-tight text-primary sm:text-5xl" />
          <Rich path={P("bodyHtml")} html={str(f["bodyHtml"])} className="mt-5 leading-relaxed text-muted-foreground" />
        </div>
        {hasImg && <Img path={P("image")} image={img} className="aspect-[4/3] w-full rounded-[1.75rem] object-cover shadow-elegant" />}
      </div>
    </section>
  );
}

const VIEWS: Record<SectionType, (props: SectionProps) => ReactNode> = {
  hero: Hero,
  features: Features,
  timetable: Timetable,
  pricing: Pricing,
  payment: Payment,
  faq: Faq,
  testimonials: Testimonials,
  cta: Cta,
  whatsapp: WhatsApp,
  richtext: RichText,
  phrases: Phrases,
  program: Program,
  steps: Steps,
  instructor: Instructor,
};

// ── Edit mode: a section's toolbar and the "add a section" control ───────────────────────────
/** Section types offered first when adding (the list in the brief), then the template's own. */
const ADD_ORDER: SectionType[] = ["hero", "features", "timetable", "payment", "faq", "testimonials", "cta", "whatsapp", "richtext", ...SECTION_TYPES.filter((x) => !["hero", "features", "timetable", "payment", "faq", "testimonials", "cta", "whatsapp", "richtext"].includes(x))];

export function AddSection({ after }: { after: string }) {
  const { edit } = usePage();
  const [open, setOpen] = useState(false);
  if (!edit) return null;
  return (
    <div dir="rtl" lang="ar" className="cms-add-section">
      {open ? (
        <div className="cms-add-menu" role="menu">
          {ADD_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                edit.apply([{ op: "addSection", type, after }]);
              }}
            >
              {SECTION_LABELS[type]}
            </button>
          ))}
          <button type="button" className="cms-add-cancel" onClick={() => setOpen(false)}>
            إلغاء
          </button>
        </div>
      ) : (
        <button type="button" className="cms-add" onClick={() => setOpen(true)}>
          + إضافة قسم هنا
        </button>
      )}
    </div>
  );
}

function SectionFrame({ s, index, count, children }: { s: Section; index: number; count: number; children: ReactNode }) {
  const { edit } = usePage();
  if (!edit) return <>{children}</>;
  return (
    <div className="cms-section" data-cms-section={s.id} data-hidden={s.hidden ? "true" : undefined}>
      <div className="cms-section-bar" dir="rtl" lang="ar">
        <strong>{SECTION_LABELS[s.type]}</strong>
        <code dir="ltr">#{s.id}</code>
        {s.hidden && <span className="cms-badge">مخفي</span>}
        <button type="button" title="تحريك للأعلى" disabled={index === 0} onClick={() => edit.apply([{ op: "moveSection", id: s.id, to: index - 1 }])}>
          ↑
        </button>
        <button type="button" title="تحريك للأسفل" disabled={index === count - 1} onClick={() => edit.apply([{ op: "moveSection", id: s.id, to: index + 1 }])}>
          ↓
        </button>
        <button type="button" onClick={() => edit.apply([{ op: "duplicateSection", id: s.id }])}>
          تكرار
        </button>
        <button type="button" onClick={() => edit.apply([{ op: "setHidden", id: s.id, hidden: !s.hidden }])}>
          {s.hidden ? "إظهار" : "إخفاء"}
        </button>
        <button type="button" onClick={() => edit.openFields(s.id)}>
          الحقول
        </button>
        <button type="button" onClick={() => edit.shareSection(s.id)} data-share-section={s.id}>
          مشاركة
        </button>
        <button
          type="button"
          className="cms-danger"
          onClick={() => {
            if (window.confirm("حذف هذا القسم من كل اللغات؟ يبقى في سلة المحذوفات 30 يومًا ويمكن استعادته.")) edit.apply([{ op: "deleteSection", id: s.id }]);
          }}
        >
          حذف
        </button>
      </div>
      {children}
      <AddSection after={s.id} />
    </div>
  );
}

/** All sections of the page, in order (hidden ones only in edit mode). */
export function Sections({ onChooseCourse, preset }: { onChooseCourse: (course: CourseType) => void; preset: Preset }) {
  const { content, edit } = usePage();
  const list = content.sections;
  return (
    <>
      {edit && <AddSection after="" />}
      {list.map((s, i) => {
        if (s.hidden && !edit) return null;
        const View = VIEWS[s.type];
        if (!View) return null;
        return (
          <SectionFrame key={s.id} s={s} index={i} count={list.length}>
            <View s={s} base={["sections", at(s.id), "fields"]} onChooseCourse={onChooseCourse} preset={preset} />
          </SectionFrame>
        );
      })}
    </>
  );
}
