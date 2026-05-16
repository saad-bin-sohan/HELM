import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    path: 'dashboard',
    renderMode: RenderMode.Server,
  },
  {
    path: 'fleet',
    renderMode: RenderMode.Server,
  },
  {
    path: 'mission-planner',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sensor-analytics',
    renderMode: RenderMode.Server,
  },
  {
    path: 'mission-log',
    renderMode: RenderMode.Server,
  },
  {
    path: 'settings',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
