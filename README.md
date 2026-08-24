# Tawal DocGen

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
