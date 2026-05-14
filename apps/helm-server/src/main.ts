import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { DataStore }                  from './data-store';
import { SimulatorEngine }            from './simulator/engine';
import { buildInitialMissions, buildInitialAlerts } from './simulator/config';
import { createVehiclesRouter }       from './routes/vehicles';
import { createMissionsRouter }       from './routes/missions';
import { createAlertsRouter }         from './routes/alerts';
import type { WsMessage }             from './types';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

// ─── Bootstrap ───────────────────────────────────────────
const store = new DataStore();

// Seed initial missions + alerts (vehicles seeded by engine.initialize())
for (const mission of buildInitialMissions()) store.upsertMission(mission);
for (const alert   of buildInitialAlerts())  store.upsertAlert(alert);

// ─── HTTP + WebSocket servers ─────────────────────────────
const app        = express();
const httpServer = createServer(app);
const wss        = new WebSocketServer({ server: httpServer });

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));

// ─── Broadcast helper ─────────────────────────────────────
function broadcast(message: WsMessage): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ─── Simulation engine ────────────────────────────────────
const engine = new SimulatorEngine(store, broadcast);
engine.initialize();
engine.start();

// ─── REST routes ──────────────────────────────────────────
app.use('/api/vehicles', createVehiclesRouter(store, engine));
app.use('/api/missions', createMissionsRouter(store));
app.use('/api/alerts',   createAlertsRouter(store));

app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: Date.now(),
    vehicles:  store.getVehicles().length,
    missions:  store.getMissions().length,
    wsClients: wss.clients.size,
  });
});

// ─── WebSocket connection handling ────────────────────────
wss.on('connection', (ws) => {
  console.log(`[WS] Client connected — total: ${wss.clients.size}`);

  // Immediately push current telemetry to new subscriber so the UI
  // doesn't show empty dashboards until the next 250ms tick.
  const currentTelemetry = engine.getAllCurrentTelemetry();
  for (const [vehicleId, frame] of currentTelemetry) {
    const msg: WsMessage = {
      type:      'telemetry',
      vehicleId,
      payload:   frame,
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(msg));
  }

  ws.on('message', (raw) => {
    try {
      // Client may send commands directly over WebSocket as an alternative to REST
      const msg = JSON.parse(raw.toString()) as {
        type: string;
        vehicleId?: string;
        payload?: unknown;
      };

      if (msg.type === 'command' && msg.vehicleId) {
        const ack = engine.processCommand(
          msg.vehicleId,
          msg.payload as Parameters<typeof engine.processCommand>[1],
        );
        const ackMsg: WsMessage = { type: 'command_ack', payload: ack, timestamp: Date.now() };
        ws.send(JSON.stringify(ackMsg));
      }
    } catch {
      // Silently ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected — total: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Socket error:', err.message);
  });
});

// ─── Start listening ──────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       HELM Simulation Server v1.0      ║
╠════════════════════════════════════════╣
║  HTTP  →  http://localhost:${PORT}         ║
║  WS    →  ws://localhost:${PORT}           ║
║  Health→  http://localhost:${PORT}/api/health ║
╠════════════════════════════════════════╣
║  Vehicles : 3 (AUV · ROV · ASV)        ║
║  Missions : 5 (3 active · 2 planned)   ║
║  Telemetry: 4 Hz broadcast             ║
║  Faults   : Injected ~every 60–120s   ║
╚════════════════════════════════════════╝
  `);
});

// ─── Graceful shutdown ────────────────────────────────────
process.on('SIGTERM', () => {
  engine.stop();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  engine.stop();
  httpServer.close(() => process.exit(0));
});
