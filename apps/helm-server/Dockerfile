# =============================================================================
# HELM Node.js Simulation Server — Multi-Stage Dockerfile
# Build context: workspace ROOT (helm/)
# Build: docker build -f apps/helm-server/Dockerfile -t helm-server .
# =============================================================================

# ─── Stage 1: Full workspace builder ─────────────────────────────────────────
FROM node:20-alpine AS builder
LABEL stage="builder"

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifests (layer cache optimisation)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nx.json tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

# Copy only the source we need for the server build
# (helm-ui source is not needed to build helm-server)
COPY apps/helm-server/ ./apps/helm-server/
COPY libs/shared-types/ ./libs/shared-types/

# Build helm-server (esbuild, CJS format, generatePackageJson: true)
# Output: dist/apps/helm-server/main.js + dist/apps/helm-server/package.json
RUN npx nx build helm-server --configuration=production

# ─── Stage 2: Minimal production runner ───────────────────────────────────────
FROM node:20-alpine AS runner
LABEL stage="runner"

WORKDIR /app

# Copy the built server bundle (single CJS file)
COPY --from=builder /app/dist/apps/helm-server/main.js ./main.js

# Copy the NX-generated package.json (only lists runtime external deps:
# express, cors, ws, uuid — NOT the full workspace devDeps)
COPY --from=builder /app/dist/apps/helm-server/package.json ./package.json

# Install only runtime dependencies listed in the generated package.json
# No lock file in dist, so use npm install (not pnpm) for this minimal install
RUN npm install --production --ignore-scripts

# Server port
ENV PORT=3000
EXPOSE 3000

# Health check: call the /api/health endpoint we already have in main.ts
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/health > /dev/null || exit 1

# Start the simulation server
CMD ["node", "main.js"]
