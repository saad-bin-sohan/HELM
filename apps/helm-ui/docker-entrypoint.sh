#!/bin/sh
# =============================================================================
# HELM Angular SSR — Docker Entrypoint
# Performs runtime environment variable injection into the Angular bundle,
# then starts the Node.js SSR server.
# =============================================================================

set -e

echo "╔════════════════════════════════════════╗"
echo "║     HELM Angular SSR — Starting Up     ║"
echo "╚════════════════════════════════════════╝"

# ── Environment variable defaults ─────────────────────────────────────────────
# These are the fallback values if the variables are not set.
# In production Docker Compose, these are always overridden.
WS_URL="${WS_URL:-ws://localhost:3000}"
API_URL="${API_URL:-http://localhost:3000/api}"
PORT="${PORT:-4000}"

echo "[HELM] Runtime config:"
echo "  WS_URL  = ${WS_URL}"
echo "  API_URL = ${API_URL}"
echo "  PORT    = ${PORT}"

# ── Replace placeholders in the Angular build output ──────────────────────────
# The Angular production build compiles environment.ts literally, so
# '__WS_URL__' and '__API_URL__' appear as strings inside the hashed JS files.
# These placeholders exist in BOTH the browser bundle (client-side) and the
# server bundle (SSR). We must replace in both directories.
#
# IMPORTANT: The directory paths are relative to WORKDIR (/app).
BROWSER_DIR="/app/dist/apps/helm-ui/browser"
SERVER_DIR="/app/dist/apps/helm-ui/server"

if [ -d "${BROWSER_DIR}" ]; then
    echo "[HELM] Injecting runtime environment into Angular browser bundle..."

    # Replace __WS_URL__ placeholder in browser JS
    find "${BROWSER_DIR}" -name "*.js" -type f \
        -exec sed -i "s|__WS_URL__|${WS_URL}|g" {} +

    # Replace __API_URL__ placeholder in browser JS
    find "${BROWSER_DIR}" -name "*.js" -type f \
        -exec sed -i "s|__API_URL__|${API_URL}|g" {} +

    echo "[HELM] Browser bundle placeholder replacement complete."
else
    echo "[HELM] WARNING: Browser directory not found at ${BROWSER_DIR}"
fi

if [ -d "${SERVER_DIR}" ]; then
    echo "[HELM] Injecting runtime environment into Angular server bundle..."

    # Replace __WS_URL__ placeholder in server MJS
    find "${SERVER_DIR}" -name "*.mjs" -type f \
        -exec sed -i "s|__WS_URL__|${WS_URL}|g" {} +

    # Replace __API_URL__ placeholder in server MJS
    find "${SERVER_DIR}" -name "*.mjs" -type f \
        -exec sed -i "s|__API_URL__|${API_URL}|g" {} +

    echo "[HELM] Server bundle placeholder replacement complete."
else
    echo "[HELM] WARNING: Server directory not found at ${SERVER_DIR}"
fi

# ── Start the Angular SSR server ───────────────────────────────────────────────
echo "[HELM] Starting Angular SSR server on port ${PORT}..."
echo "[HELM] BACKEND_URL for SSR proxy = ${BACKEND_URL:-http://localhost:3000}"

exec node /app/dist/apps/helm-ui/server/server.mjs
