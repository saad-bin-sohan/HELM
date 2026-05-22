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

// Allow all hosts — nginx handles host validation in production.
// Without this, Angular 21's SSRF protection rejects requests where the Host
// header is 'localhost:4000' (Docker health checks, dev access).
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['*'],
});

// ── API proxy ─────────────────────────────────────────────────────────────────
// In production-with-nginx, nginx handles /api and /ws routing to helm-server.
// In direct deployments (Railway single-service, local SSR testing), this proxy
// forwards API and WebSocket calls to the backend.
// BACKEND_URL: the internal URL the SSR Node server uses to proxy /api requests.
// In a docker-compose setup, this is the service name URL (e.g. http://helm-server:3000).
// Falls back to API_URL (for Railway/single-service deployments), then localhost.
const apiTarget =
  process.env['BACKEND_URL'] ??
  process.env['API_URL']     ??
  'http://localhost:3000';

// Use pathFilter (not Express mount) so the /api prefix is preserved in the
// proxied request. app.use('/api', proxy) strips the mount prefix from req.url,
// causing the backend to receive /vehicles instead of /api/vehicles → 404.
app.use(
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    pathFilter: '/api',
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
  app.listen(port, '0.0.0.0', () => {
  console.log(`[HELM SSR] Angular server listening on http://0.0.0.0:${port}`);
  console.log(`[HELM SSR] API proxy → ${apiTarget} (BACKEND_URL or API_URL)`);
});

}

export const reqHandler = createNodeRequestHandler(app);
