import { Router } from 'express';
import type { DataStore } from '../data-store';

export function createAlertsRouter(store: DataStore): Router {
  const router = Router();

  /** GET /api/alerts — last 100 alerts, newest first */
  router.get('/', (_req, res) => {
    res.json(store.getAlerts());
  });

  /** POST /api/alerts/:id/acknowledge — operator acknowledges an alert */
  router.post('/:id/acknowledge', (req, res) => {
    const alert = store.getAlert(req.params['id']);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const updated = { ...alert, acknowledged: true };
    store.upsertAlert(updated);
    res.json(updated);
  });

  return router;
}
