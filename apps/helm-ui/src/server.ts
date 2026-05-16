import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// ── API proxy ─────────────────────────────────────────────────────────────────
// In production-with-nginx, nginx handles /api and /ws routing to helm-server.
// In direct deployments (Railway single-service, local SSR testing), this proxy
// forwards API and WebSocket calls to the backend.
// Set API_URL env var to the backend service URL (default: localhost:3000 for dev).
const apiTarget = process.env['API_URL'] ?? 'http://localhost:3000';

app.use(
  '/api',
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    on: {
      error: (err, _req, res) => {
        console.error('[SSR Proxy] API proxy error:', (err as Error).message);
        if ('headersSent' in res && !res.headersSent) {
          (res as express.Response).status(502).json({ error: 'Backend unavailable' });
        }
      },
    },
  }),
);

// ── Static files ──────────────────────────────────────────────────────────────
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// ── Angular SSR ───────────────────────────────────────────────────────────────
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

// ── Start server ──────────────────────────────────────────────────────────────
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`[HELM SSR] Angular server listening on http://localhost:${port}`);
    console.log(`[HELM SSR] API proxy → ${apiTarget}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
