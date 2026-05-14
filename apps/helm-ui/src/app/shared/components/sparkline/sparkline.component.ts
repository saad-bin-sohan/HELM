import {
  Component, Input, OnChanges, ChangeDetectionStrategy,
} from '@angular/core';
import {
  type SensorThreshold, type ThresholdStatus, evaluateThreshold,
} from '@helm/models';

/**
 * Inline SVG sparkline with area fill + trailing dot.
 * No chart library — pure SVG path built from raw values.
 * Color reflects the threshold status of the most-recent value.
 *
 * Usage: <helm-sparkline [values]="buffer.map(f => f.depth)" [threshold]="depthThreshold" />
 */
@Component({
  selector:        'helm-sparkline',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + W + ' ' + H"
      preserveAspectRatio="none"
      class="sparkline"
      aria-hidden="true"
    >
      @if (lineD) {
        <!-- Gradient area fill -->
        <defs>
          <linearGradient [id]="gradId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   [attr.stop-color]="color" stop-opacity="0.25" />
            <stop offset="100%" [attr.stop-color]="color" stop-opacity="0.02" />
          </linearGradient>
        </defs>

        <path [attr.d]="areaD"
              [attr.fill]="'url(#' + gradId + ')'" />

        <!-- Line -->
        <path [attr.d]="lineD"
              fill="none"
              [attr.stroke]="color"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round" />

        <!-- Latest-value dot -->
        @if (dotX !== null && dotY !== null) {
          <circle [attr.cx]="dotX"
                  [attr.cy]="dotY"
                  r="2.5"
                  [attr.fill]="color" />
        }
      }
    </svg>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .sparkline { width: 100%; height: 100%; overflow: visible; }
  `],
})
export class SparklineComponent implements OnChanges {
  @Input() values:    number[]                = [];
  @Input() threshold: SensorThreshold | null  = null;

  // Internal dimensions — kept small since preserveAspectRatio handles scaling
  protected readonly W = 120;
  protected readonly H = 32;

  // Unique gradient id so multiple sparklines on the same page don't clash
  protected readonly gradId = `sg-${Math.random().toString(36).slice(2, 7)}`;

  protected lineD: string       = '';
  protected areaD: string       = '';
  protected color: string       = 'var(--color-accent)';
  protected dotX:  number | null = null;
  protected dotY:  number | null = null;

  ngOnChanges(): void {
    this.buildPath();
    this.updateColor();
  }

  private buildPath(): void {
    const vals = this.values;
    if (vals.length < 2) {
      this.lineD = '';
      this.areaD = '';
      this.dotX  = null;
      this.dotY  = null;
      return;
    }

    const PAD  = 3;
    const min  = Math.min(...vals);
    const max  = Math.max(...vals);
    const span = max - min || 1;          // Avoid division by zero
    const h    = this.H - PAD * 2;
    const w    = this.W;
    const n    = vals.length;

    const pts: Array<[number, number]> = vals.map((v, i) => [
      (i / (n - 1)) * w,
      PAD + h - ((v - min) / span) * h,  // Flip: high values = low y (top of chart)
    ]);

    const coordStr = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    this.lineD = `M ${pts.map(coordStr).join(' L ')}`;

    const first = pts[0];
    const last  = pts[n - 1];
    this.areaD  =
      `${this.lineD} L ${last[0].toFixed(1)} ${this.H} L ${first[0].toFixed(1)} ${this.H} Z`;

    this.dotX = last[0];
    this.dotY = last[1];
  }

  private updateColor(): void {
    if (!this.threshold || this.values.length === 0) {
      this.color = 'var(--color-accent)';
      return;
    }

    const latest: number = this.values[this.values.length - 1];
    const status: ThresholdStatus = evaluateThreshold(latest, this.threshold);

    this.color =
      status === 'critical' ? 'var(--color-critical)' :
      status === 'warning'  ? 'var(--color-warning)'  :
      'var(--color-healthy)';
  }
}
