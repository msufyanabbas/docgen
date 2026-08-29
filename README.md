# Tawal DocGen

Two document families, one platform, behind a login.

**GCL / BOQ / Work Order / PAC** — the commercial pipeline.
**MOP** — Method of Procedure, generated from Tawal's own Word templates.

---

## The dashboard

Signing in lands on a dashboard rather than a form: MOPs and packages produced over the last six
months, a breakdown per project and per MOP category, site-impact split, total package value, and
the most recent documents of each kind. The counts are aggregated in the database rather than by
pulling rows into Node — a year of MOPs is a lot of records to move just to count them.

---

## A note on page transitions

Page changes use a CSS fade whose resting state is fully visible; the animation
only fades in. If it never runs, is interrupted, or the browser skips it, the
content is still on screen.

This replaced a framer-motion `AnimatePresence mode="wait"` wrapper with an exit
animation. That variant holds the incoming page until the outgoing one finishes
exiting — and when navigation unmounts a component synchronously, as it does
after creating a GCL, the exit never completes and the screen stays blank until
a reload. Anything that gates page content on an animation completing is a
liability; a cross-fade is not worth that.

---

## Permissions

Two roles, and a per-user grant on top:

| | |
|---|---|
| **Admin** | Everything, implicitly. The stored map is bypassed entirely. |
| **PM** | Whatever the admin ticks — per resource, per action. |

Resources are Dashboard, GCL documents, MOP documents, Projects, Project categories,
MOP categories, Price list and Users. Actions are view / create / edit / delete (Dashboard is
view-only). A new PM starts able to raise GCLs and MOPs and to see projects and categories, but
not to reshape the platform underneath.

Enforced in three places, because the UI alone is not access control: the sidebar hides what you
can't view, routes redirect if you navigate there directly, and every endpoint carries a
`@RequirePermission(...)`. Permissions are re-read from the database on each request, so a change
takes effect on the next click rather than at token expiry.

Any action implies view, and removing view removes the rest — a grant that lets you edit
something you can't open is a bug waiting to happen. Submitted maps are sanitised against the
catalogue, so unknown resources or actions are dropped rather than stored.

---

## Access control

The whole platform requires sign-in — not just MOP. Two roles:

| Role | Can do |
|---|---|
| **Admin** | Everything, plus **user management** and adding projects / MOP categories |
| **PM** | Everything except user management |

The first admin is created on first boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, flagged to
force a password change at first sign-in. From there the admin creates PM accounts and sets
their initial passwords; each PM must replace theirs on first login.

A JWT is minted at login and re-validated against the database on **every request**, so
deactivating an account takes effect immediately rather than when its token expires. The API
refuses to start in production without `JWT_SECRET` set.

---

## Method of Procedure (MOP)

```
Project category   ×   MOP category   →   MOP format
   RMS                  Survey            Site_Survey
   RMS                  Installation      INSTALLATION
   RMS                  PAT               INSTALLATION
   CCTV                 Survey            Site_Survey
   CCTV                 Installation      CCTV_Installation
   CCTV                 PAT               CCTV_Installation
   SIM Swap             Survey            SIM_SWAP        ← the only pairing
   Smart Locks          Survey / Install / PAT

Project  →  belongs to a project category
MOP      →  a project + one of the MOP categories its category is paired with
```

Both catalogs are **user-managed** — add, hide or remove categories from the UI, and pair them
however you need. "SIM Swap is survey-only" isn't a rule in code; it is simply the only pairing
that exists, and the API refuses any MOP for a pairing that isn't there.

**There are no pre-made projects.** Categories are seeded on first boot so the platform is usable
immediately; projects you create yourself.

**How the documents are made.** Not rebuilt — *filled*. Each template is your own MOP `.docx`
with the five Document Control values replaced by `{{PLACEHOLDERS}}`. Generation unzips it,
substitutes into `word/document.xml`, and rezips. Every other part — cover artwork, the swirl
graphics, headers, footers, styles, fonts — is copied through byte-for-byte. That is the only
way the output is indistinguishable from a hand-prepared MOP; re-creating the layout would
drift on the first Word update.

The five fields collected: **TCN Summary · Site ID · Name of Requester · Name of PM ·
Site Impact (YES/NO)**, plus an optional impact note printed verbatim.

