# syntax=docker/dockerfile:1

###############################################################################
# Single image that runs BOTH the OpenBao server and our Next.js BFF/UI.
#   - OpenBao listens internally on 127.0.0.1:8200
#   - Next.js (standalone) listens on 0.0.0.0:3000 and is the only exposed port
#   - Next proxies /v1/* to OpenBao (see next.config.ts rewrites)
###############################################################################

# OpenBao binary source. The image is tagged to match this exact OpenBao
# version (tag parity) and the `bao` binary copied below comes from it. Keep
# OPENBAO_VERSION in sync with the repo's `.openbao-version` pin — CI passes it
# explicitly (`--build-arg OPENBAO_VERSION=$(cat .openbao-version)`); this
# default is just the fallback for ad-hoc local builds.
#   docker build --build-arg OPENBAO_VERSION=2.6.2 .
# Or override the whole ref to pin a digest:
#   docker build --build-arg OPENBAO_IMAGE=quay.io/openbao/openbao@sha256:… .
ARG OPENBAO_VERSION=2.6.2
ARG OPENBAO_IMAGE=quay.io/openbao/openbao:${OPENBAO_VERSION}
FROM ${OPENBAO_IMAGE} AS openbao

# --- Stage 1: install dependencies ------------------------------------------
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
# Reproducible installs: use a frozen lockfile when one is present, and only
# fall back to a fresh resolve when there genuinely is no lockfile — never
# silently on a frozen-install failure (which would mask dependency drift).
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# --- Stage 2: build the Next.js standalone output ---------------------------
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- Stage 3: runtime (Node + the OpenBao binary) ---------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV OPENBAO_ADDR=http://127.0.0.1:8200
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# No extra OS packages: the readiness probe uses Node's built-in fetch and
# signal handling is delegated to Docker's init (run with `--init` / compose
# `init: true`). Keeps the image lean and free of build-time network deps.

# Pull the `bao` binary from the OpenBao image stage (see OPENBAO_IMAGE above).
COPY --from=openbao /bin/bao /usr/local/bin/bao

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

# Dev mode is the default so login works out of the box; disable for production.
ENV BAO_DEV=1
ENV BAO_DEV_ROOT_TOKEN_ID=root

EXPOSE 3000
USER bao

# Run with `docker run --init` (or compose `init: true`) so PID 1 reaps the
# two child processes (OpenBao + Next.js) cleanly.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
