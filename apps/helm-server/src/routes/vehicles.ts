import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data-store';
import type { SimulatorEngine } from '../simulator/engine';
import type { Command } from '../types';

export function createVehiclesRouter(store: DataStore, engine: SimulatorEngine): Router {
  const router = Router();

  /** GET /api/vehicles — all vehicle descriptors */
  router.get('/', (_req, res) => {
    res.json(store.getVehicles());
  });

  /** GET /api/vehicles/:id — single vehicle */
  router.get('/:id', (req, res) => {
    const vehicle = store.getVehicle(req.params['id']);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
  });

  /**
   * GET /api/vehicles/:id/telemetry
   * Query params: limit (default 60), startTs, endTs (Unix ms)
   */
  router.get('/:id/telemetry', (req, res) => {
    const id      = req.params['id'];
    const limit   = parseInt(req.query['limit']   as string || '60',  10);
    const startTs = req.query['startTs'] ? parseInt(req.query['startTs'] as string, 10) : undefined;
    const endTs   = req.query['endTs']   ? parseInt(req.query['endTs']   as string, 10) : undefined;

    const history = store.getTelemetryHistory(id, limit, startTs, endTs);
    res.json(history);
  });

  /**
   * POST /api/vehicles/:id/commands
   * Body: { type: CommandType, payload?: Record<string, unknown> }
   */
  router.post('/:id/commands', (req, res) => {
    const vehicleId = req.params['id'];
    const vehicle   = store.getVehicle(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const body = req.body as Pick<Command, 'type' | 'payload'>;

    const command: Command = {
      id:        uuid(),
      vehicleId,
      type:      body.type,
      payload:   body.payload,
      sentAt:    Date.now(),
      status:    'pending',
    };

    const ack = engine.processCommand(vehicleId, command);
    res.json(ack);
  });

  return router;
}