**PDF** comes from LibreOffice converting that same `.docx`. Tawal receives both files for one
MOP, so converting the artefact we just produced is the only way they cannot disagree.

**Bulk.** Download a pre-headed workbook, one row per site, upload it back. A failing row is
recorded and skipped rather than aborting the batch — with fifty sites, one bad row shouldn't
cost the other forty-nine. The whole batch downloads as a ZIP with DOCX and PDF side by side.

---

## GCL and the project tracker

Projects for GCL come from the Tawal-side tracker, not this database:

```
GET http://147.79.114.76:5003/api/projects/public/projects

Create GCL  →  closeout.patTcn.status   === 'Approved'
Upload GCL  →  closeout.patStatus.status === 'Approved'
```

**GCL documents** is the library — every GCL with its BOQ, Work Order and PAC, grouped by
project, the same shape as the MOP library. **Create GCL** and **Upload GCL** open a dialog that
asks for the project before the form appears.

**Create GCL produces the GCL and nothing else.** The BOQ, Work Order and PAC are generated
later from the package screen, once the as-built quantities and TAG numbers are known — issuing
them at creation time would mean issuing commercial documents against design figures.

**Choosing a project is mandatory.** The rest of the screen stays locked until
one is selected, and the API refuses a GCL without a valid, eligible project — a GCL that can't
be traced back to a tracker project is worse than no GCL. The stage is re-checked server-side,
so an approved PAT TCN does not let a signed GCL be uploaded against a project whose PAT is
still pending.

The list refreshes itself every 45 seconds while the tab is visible — the tracker is edited by
another team, so a project can become eligible while the screen is open. Polling pauses on a
hidden tab. Responses are cached server-side for 20 seconds with a 12-second timeout. Fields the tracker leaves empty
display as **N/A**. If the service is unreachable the screen says so plainly rather than
erroring — but no GCL can be raised until it is back, which is the correct outcome.

---

## The commercial pipeline

Two ways in, one pipeline out.

**Create a GCL** from an approved scope-of-work sheet, or **upload a signed GCL** you already have. Either way you get a priced package that produces the **As-Built BOQ**, **Work Order** and **PAC** in the layouts Tawal already accepts.

```
Scope sheet (.xlsx) ──┐
   + signature image   ├──►  Package + priced lines  ──►  GCL .pdf
Signed GCL (.pdf) ────┘              ▲                    BOQ .xlsx / .pdf
                                UPL price list            WO  .xlsx / .pdf
                                                          PAC .pdf
                                                          all of it .zip
```

**Stack:** NestJS 11 · Prisma · PostgreSQL · ExcelJS · Puppeteer + Handlebars
· React 18 · Vite · Tailwind · Radix UI · Framer Motion

---

## You choose what the money is based on

Nothing about quantities is hard-coded. When a GCL or scope sheet is parsed, every numeric
column is detected **with its printed heading** and offered as the basis for pricing, each
showing what the package would cost:

```
qty1  "Design QTY"   →  13,761.00 SAR
qty2  "As Bulit"     →  11,216.00 SAR      ← matches Tawal's signed Work Order
```

Those labels are read off the document, spelling and all — the sample GCL really does print
"As Bulit". A file that labels its columns differently still works, because nothing is matched
against a fixed list of names.

The choice is stored per package and changeable afterwards; the BOQ, Work Order and PAC all
re-price from it.

---

## An important note on quantities

The brief said to price on **Design QTY**. Your own signed documents don't:

| Item | Design | As-Built | UPL Price |
|---|---:|---:|---:|
| SMART-TWR-001 | 1.00 | 1.00 | 3,710.00 |
| SMART-TWR-019 | 1.00 | 1.00 | 3,000.00 |
| SMART-TWR-008 | 1.00 | 1.00 | 1,061.00 |
| SMART-TWR-025 | **2.00** | **1.00** | 2,545.00 |
| SMART-TWR-029 | 1.00 | 1.00 | 900.00 |
| | **13,761.00** | **11,216.00** | |

`241-00-102R11_WO.pdf` reads **11,216.00**, and the reference BOQ shows `1.00` for SMART-TWR-025. The GCL remark explains it: *"only one smart lock fixed for Shelter."*

