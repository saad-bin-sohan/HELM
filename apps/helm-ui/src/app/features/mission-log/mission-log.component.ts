import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'helm-mission-log',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="helm-panel p-6">
      <h1 class="font-display text-xl font-semibold mb-1">Mission Log</h1>
      <p class="text-sm" style="color: var(--color-text-secondary)">
        Event feed + replay — implemented in Week 2.
      </p>
    </div>
  `,
})
export class MissionLogComponent {}
