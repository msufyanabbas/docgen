# Pinned by digest: the mutable tag gets republished on Debian security updates,
# which invalidates every layer below and re-downloads Chromium + LibreOffice.
# Bump deliberately when you want a newer base.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS base

# Puppeteer must not fetch its own Chromium — we install the system one below.
# Both variable names are set: the first is current, the second is the legacy
# name that older puppeteer releases look for.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Chromium plus the font families the templates ask for. fonts-noto-core is what
# makes the PAC's Arabic column render; without it Chromium draws empty boxes.
# chromium  -> renders the BOQ / WO / PAC PDFs
# libreoffice-writer -> converts the filled MOP .docx to PDF, so the Word file and
#                       the PDF Tawal receives can never drift apart
# fonts-noto-core    -> Arabic in the PAC; without it Chromium draws empty boxes
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-dejavu-core \
      fonts-noto-core fonts-noto-color-emoji \
      libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 \
      libreoffice-writer-nogui libreoffice-core-nogui \
      default-jre-headless \
      fonts-crosextra-carlito fonts-crosextra-caladea \
      poppler-utils \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin the substitution for Tawal's brand font so the MOP renders identically
# here and anywhere else. See docker/fonts-local.conf for why.
COPY docker/fonts-local.conf /etc/fonts/local.conf
RUN fc-cache -f >/dev/null

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    SOFFICE_PATH=/usr/bin/soffice
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# `npm ci` when a lockfile is present, plain install when it isn't, so the image
# still builds if someone drops the lockfile from the tree.
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY package.json package-lock.json* ./
COPY assets ./assets
# The MOP templates are Tawal's own .docx files with placeholders — the generator
# reads them at runtime.
COPY templates ./templates
# src + tsconfig are kept so `npx prisma db seed` still works inside the container;
# normal boot auto-seeds an empty price list and never needs them.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/storage
EXPOSE 3000
# Apply migrations when the repo has them; otherwise push the schema directly so a
# fresh clone boots into a working database without a migration history.
CMD ["sh", "-c", "if [ -d prisma/migrations ]; then npx prisma migrate deploy; else npx prisma db push --skip-generate; fi && node dist/main.js"]
