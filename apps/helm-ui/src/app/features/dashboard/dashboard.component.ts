import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'helm-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="helm-panel p-6">
      <h1 class="font-display text-xl font-semibold mb-1">Telemetry Dashboard</h1>
      <p class="text-sm" style="color: var(--color-text-secondary)">
        Live telemetry — implemented in Batch 4.
      </p>
    </div>
  `,
})
export class DashboardComponent {}
