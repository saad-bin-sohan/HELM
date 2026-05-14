import { Directive, Input, HostBinding } from '@angular/core';
import type { ThresholdStatus } from '@helm/models';

/**
 * Applies semantic CSS status classes based on a ThresholdStatus value.
 * The actual colors come from global .status-* classes defined in styles.scss.
 *
 * Usage:
 *   <div [helmThresholdColor]="thresholdStatus">{{ value }}</div>
 *
 * Applies one of: .status-healthy | .status-warning | .status-critical
 */
@Directive({
  selector:   '[helmThresholdColor]',
  standalone: true,
})
export class ThresholdColorDirective {
  @Input({ required: true }) helmThresholdColor: ThresholdStatus | null = null;

  @HostBinding('class.status-healthy')
  get isHealthy(): boolean  { return this.helmThresholdColor === 'healthy';  }

  @HostBinding('class.status-warning')
  get isWarning(): boolean  { return this.helmThresholdColor === 'warning';  }

  @HostBinding('class.status-critical')
  get isCritical(): boolean { return this.helmThresholdColor === 'critical'; }
}