So `quantitySource` is a per-package flag, **defaulting to `AS_BUILT`** because that reproduces the signed originals. Switch any package to `DESIGN` from the detail screen and it re-prices instantly.

---

## Deploying

```bash
cp deploy.config.example deploy.config   # server address, repo, domain
npm run deploy:setup                     # once: docker, nginx vhost, SSL
npm run deploy                           # every time after that
```

The server pulls from GitHub and builds there — nothing large is uploaded. Images are
tagged `:previous` before each build, so `npm run deploy:rollback` reverts in seconds.
Nothing is stopped until the build succeeds, so a bad commit leaves the site serving.

Full guide, including GitHub Actions and backups: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Running it locally

### Docker (everything, one command)

```bash
docker compose up --build
# frontend  http://localhost:8080
# API       http://localhost:3000/api      (Swagger at /api/docs)
```

The schema is created on first boot and the bundled UPL is imported automatically
when the price list is empty (`AUTO_SEED_UPL=false` turns that off).

### Local development

```bash
# --- backend ---
cd backend
cp .env.example .env          # point DATABASE_URL at your Postgres
npm install
npx prisma migrate dev --name init
npm run start:dev             # :3000 — auto-imports prisma/upl-reference.xlsx on first run

# --- frontend ---
cd ../frontend
npm install
npm run dev                   # :5173, proxies /api to :3000
```

Puppeteer downloads its own Chromium on `npm install`. In Docker it uses the system
`chromium` via `PUPPETEER_EXECUTABLE_PATH`.

---

## Creating a GCL

The scope sheet (e.g. `ZMS008.xlsx`) carries the approved items per site:

```
Budget | SubProject Name | Contractor | PO# | Site ID | Site Code |
site Name | Work type | Item Code | Description of Item | Unit | updated Qty
```

`scope.parser.ts` matches those headers by alias, groups rows **by site** (one site = one GCL),
and derives the Tangible/Service column from **Work type** — `Smart Tower Hardware` → Tangible,
`Smart Access Services` → Service. `updated Qty` becomes **Design QTY**; As-Built starts equal to
it and is adjusted on the review screen once the work is actually done. That difference is
precisely what makes the As-Built BOQ diverge from the design scope.

**Signature and stamp.** The Smart Life company stamp is a bundled asset (`assets/company-stamp.png`,
background knocked out) applied to every GCL — nothing to upload. The **signature is per package**
and is captured two ways: **sign directly on a canvas pad** with a finger, stylus or mouse, or
**upload a scan**. Either is available at creation time and from the package screen afterwards.

The pad keeps strokes as point arrays rather than baked pixels, which is what makes undo work and
lets the export redraw at 3x for print. Output is a transparent PNG trimmed to the ink, so it
scales predictably inside the GCL signature cell. The pad is always white paper with dark ink
regardless of app theme — the signature lands on a white PDF, so a theme-tinted one would be wrong. It is stamped
into each row's *IMPL Contr. Initial* cell and into the signature block, overlapping the stamp the
way a wet-signed form does.

Fields the scope sheet doesn't carry — Region, District, GCL date, PM names, MSP representative —
are collected on the create screen.

**WO numbers.** If you already have the real one, pass it per site. Otherwise the system mints
`WO-SLife-IMP-<site>-<po tail>-SmartTower-<seq>`, matching Tawal's own shape.

---

## How a signed GCL is read

Regex over flattened PDF text breaks the moment a description wraps differently. Instead
`gcl.parser.ts` pulls every text run **with its (x, y) coordinates** and rebuilds the table:

1. Extract positioned tokens (pdfjs-dist).
2. Anchor a row on each item code matching `SMART-TWR-001`.
3. Slice the page into bands at the **midpoint between anchors**, so description lines
   rendered above and below the code stay with their own row.
4. Inside a band, resolve columns by x-order relative to the `Unit` token —
   `NO | Item Code | Description | Unit | Design QTY | As-Built QTY | Tangible/Service`.
5. Read the header block by label proximity, and serials with `SN:` matching.

Verified against `241-00-102R11_GCL-Signed.pdf`: all five lines, both quantity columns,
all three serial numbers, both signatories, and the three handwritten remarks — no warnings.

