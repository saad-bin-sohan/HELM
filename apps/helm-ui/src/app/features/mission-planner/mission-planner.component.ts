import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'helm-mission-planner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="helm-panel p-6">
      <h1 class="font-display text-xl font-semibold mb-1">Mission Planner</h1>
      <p class="text-sm" style="color: var(--color-text-secondary)">
        Leaflet map + waypoint editor — implemented in Week 2.
      </p>
    </div>
  `,
})
export class MissionPlannerComponent {}
