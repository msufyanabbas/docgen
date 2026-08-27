# Quickstart

Two ways to run it. Pick one.

---

## Option A — Docker (nothing to install but Docker)

```bash
docker compose up --build
```

That's it. The schema is created on first boot and the bundled UPL price list
(43 items) is imported automatically when the table is empty.

Open **http://localhost:8080**

> First build takes a few minutes — it pulls Chromium and the Arabic fonts the
> PAC template needs.

---

## Option B — Run locally

**You need:** Node.js 20+ and a PostgreSQL 14+ database.

### 1. Database

Create an empty database:

```bash
createdb tawal_docgen
```

Or with Docker, just the database:

```bash
docker run -d --name docgen-db -p 5432:5432 \
  -e POSTGRES_USER=docgen -e POSTGRES_PASSWORD=docgen -e POSTGRES_DB=tawal_docgen \
  postgres:16-alpine
```

### 2. Backend

```bash
cd backend
npm install                              # also downloads Chromium for PDF rendering
```

Open `backend/.env` and check `DATABASE_URL` points at your database.
The default matches the Docker command above:

```
DATABASE_URL="postgresql://docgen:docgen@localhost:5432/tawal_docgen?schema=public"
```

Then:

```bash
npx prisma migrate dev --name init        # creates the tables
npm run start:dev                         # http://localhost:3000
```

Leave that terminal running.

### 3. Frontend

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

Open **http://localhost:5173**

---

## Signing in

The first boot creates an admin from the env file:

```
ADMIN_EMAIL=admin@smart-life.sa
ADMIN_PASSWORD=ChangeMe123!
```

Sign in with those, and you'll be asked to set your own password immediately. Then go to
**Users** to create accounts for your PMs.

> Change `ADMIN_PASSWORD` in `.env` before the first deploy, and set a real `JWT_SECRET`
> (`openssl rand -hex 32`). In production the API refuses to start without one.

---

## First run

### Creating a GCL from a scope sheet

1. Go to **Create GCL** and drop in `samples/source/ZMS008.xlsx`.
2. It finds one site (ZMS009 · BLVD WORLD) with 9 items. Leave it selected.
3. Upload a signature image (any PNG works for a test). The stamp is automatic.
4. Fill Region, District and the PM names, then **Create GCL**.
5. On the package screen hit **Generate documents** — you get the GCL plus the
   BOQ, WO and PAC.

### Generating a MOP

1. Pick a project in the sidebar under **Projects** — RMS, CCTV, SIM Swap or Smart Locks.
2. Choose the MOP category (Survey/Installation, PAT, …).
3. Fill TCN Summary, Site ID, Requester, PM and Site Impact.
4. **Generate MOP** → download the `.docx`, or preview the PDF.

For many sites, switch to **Bulk from Excel**, download the template, fill one row per site
and upload it back.

### Working from a signed GCL

1. Go to **Price List** — you should see 43 items under version `v1`.
   They are imported automatically on first boot. If it's empty, run
   `npm run seed` from `backend/` and check the backend log.
2. Go to **Upload GCL** and drop in `samples/source/241-00-102R11_GCL-Signed.pdf`.
3. Check the parse preview, fill in Handover Date and Start Date, click **Create package**.
4. On the package screen, enter the TAG # values, hit **Save & re-price**,
   then **Generate documents**.
5. Download individually, or grab everything as a ZIP.

Expected result for that GCL: **Net 11,216.00 SAR** on As-Built quantities.

---

## Troubleshooting

**`Cannot find module '@prisma/client'`**
Run `npx prisma generate` inside `backend/`.

**PDF generation fails / "Could not find Chromium"**
Puppeteer's download was skipped. Either run `npx puppeteer browsers install chrome`,
or install Chromium yourself and set `PUPPETEER_EXECUTABLE_PATH` in `backend/.env`.

**Arabic on the PAC renders as boxes**
Chromium has no Arabic font. On Ubuntu/Debian: `sudo apt install fonts-noto-core`.
On macOS and Windows the system fonts already cover it.

**Frontend loads but every request 404s**
The backend isn't on port 3000. Check the first terminal, or point
`VITE_API_TARGET` in `frontend/.env` at the right address.

**`P1001: Can't reach database server`**
Postgres isn't running, or `DATABASE_URL` is wrong.