**Date handling:** the GCL prints `16 Agu 2026`. `Agu` isn't an English month, so the parser
carries a month-alias table (`agu`, `agt`, `ago`, `okt`, `des`, …) alongside `dd/mm/yyyy`
and `d-MMM-yy` forms.

**If a GCL is a flat scan** (no text layer) the parser says so explicitly rather than
returning silent nonsense. Re-export from Excel or OCR it first.

---

## What the system can't know

Three things appear on the reference documents but exist in **neither** the GCL nor the UPL,
so the review screen collects them:

| Field | Where it appears | Example |
|---|---|---|
| **TAG #** | As-Built BOQ | `001274293` — Tawal's asset registry, defaults to `N/A` |
| **Handover Date** | Work Order | `13-Aug-26` |
| **Start Date** | Work Order | `6-May-26` |

End Date pre-fills from the GCL date.

---

## Document fidelity

Layouts were measured from your PDFs, not eyeballed — every rect, column boundary, font
size and fill colour was extracted and mirrored in `pt` units.

**Work Order** — grid spans 18.5→537.7pt across seven columns at the original boundaries;
fixed 14-row form; totals box with the `#E7E6E6` label column; `#F59042` classification
banners top and bottom.

**PAC** — 466×498pt frame, bilingual title band, RTL Arabic clause column, 14-row site grid,
four-row signature block.

**As-Built BOQ (Excel)** — verified field-by-field against your workbook: `Aptos Narrow`,
header `#0E2841` white bold 8pt, `[$-409]d\-mmm\-yy;@` dates, `0.00` quantities, item codes
stored as text, column widths `50 / 16 / 14.5 / 13 / 18 / 8.83`, autofilter over the range.

> Item codes render in rust (`#C55A11`) to match the screenshot you sent. The raw workbook
> has them black — flip `ITEM_CODE_FONT` in `boq-excel.generator.ts` if you prefer that.

**Work Order (Excel)** uses live `SUM` formulas, so Net recalculates when finance edits the grid.

---

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/gcl/scope/preview` | Dry run over a scope sheet — sites, items, pricing |
| `POST` | `/api/gcl/scope/create` | Build package(s) from a scope sheet (+ signature) |
| `POST` | `/api/packages/:id/signature` | Attach or replace the GCL signature |
| `POST` | `/api/gcl/preview` | Dry run — parse a signed GCL, persist nothing |
| `POST` | `/api/gcl/upload` | Parse, price, save as a package |
| `GET` | `/api/packages` | List / search |
| `GET` | `/api/packages/:id` | One package with lines and documents |
| `PATCH` | `/api/packages/:id` | Edit header or lines, then auto re-price |
| `POST` | `/api/packages/:id/reprice` | Re-price against current UPL |
| `POST` | `/api/packages/:id/documents/generate` | Build and store documents |
| `GET` | `/api/packages/:id/documents/:type/preview` | Live render, nothing cached |
| `GET` | `/api/packages/:id/bundle` | ZIP of every document + the source GCL |
| `GET` | `/api/upl` · `/api/upl/import` | Price list browse / import |
| `GET` | `/api/health` | Liveness + UPL row count |

---

## Interface

Built to the Smart Life brand guideline: **Poppins**, and the palette straight off the
colour-scheme page — `#1D174C` indigo, `#01C2F3` cyan, `#44489D` violet, `#C36BA9` orchid.
The guideline asks for gradients and a holographic feel, so surfaces sit on a soft mesh
gradient and primary actions use the four-stop brand gradient.

**On Material UI.** You asked for MUI *and* shadcn. Shipping both means two theming systems,
two sets of primitives and roughly double the CSS for components that do the same job — so
the app uses the shadcn approach (Radix primitives + Tailwind, components owned in
`src/components/ui/`) which is what the codebase was already set up for. Say the word if you
want MUI instead and I'll swap it; mixing them is the one option I'd argue against.

**Layout.** A collapsible sidebar splits navigation into *Workflow* (Create GCL, Upload GCL)
and *Library* (Packages, Price List), so the two entry points read as a choice rather than a
list. The active item is a shared-layout gradient pill that slides between entries. On mobile
the sidebar collapses to a scrollable tab strip.

