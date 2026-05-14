import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
        title: 'Dashboard — HELM',
      },
      {
        path: 'fleet',
        loadComponent: () =>
          import('./features/fleet/fleet.component').then(
            (m) => m.FleetComponent,
          ),
        title: 'Fleet — HELM',
      },
      {
        path: 'mission-planner',
        loadComponent: () =>
          import('./features/mission-planner/mission-planner.component').then(
            (m) => m.MissionPlannerComponent,
          ),
        title: 'Mission Planner — HELM',
      },
      {
        path: 'sensor-analytics',
        loadComponent: () =>
          import('./features/sensor-analytics/sensor-analytics.component').then(
            (m) => m.SensorAnalyticsComponent,
          ),
        title: 'Sensor Analytics — HELM',
      },
      {
        path: 'mission-log',
        loadComponent: () =>
          import('./features/mission-log/mission-log.component').then(
            (m) => m.MissionLogComponent,
          ),
        title: 'Mission Log — HELM',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent,
          ),
        title: 'Settings — HELM',
      },
      {
        path: '**',
        redirectTo: 'dashboard',
      },
    ],
  },
];
