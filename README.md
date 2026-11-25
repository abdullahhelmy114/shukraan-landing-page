# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js 20.9+ and Bun — [install Bun](https://bun.sh/docs/installation).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev      # http://localhost:3000
bun run build    # production build (type-checks)
bun run lint
```

The site is a Next.js App Router app: pages and API routes live in `src/app`, and the
Whop plan IDs for the two courses live in `src/lib/whop-plans.ts` (regular prices; the prices
themselves are in `src/components/shukraan/data.ts`). Discount
codes and the discounted plans they open live only on the server, in
`src/lib/discount-codes.server.ts`; `/api/public/discount` checks a code. Each group's
WhatsApp link and QR code are files in `whatsapp-gruplari/` (see its README.txt). The build
(`bun run build`, `bun run cf:build`, the Dockerfile) bundles them into the git-ignored
`src/lib/generated/whatsapp-bundle.json`, with each QR code drawn and read back by two decoders;
the server returns them with the saved registration, so they never have a URL.

## Content, languages and the control panel

The landing page's texts are not in the code. The standard page lives in `content/` as JSON, one
file per language (`content/pages/standart/tr.json`, `en.json`, `ar.json`), with the brand name,
the tagline per language and the language list in `content/site.json`. These files are the seed;
everything edited in the control panel (drafts, published pages, the last 30 published versions,
deleted sections kept 30 days, preview links, and uploaded images converted to WebP with metadata
removed, 10 MB at most) is stored behind one storage interface (`src/lib/cms/repo/`):

- Docker / Coolify: files in `DATA_DIR` (a persistent volume, `/app/data`);
- Cloudflare Workers (`STORAGE=cloudflare`): D1 for the data and R2 for the images (see below).

| Path | Shows |
| --- | --- |
| `/`, `/en`, `/ar` | The standard page in Turkish, English, Arabic (`/tr` redirects to `/`) |
| `/dad40`, `/en/dad40` … | A referral link: the standard page with that link's discount code |
| `/<slug>`, `/en/<slug>` … | A course page made in the panel with «Duplicate page» |
| `/admin` | The control panel (Arabic): log in with `ADMIN_PASSWORD` |
| `/admin/groups`, `/admin/waitlist` | The groups and the waitlist (panel only) |

In the panel, edit mode is the page itself: click any text or image to change it (per language:
العربية · English · Türkçe), add, duplicate, hide, reorder (drag in «الأقسام») or delete
sections, change page settings (course name and slug, Whop plan or checkout link, WhatsApp number
and message, lockup colours, SEO and share image per language, and the offer code applied when the
page opens, so prices show the old price struck through), copy a preview link, and press «نشر» to
publish. Every section has «مشاركة» in the panel (never on the public page): its public link in that
language, share buttons, and a PNG of the section for Instagram and stories. Each publish keeps a version that can be restored. A language added in «الإعدادات
العامة» needs no code change: its pages start from the English text and its tagline falls back to
English until it has its own.

### Groups and the waitlist

Groups open one at a time. The panel's **المجموعات** page (`/admin/groups`) lists every group
with its status (open, full or closed), its capacity (5 by default), its paid registrations and
the places left; there it can open, close or add a group and change its days, hour and level.
The page shows open and full groups only, never a number: a group whose paid registrations reach
its capacity shows «Doldu» and the way to the waitlist, and cannot be chosen in the form. The save
after payment takes the place atomically, so two payments cannot both take the last one; a payment
that reaches a full group gets no WhatsApp link, and the panel lists it for the team. A group uses
its own WhatsApp files (`whatsapp-gruplari/<group id>.txt` and `logolar/<group id>.png`, bundled at
build time) once it has them, otherwise its course and group type's community link.

**قائمة الانتظار** (`/admin/waitlist`) shows the waitlist entries (filters, CSV, deleting one entry
or every entry older than X days) and the demand per course × group type × level × time, with
«Yeni grup açılabilir» on each line that reaches the open-threshold (4 by default). Opening a group
lists the waitlist entries it suits, with their WhatsApp numbers; nothing is sent automatically.
The consent box can link to a privacy text: set its address in the panel's interface strings
(`waitlist.privacyUrl`; empty shows no link).

Everything the page writes lives under `DATA_DIR` (Coolify: `/app/data`, which must be a
persistent volume). At start-up the server logs one clear error if the folder is missing or
read-only, and registrations and the waitlist then answer with an error instead of losing data.
Each file is written to `<name>.<random>.tmp` beside it and then renamed:

| File | What it holds |
| --- | --- |
| `groups.json` | The groups (status, capacity, days, hour, level) and the open-threshold |
| `registrations.json` | Paid places per group, and payments that came after a group filled (with contact details) |
| `waitlist.json` | The waitlist's entries |
| `site.json` | Languages, brand and taglines (once edited in the panel) |
| `pages/<slug>/meta.json`, `draft/`, `published/`, `versions/`, `trash.json` | The pages as edited and published |
| `preview-links.json` | Preview links handed out |
| `media/<id>.webp`, `share/<file>.png` | Uploaded images and share images |

### Emblem, fonts and share images

The emblem is `public/images/shukraan-emblem.svg` (one path in `currentColor`, drawn inline by
`src/components/shukraan/Emblem.tsx` so each lockup scheme tints it); the favicon and app icons are
in `public/favicon.ico` and `public/icons/`. Fonts are self-hosted in `public/fonts` under the SIL
Open Font License (licences beside the files): Amiri for Arabic, Carlito for Latin text, which asks
for Calibri first where it is installed (Calibri itself is never embedded). The share images in
`public/images/og/` are drawn with Amiri and Carlito by `scripts/share-images.cjs` (see its header
for how to run it); it fails if any other font is used.

## Cloudflare Workers

The same app runs as a Cloudflare Worker through [OpenNext](https://opennext.js.org/cloudflare)
(`@opennextjs/cloudflare`). `wrangler.jsonc` holds the configuration; `worker.ts` answers
scanners' probes (`/.env`, `/.git/…`, `/backup.sql`, `/wp-admin` …) with a 404 before Next.js
runs, then hands every other request to the OpenNext Worker. `patches/` fixes one OpenNext bug
(it parsed the Cookie header through an import that is undefined on Workers) and is applied by
`bun install`; `bun run cf:build` stops if it was not.

| Name | Kind | What it is |
| --- | --- | --- |
| `DB` | D1 binding, database `landing-page` | Pages, drafts, published versions, trash, preview links, site settings, login rate limit (`migrations/`) |
| `MEDIA` | R2 binding, bucket `landing-page-media` | Uploaded images (`media/…`) and share images (`share/og-<lang>.png`) |
| `IMAGES` | Images binding | Converts uploads to WebP; without it (or if it fails) the Worker's WebAssembly encoder does |
| `ASSETS` | Static assets | `.open-next/assets` (built) |
| `STORAGE` | Variable (`wrangler.jsonc`) | `cloudflare`: use D1 and R2 instead of files |
| `ADMIN_PASSWORD` | Secret | The control panel's password; empty turns `/admin` off |
| `DATABASE_URL` | Secret | The Neon connection string for the registration routes |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `NEXT_PUBLIC_UMAMI_SRC` | Build variables | Umami (see below); read by `next build`, so set them where the build runs |

### One-time setup and deploy

Run these from the repository, with Bun installed. `wrangler` asks you to log in the first time
(`bunx wrangler login`). Secrets are typed at a prompt, never on the command line.

1. `bun install`
2. `bunx wrangler d1 create landing-page`, then copy the `database_id` it prints into
   `wrangler.jsonc` (`d1_databases` → `database_id`, replacing the zeros) and commit it.
3. `bunx wrangler r2 bucket create landing-page-media`
4. `bun run cf:migrate` (`wrangler d1 migrations apply landing-page --remote`): creates the tables.
5. `bun run cf:seed` (`node scripts/import-seed.mjs --remote`): loads `content/*.json` into D1 and
   uploads the share images to R2. It leaves pages already edited in the panel alone;
   `node scripts/import-seed.mjs --remote --force` overwrites them.
6. `bunx wrangler secret put ADMIN_PASSWORD` and `bunx wrangler secret put DATABASE_URL` (if the
   Worker does not exist yet, wrangler offers to create it: answer yes).
7. Set the build variables in the shell (or leave them unset for no analytics), then build:
   `NEXT_PUBLIC_UMAMI_WEBSITE_ID=<id> NEXT_PUBLIC_UMAMI_SRC=<script url> bun run cf:build`
8. `bun run cf:deploy` (`wrangler deploy`)

To try it locally first: put `ADMIN_PASSWORD=<a test password>` in `.dev.vars` (git-ignored), run
`bunx wrangler d1 migrations apply landing-page --local`, `node scripts/import-seed.mjs --local`,
`bun run cf:build` and `bun run cf:dev` (http://localhost:8787, with local D1, R2 and Images).

### In the Cloudflare dashboard

- **Workers & Pages → landing-page → Settings → Domains & Routes**: a deploy first serves the
  Worker on its `workers.dev` address only (`wrangler.jsonc` names no domain, so no deploy takes
  the live site by itself). When you switch from Coolify, choose **Add → Custom domain** and enter
  `muhadese.shukraanedu.com` (its zone must be on this Cloudflare account; remove the old DNS
  record pointing at Coolify first, or Cloudflare refuses the domain).
- **Settings → Variables and Secrets**: `ADMIN_PASSWORD` and `DATABASE_URL` are listed as secrets
  (values hidden) and `STORAGE` as plain text. Changing `ADMIN_PASSWORD` signs every session out.
- **Settings → Bindings**: `DB`, `MEDIA`, `IMAGES` and `ASSETS` should be listed.
- **Images**: the `IMAGES` binding uses Cloudflare Images transformations (the Free plan includes
  a monthly allowance). If your plan has none, remove the `images` line from `wrangler.jsonc`;
  uploads then use the WebAssembly encoder.
- **Settings → Build** (only if you connect the Git repository to Workers Builds instead of
  deploying from your machine): build command `bun run cf:build`, deploy command
  `bunx wrangler deploy`, and add `NEXT_PUBLIC_UMAMI_WEBSITE_ID` and `NEXT_PUBLIC_UMAMI_SRC` under
  **Build variables and secrets** (build variables are separate from the Worker's runtime ones).
  Every push to the production branch then builds and deploys, so do steps 2–6 first. The build
  reads `whatsapp-gruplari/` from the repository, which holds the private group links: keep the
  repository private.
- **Observability**: Workers Logs are on (`observability` in `wrangler.jsonc`).

### Firewall rules (Security → WAF)

The Worker already answers probes with a 404 in a few milliseconds without running the page;
these rules stop them at Cloudflare's edge so they never reach the Worker.

1. **Custom rule "Block probes"**, action *Block*, expression:

   ```
   (http.request.uri.path contains "/." and not starts_with(http.request.uri.path, "/.well-known/"))
   or http.request.uri.path.extension in {"env" "git" "sql" "bak" "old" "orig" "swp" "zip" "tar" "gz" "tgz" "7z" "rar" "php" "asp" "aspx" "jsp" "cgi" "ini" "log" "sqlite" "db" "pem" "key"}
   or starts_with(lower(http.request.uri.path), "/wp-")
   or starts_with(lower(http.request.uri.path), "/phpmyadmin")
   or starts_with(lower(http.request.uri.path), "/cgi-bin")
   or starts_with(lower(http.request.uri.path), "/vendor/")
   or starts_with(lower(http.request.uri.path), "/node_modules/")
   or lower(http.request.uri.path) in {"/xmlrpc.php" "/server-status" "/config.json"}
   ```

2. **Managed rules**: keep the *Cloudflare Free Managed Ruleset* on; on Pro or higher also turn on
   the *Cloudflare Managed Ruleset* and the *OWASP Core Ruleset*.
3. **Rate limiting rule "Panel login"**: when `http.request.uri.path eq "/api/admin/login" and
   http.request.method eq "POST"`, counted per IP, 5 requests per 10 seconds (the Free plan's
   period), action *Block* for 10 seconds; on Pro or higher, for example 10 per minute, blocked for
   an hour. The
   panel keeps its own limit as well (5 failed logins per 15 minutes per IP).
4. **Security → Bots → Bot Fight Mode**: on.

The panel's login limit keys on `CF-Connecting-IP` on Workers (the visitor's address as Cloudflare
sees it) and on the last `X-Forwarded-For` entry elsewhere.

## Self-hosting with Coolify

This project includes a `Dockerfile` and `docker-compose.yml` for self-hosting on [Coolify](https://coolify.io) or any Docker-based platform.

### Quick start with Docker

The `Dockerfile` installs with Bun, builds Next.js in `standalone` mode and runs the result with Node.js.

```sh
# Build the image
docker build -t ruhulqudus-app .

# Run locally
docker run -p 3000:3000 ruhulqudus-app
```

Then open `http://localhost:3000`.

### Deploy on Coolify

1. Push the repository to GitHub/GitLab.
2. In Coolify, create a new **Resource** → **Application** → choose your repository.
3. Set the **Build Pack** to `Dockerfile`.
4. Make sure Coolify exposes port `3000`.
5. Add your domain (e.g. `ruhulqudus.com`) in Coolify → Domains.
6. In **Environment Variables**, add `ADMIN_PASSWORD` (a long random password; it turns on
   `/admin`).
7. In **Persistent Storage**, add a volume mounted at `/app/data` (the panel's pages, versions,
   trash and uploads; without it every edit is lost on redeploy).
8. Deploy, then open `https://<your domain>/admin` and log in.

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | — | Neon/Postgres connection string used by the `/api/public/*` registration routes |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | — | Umami website id. Set it to turn on visitor analytics; empty loads no script |
| `NEXT_PUBLIC_UMAMI_SRC` | `https://cloud.umami.is/script.js` | Umami script URL (change it for a self-hosted Umami) |
| `ADMIN_PASSWORD` | — | The control panel's password. Empty turns `/admin` off. Changing it signs every session out |
| `DATA_DIR` | `/app/data` in Docker (`./data` locally) | Where the panel stores pages, versions, trash and uploads; mount a persistent volume here |
| `STORAGE` | — | Leave unset on Docker (files in `DATA_DIR`); `cloudflare` on Workers (D1 and R2) |

#### Control panel security

One password, checked in constant time; a signed session cookie (httpOnly, Secure,
SameSite=Strict) for 12 hours, with logout; at most 5 failed logins per 15 minutes per IP (the
last `X-Forwarded-For` entry, set by Coolify's proxy); every change must come from the site itself
(Origin check). `/admin`, `/preview/…` and `/api/admin/…` are `noindex`, `no-store` and cannot be
framed. Rich text keeps only bold, italic, links and lists (sanitised on the server); links and
image sources are checked; uploads are re-encoded as WebP.

#### Visitor analytics (Umami)

Umami is cookieless, so the site shows no cookie banner. The script loads only in a production
build with `NEXT_PUBLIC_UMAMI_WEBSITE_ID` set (see `.env.example`); both variables are inlined at
build time, so on Coolify mark them as build variables. Query strings are not sent. Besides
pageviews, the site sends only these events, none with personal data, a discount code or a payment
id: `whatsapp_float_click`, `whatsapp_footer_click`, `price_card_click` (`course`), `group_select`
(`course`, `type`), `payment_step_open` (`course`), `discount_code_result` (`valid`),
`payment_complete` (`course`, once per payment) and `whatsapp_group_join_click`. On a course page
made in the panel, or in a language other than Turkish, every event also carries `page` (the
slug) and `lang`, so new pages are tracked without any change. The panel and preview links are
never tracked.

### Docker Compose

```sh
docker compose up -d --build
```

## Built with

- Next.js (App Router)
- TypeScript
- React
- Tailwind CSS
- Whop Elements (embedded checkout)
- sanitize-html and sharp (control panel)
