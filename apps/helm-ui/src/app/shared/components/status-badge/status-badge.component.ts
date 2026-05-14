import {
  Component, Input, ChangeDetectionStrategy,
} from '@angular/core';
import { NgClass } from '@angular/common';
import type { VehicleStatus } from '@helm/models';

/** Maps VehicleStatus to display label. OFFLINE uses strikethrough in CSS. */
const STATUS_LABELS: Record<VehicleStatus, string> = {
  active:   'ACTIVE',
  idle:     'IDLE',
  warning:  'WARNING',
  critical: 'CRITICAL',
  offline:  'OFFLINE',
};

@Component({
  selector:         'helm-status-badge',
  standalone:       true,
  changeDetection:  ChangeDetectionStrategy.OnPush,
  imports:          [NgClass],
  template: `
    <span
      class="helm-badge"
      [ngClass]="[statusClass, pulseClass]"
      role="status"
      [attr.aria-label]="'Vehicle status: ' + label"
    >
      <span class="badge-dot"></span>
      <span class="badge-label" [class.offline-text]="status === 'offline'">
        {{ label }}
      </span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }

    .helm-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px 2px 5px;
      border-radius: var(--radius-pill);
      font-size: 0.625rem;
      font-family: var(--font-mono);
      font-weight: 700;
      letter-spacing: 0.08em;
      border: 1px solid currentColor;
      white-space: nowrap;
      transition: color var(--transition-fast), background var(--transition-fast);
    }

    .badge-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    /* Status colors */
    .s-active   { color: var(--color-healthy);  background: var(--color-healthy-dim);  }
    .s-idle     { color: var(--color-offline);  background: var(--color-offline-dim);  }
    .s-warning  { color: var(--color-warning);  background: var(--color-warning-dim);  }
    .s-critical { color: var(--color-critical); background: var(--color-critical-dim); }
    .s-offline  { color: var(--color-offline);  background: var(--color-offline-dim);  }

    /* Pulse animations (keyframes defined in styles.scss) */
    .pulse-warning  { animation: helm-pulse-warning  1.8s ease-in-out infinite; }
    .pulse-critical { animation: helm-pulse-critical 1.1s ease-in-out infinite; }

    /* Strikethrough for offline */
    .offline-text { text-decoration: line-through; opacity: 0.7; }
  `],
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: VehicleStatus;

  get label(): string       { return STATUS_LABELS[this.status] ?? this.status.toUpperCase(); }
  get statusClass(): string { return `s-${this.status}`; }
  get pulseClass(): string {
    if (this.status === 'warning')  return 'pulse-warning';
    if (this.status === 'critical') return 'pulse-critical';
    return '';
  }
}
