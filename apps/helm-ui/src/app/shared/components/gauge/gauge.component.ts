import {
  Component, Input, OnChanges, ChangeDetectionStrategy,
} from '@angular/core';
import {
  type SensorThreshold, type ThresholdStatus, evaluateThreshold,
} from '@helm/models';

/**
 * SVG circular arc gauge using the stroke-dasharray technique.
 *
 * The gauge covers a 270° arc from the 7:30 position (bottom-left)
 * sweeping clockwise through the top to the 4:30 position (bottom-right).
 *
 * Technique: the stroke-dasharray on a full circle, combined with
 * rotate(135), creates the arc without complex SVG path math.
 *
 * Usage: <helm-gauge [value]="82" [max]="100" [threshold]="batteryThreshold" />
 */
@Component({
  selector:        'helm-gauge',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 120 105"
         xmlns="http://www.w3.org/2000/svg"
         class="gauge-svg"
         aria-hidden="true">

      <!-- ── Background track ── -->
      <circle
        cx="60" cy="60" r="42"
        fill="none"
        stroke="var(--color-border)"
        stroke-width="9"
        stroke-linecap="round"
        [attr.stroke-dasharray]="trackDash"
        transform="rotate(135 60 60)"
      />

      <!-- ── Value fill (animated by CSS transition on stroke-dasharray) ── -->
      <circle
        cx="60" cy="60" r="42"
        fill="none"
        [attr.stroke]="fillStroke"
        stroke-width="9"
        stroke-linecap="round"
        [attr.stroke-dasharray]="fillDash"
        transform="rotate(135 60 60)"
        class="gauge-fill-arc"
      />

      <!-- ── Center value ── -->
      <text
        x="60" y="58"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="JetBrains Mono, monospace"
        font-size="21"
        font-weight="500"
        fill="var(--color-text-primary)"
      >{{ displayValue }}</text>

      <!-- ── Unit label ── -->
      <text
        x="60" y="76"
        text-anchor="middle"
        font-family="DM Sans, sans-serif"
        font-size="9"
        fill="var(--color-text-secondary)"
        letter-spacing="0.06em"
      >{{ unit }}</text>

    </svg>
  `,
  styles: [`
    :host { display: block; }

    .gauge-svg { width: 100%; height: 100%; }

    .gauge-fill-arc {
      transition: stroke-dasharray 250ms ease, stroke 250ms ease;
    }
  `],
})
export class GaugeComponent implements OnChanges {
  @Input({ required: true }) value!:     number | null;
  @Input({ required: true }) threshold!: SensorThreshold;
  @Input() max      = 100;
  @Input() min      = 0;
  @Input() unit     = '%';
  @Input() decimals = 0;

  // SVG circle math:
  // Circumference = 2π × 42 ≈ 263.89
  // 270° arc = (270/360) × 263.89 ≈ 197.92 (visible stroke)
  // 90° gap  = 263.89 - 197.92  ≈ 65.97  (hidden gap)
  private static readonly CIRCUMFERENCE = 2 * Math.PI * 42;
  private static readonly ARC_LENGTH    = GaugeComponent.CIRCUMFERENCE * (270 / 360);
  private static readonly GAP_LENGTH    = GaugeComponent.CIRCUMFERENCE - GaugeComponent.ARC_LENGTH;

  protected trackDash    = `${GaugeComponent.ARC_LENGTH.toFixed(2)} ${GaugeComponent.GAP_LENGTH.toFixed(2)}`;
  protected fillDash     = `0 ${GaugeComponent.CIRCUMFERENCE.toFixed(2)}`;
  protected fillStroke   = 'var(--color-healthy)';
  protected displayValue = '—';

  ngOnChanges(): void {
    if (this.value === null || isNaN(this.value)) {
      this.fillDash     = `0 ${GaugeComponent.CIRCUMFERENCE.toFixed(2)}`;
      this.displayValue = '—';
      return;
    }

    const range   = this.max - this.min;
    const clamped = Math.min(this.max, Math.max(this.min, this.value));
    const pct     = range > 0 ? (clamped - this.min) / range : 0;
    const filled  = GaugeComponent.ARC_LENGTH * pct;
    const gap     = GaugeComponent.CIRCUMFERENCE - filled;

    this.fillDash     = `${filled.toFixed(2)} ${gap.toFixed(2)}`;
    this.displayValue = clamped.toFixed(this.decimals);
    this.fillStroke   = this.deriveColor();
  }

  private deriveColor(): string {
    if (this.value === null) return 'var(--color-healthy)';
    const status: ThresholdStatus = evaluateThreshold(this.value, this.threshold);
    switch (status) {
      case 'critical': return 'var(--color-critical)';
      case 'warning':  return 'var(--color-warning)';
      default:         return 'var(--color-healthy)';
    }
  }
}
