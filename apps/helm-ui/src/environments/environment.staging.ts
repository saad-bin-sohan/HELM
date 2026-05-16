// Staging environment — for Railway / Vercel / render.com deployments.
// These values are injected at build time via `--configuration=staging`.
// Override with your actual Railway URLs after Phase 5 deployment.
export const environment = {
  production:          true,
  wsUrl:               process.env['WS_URL'] ?? 'wss://helm-server.railway.app',
  apiUrl:              process.env['API_URL'] ?? 'https://helm-server.railway.app/api',
  simulationMode:      true,
  wsReconnectBaseMs:   1000,
  wsReconnectMaxMs:    30000,
  telemetryBufferSize: 240,
} as const;
