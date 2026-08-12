# syntax=docker/dockerfile:1

###############################################################################
# Single image that runs BOTH the OpenBao server and our Next.js BFF/UI.
#   - OpenBao listens internally on 127.0.0.1:8200
#   - Next.js (standalone) listens on 0.0.0.0:3000 and is the only exposed port
#   - OpenBao remains reachable only through bounded authenticated BFF routes
###############################################################################

# The image is pinned by immutable digest. Keep this fallback in sync with
# `.openbao-image`; CI passes that committed ref explicitly.
#   docker build --build-arg OPENBAO_IMAGE="$(cat .openbao-image)" .
ARG OPENBAO_IMAGE=quay.io/openbao/openbao@sha256:5b2486ab0fb90bbc788cc345b0a08616dfb375873ee8be5df3a2fd4d378a67e0
FROM ${OPENBAO_IMAGE} AS openbao

# --- Stage 1: install dependencies ------------------------------------------
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
# Reproducible installs: use a frozen lockfile when one is present, and only
# fall back to a fresh resolve when there genuinely is no lockfile — never
# silently on a frozen-install failure (which would mask dependency drift).
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# --- Stage 2: build the Next.js standalone output ---------------------------
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder
RUN corepack enable
WORKDIR /app
ARG BUILD_REVISION=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BUILD_REVISION=${BUILD_REVISION}
RUN pnpm build

# --- Stage 3: runtime (Node + the OpenBao binary) ---------------------------
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV OPENBAO_ADDR=http://127.0.0.1:8200
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# No extra OS packages: the readiness probe uses Node's built-in fetch and
# signal handling is delegated to Docker's init (run with `--init` / compose
# `init: true`). Keeps the image lean and free of build-time network deps.

# OpenBao 2.6+ installs `bao` at /usr/bin/bao.
COPY --from=openbao /usr/bin/bao /usr/local/bin/bao

# Next.js standalone server + static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# OpenBao config + process supervisor.
COPY docker/openbao.hcl /bao/config/openbao.hcl
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /bao/file \
  && addgroup -S bao && adduser -S bao -G bao \
  && chown -R bao:bao /bao /app

EXPOSE 3000
USER bao

# Run with `docker run --init` (or compose `init: true`) so PID 1 reaps the
# two child processes (OpenBao + Next.js) cleanly.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
