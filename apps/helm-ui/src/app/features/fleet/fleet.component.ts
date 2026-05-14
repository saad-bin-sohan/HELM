import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'helm-fleet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="helm-panel p-6">
      <h1 class="font-display text-xl font-semibold mb-1">Fleet Overview</h1>
      <p class="text-sm" style="color: var(--color-text-secondary)">
        Multi-vehicle overview — implemented in Batch 5.
      </p>
    </div>
  `,
})
export class FleetComponent {}
