import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data-store';
import type { Mission } from '../types';

export function createMissionsRouter(store: DataStore): Router {
  const router = Router();

  /** GET /api/missions — all missions */
  router.get('/', (_req, res) => {
    res.json(store.getMissions());
  });

  /** POST /api/missions — create new mission */
  router.post('/', (req, res) => {
    const body = req.body as Omit<Mission, 'id' | 'status' | 'startedAt' | 'completedAt'>;

    if (!body.vehicleId || !body.name) {
      return res.status(400).json({ error: 'vehicleId and name are required' });
    }

    const mission: Mission = {
      id:           uuid(),
      vehicleId:    body.vehicleId,
      name:         body.name,
      waypoints:    body.waypoints    ?? [],
      depthProfile: body.depthProfile ?? [],
      maxDepth:     body.maxDepth     ?? 80,
      targetSpeed:  body.targetSpeed  ?? 3,
      timeout:      body.timeout      ?? 120,
      status:       'planned',
      startedAt:    null,
      completedAt:  null,
    };

    store.upsertMission(mission);
    res.status(201).json(mission);
  });

  /** GET /api/missions/:id — single mission */
  router.get('/:id', (req, res) => {
    const mission = store.getMission(req.params['id']);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    res.json(mission);
  });

  /** PUT /api/missions/:id — update mission (only if planned/paused) */
  router.put('/:id', (req, res) => {
    const existing = store.getMission(req.params['id']);
    if (!existing) return res.status(404).json({ error: 'Mission not found' });

    const body    = req.body as Partial<Mission>;
    const updated = {
      ...existing,
      ...body,
      id:     existing.id,       // ID is immutable
      status: existing.status,   // Status must change via command, not direct PUT
    };

    store.upsertMission(updated);
    res.json(updated);
  });

  /** DELETE /api/missions/:id */
  router.delete('/:id', (req, res) => {
    const deleted = store.deleteMission(req.params['id']);
    if (!deleted) return res.status(404).json({ error: 'Mission not found' });
    res.json({ deleted: true, id: req.params['id'] });
  });

  /** GET /api/missions/:id/log — mission event log */
  router.get('/:id/log', (req, res) => {
    const mission = store.getMission(req.params['id']);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    res.json(store.getMissionLog(req.params['id']));
  });

  return router;
}
