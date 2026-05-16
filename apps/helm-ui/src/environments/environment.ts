// Production environment — these placeholder strings are replaced at container
// startup by the Docker entrypoint script (sed replacement).
// See apps/helm-ui/docker-entrypoint.sh (created in Phase 2).
//
// Default values (used when placeholders are NOT replaced — e.g., direct node run):
// - wsUrl:  'ws://localhost:3000'
// - apiUrl: 'http://localhost:3000/api'
export const environment = {
  production:          true,
  wsUrl:               '__WS_URL__',
  apiUrl:              '__API_URL__',
  simulationMode:      true,
  wsReconnectBaseMs:   1000,
  wsReconnectMaxMs:    30000,
  telemetryBufferSize: 240,
} as const;
