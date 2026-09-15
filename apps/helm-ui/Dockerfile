# =============================================================================
# HELM Angular SSR — Multi-Stage Dockerfile
# Build context: workspace ROOT (helm/)
# Build: docker build -f apps/helm-ui/Dockerfile -t helm-ui .
# =============================================================================

# ─── Stage 1: Full workspace builder ─────────────────────────────────────────
# We build from the NX workspace root because NX needs access to the entire
# monorepo (shared libs, tsconfig.base.json, pnpm-lock.yaml, etc.)
FROM node:20-alpine AS builder
LABEL stage="builder"

WORKDIR /app

# Enable Corepack's shims BEFORE copying files so this layer is cached. This
# does not fetch or pin a pnpm version by itself -- that happens in
# `corepack install` below, once package.json (and its "packageManager"
# field) has been copied in.
RUN corepack enable

# Copy workspace-level manifests first (best layer-caching practice).
# Changing source code won't invalidate the pnpm install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nx.json tsconfig.base.json jest.preset.js ./

# Fetch and activate the exact pnpm version declared in package.json's
# "packageManager" field. That field is the single source of truth for the
# pnpm version across Docker, CI, and local dev (see ENV-02) -- the version
# is intentionally NOT repeated as a literal here, so there is exactly one
# place to bump it in future.
RUN corepack install

# Install ALL workspace dependencies (including devDeps needed for NX build)
# --frozen-lockfile ensures reproducible installs
RUN pnpm install --frozen-lockfile

# Copy the full workspace source
COPY apps/ ./apps/
COPY libs/ ./libs/

# Build Angular SSR (production configuration)
# This produces dist/apps/helm-ui/browser/ and dist/apps/helm-ui/server/
RUN npx nx build helm-ui --configuration=production

# ─── Stage 2: Minimal production runner ───────────────────────────────────────
# Only copy production deps + built artifacts. No NX, no devDeps, no source.
FROM node:20-alpine AS runner
LABEL stage="runner"

WORKDIR /app

# Enable Corepack's shims for the production dependency install below.
RUN corepack enable

# Copy workspace manifests for production install
# pnpm install --prod installs only non-devDependencies from package.json.
# This includes: express, http-proxy-middleware, @angular/ssr, rxjs, etc.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Fetch and activate the exact pnpm version declared in package.json's
# "packageManager" field -- same single source of truth as the builder
# stage above (see ENV-02).
RUN corepack install

# Install production dependencies only
# --ignore-scripts: security best practice in Docker
# --prod: skip devDependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy the built Angular SSR artifacts from builder.
# CRITICAL: Must preserve the browser/ and server/ sub-directory structure.
# server.mjs uses: resolve(dirname(fileURLToPath(import.meta.url)), '../browser')
# so browser/ and server/ MUST be siblings inside dist/apps/helm-ui/
COPY --from=builder /app/dist/apps/helm-ui ./dist/apps/helm-ui

# Copy the runtime entrypoint script
COPY apps/helm-ui/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Runtime port (Angular SSR Express server)
ENV PORT=4000
EXPOSE 4000

# Health check: verify the SSR server is responding
# --start-period: give the server time to start and warm up Angular platform
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/ > /dev/null || exit 1

# Entrypoint performs runtime env injection (sed __WS_URL__ / __API_URL__)
# then starts the Node.js SSR server
ENTRYPOINT ["./docker-entrypoint.sh"]