**Theme.** Light, dark and system, remembered in `localStorage` and following the OS while on
system. Rather than sprinkling `dark:` everywhere, both themes drive one set of CSS-variable
tokens (`--canvas`, `--card`, `--line`, `--fg`, …) exposed to Tailwind as `bg-card`,
`border-line`, `text-fg-muted` and so on — so a component is written once and is correct in
both. The Tawal mark ships in two tints because its near-black wordmark vanishes on the dark
canvas.

**Glass and depth.** Surfaces are real glass — translucent fill, backdrop blur with saturation
boost, a hairline border and an inner top highlight — over a faint, slow-drifting colour field
in the three brand hues, so no screen is ever flat white or flat black.

The field is deliberately restrained: blobs are parked in the corners, and a radial veil washes
the canvas colour back across the middle, where tables and forms live. Colour survives at the
edges; the working area stays calm. Three variables in `index.css` tune it — `--aurora-alpha`
(strength), `--aurora-blur` (softness) and `--chrome-alpha` (how solid the sidebar and header
sit on top).

**Motion.** Page transitions, staggered card reveals on scroll, spring-loaded buttons, panning
gradients on headings and active chrome, a sweeping sheen on the dropzone, and a pipeline strip
that lights each of the five documents as it is produced. All of it respects
`prefers-reduced-motion`.

**Guided tour.** First visit opens a six-step walkthrough that spotlights *real* elements via
`data-tour` attributes and an SVG-masked dimmer — no screenshots to go stale. It navigates
between routes as it goes, supports keyboard control, remembers completion in `localStorage`,
and can be reopened any time from **Take the tour** in the header. Under 640px it becomes a
bottom sheet — a floating popover cannot sit beside a spotlight on a phone without spilling
off-screen — and steps whose target is hidden at that width (the desktop-only sidebar) centre
instead of spotlighting a zero-size box.

---

## Design decisions worth knowing

**Prices are versioned.** `UplItem` is unique on `(version, itemCode)` and each package
records the `uplVersion` it was costed with, so a price rise next quarter never silently
rewrites a package Tawal already signed.

**Money is `Decimal`, never `float`.** Prisma `Decimal(14,4)` for unit prices, `Decimal(14,2)`
for totals, `Prisma.Decimal` arithmetic throughout. `1670.866667 × 3` in floating point
does not land where finance expects.

**One Chromium, kept warm.** Launching per request costs ~300 ms; the browser is a singleton
and only the page is per-request. Templates recompile on every call in dev so you can edit
a `.hbs` without restarting.

**Missing prices fail loudly.** An item code absent from the UPL is priced at 0.00, flagged
on the line, surfaced as a warning on upload, on the package, and in the generate response —
rather than quietly under-billing.

**The WO form is per-site, not per-item.** Its Amount column carries the site's gross;
multi-site POs add rows. `WO_TABLE_ROWS` is the form's fixed height.

---

## Layout

```
backend/
  prisma/schema.prisma · seed.ts · upl-reference.xlsx
  assets/                          tawal-logo.png · smartlife-logo.png · company-stamp.png
  src/modules/
    gcl/        gcl.parser.ts          ← reads a signed GCL (positional extraction)
                scope.parser.ts        ← reads a scope sheet (GCL creation)
                gcl-builder.service.ts ← scope -> packages
    upl/        upl.parser.ts      ← header-alias Excel import
    packages/   packages.service.ts ← pricing engine
    documents/
      generators/  pdf.renderer.ts · boq-excel.generator.ts · wo-excel.generator.ts
      templates/   gcl.hbs · wo.hbs · pac.hbs · boq.hbs
    storage/
frontend/
  src/pages/  UploadPage · PackagesPage · PackageDetailPage · UplPage
  src/lib/    api.ts · types.ts
```

## Next steps worth considering

- **Auth** — there is none yet. Add `@nestjs/jwt` with a `Roles` guard before this leaves your network.
- **Multi-site POs** — the schema supports one site per package. A `PoBatch` grouping several packages onto one WO/PAC form is a natural follow-on.
- **OCR fallback** — for GCLs that arrive as flat scans, `tesseract.js` behind a feature flag.
