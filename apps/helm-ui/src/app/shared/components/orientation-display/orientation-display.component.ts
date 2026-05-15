import {
  Component, Input, OnChanges, ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  type SensorThreshold, type ThresholdStatus, evaluateThreshold,
} from '@helm/models';

// Thresholds mirror DEFAULT_THRESHOLDS — orientation widget uses same values
const ROLL_THRESH:  SensorThreshold = { warning: 15, critical: 30, operator: 'abs-gt' };
const PITCH_THRESH: SensorThreshold = { warning: 15, critical: 30, operator: 'abs-gt' };

/**
 * CSS 3D orientation display — no WebGL.
 * Shows a top-view AUV wireframe SVG rotated in CSS 3D perspective
 * based on live roll, pitch, and heading values.
 *
 * At 4 Hz frame rate, the 200ms CSS transition gives smooth 60fps-feeling animation.
 *
 * Usage: <helm-orientation-display [roll]="frame.roll" [pitch]="frame.pitch" [yaw]="frame.heading" />
 */
@Component({
  selector:        'helm-orientation-display',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [DecimalPipe],
  template: `
    <div class="orient-container">

      <!-- ── Title row ── -->
      <div class="orient-header">
        <span class="orient-title">ORIENTATION</span>
        @if (hasCritical) {
          <span class="orient-alert orient-critical">CRIT</span>
        } @else if (hasWarning) {
          <span class="orient-alert orient-warning">WARN</span>
        }
      </div>

      <!-- ══════════════════════════════════════════════════
           3D SCENE — CSS perspective container
           The gimbal div rotates in 3D; only the SVG inside it
           transforms. The pitch-hint line is outside the gimbal
           so it doesn't rotate with the body.
           ════════════════════════════════════════════════ -->
      <div class="orient-scene">

        <!-- Pitch horizon hint (stays in world space) -->
        <div class="pitch-hint"
             [style.transform]="'translateY(' + pitchOffsetPx + 'px)'">
          <div class="pitch-line"></div>
        </div>

        <!-- AUV body (rotates in 3D) -->
        <div class="orient-gimbal"
             [style.transform]="gimbalTransform">

          <svg class="auv-svg"
               viewBox="-108 -48 216 96"
               xmlns="http://www.w3.org/2000/svg"
               aria-hidden="true">

            <!-- SVG glow filter for wireframe aesthetic -->
            <defs>
              <filter id="helm-auv-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            <!-- Grid reference (faint, behind hull) -->
            <line x1="-108" y1="0" x2="108" y2="0"
                  stroke="rgba(14,165,233,0.10)" stroke-width="0.7"
                  stroke-dasharray="3,6"/>
            <line x1="0" y1="-48" x2="0" y2="48"
                  stroke="rgba(14,165,233,0.10)" stroke-width="0.7"
                  stroke-dasharray="3,6"/>

            <!-- Station frames (structural ribs — inner detail) -->
            <ellipse cx="-30" cy="0" rx="0.8" ry="16"
                     fill="none" stroke="rgba(14,165,233,0.16)" stroke-width="0.8"/>
            <ellipse cx="0"   cy="0" rx="0.8" ry="18"
                     fill="none" stroke="rgba(14,165,233,0.16)" stroke-width="0.8"/>
            <ellipse cx="30"  cy="0" rx="0.8" ry="17"
                     fill="none" stroke="rgba(14,165,233,0.16)" stroke-width="0.8"/>

            <!-- ── Main pressure hull ── -->
            <ellipse cx="-4" cy="0" rx="72" ry="19"
                     fill="rgba(14,165,233,0.06)"
                     stroke="var(--color-accent)"
                     stroke-width="1.6"
                     filter="url(#helm-auv-glow)"/>

            <!-- ── Nose cone (forward, pointed) ── -->
            <path d="M -76,-15 Q -102,0 -76,15"
                  fill="rgba(14,165,233,0.04)"
                  stroke="var(--color-accent)"
                  stroke-width="1.5"
                  filter="url(#helm-auv-glow)"/>

            <!-- ── Sensor/sonar dome (forward, dashed outline) ── -->
            <ellipse cx="-48" cy="0" rx="14" ry="10"
                     fill="rgba(14,165,233,0.07)"
                     stroke="rgba(14,165,233,0.5)"
                     stroke-width="1"
                     stroke-dasharray="3,2.5"/>

            <!-- ── Thruster / propulsion unit ── -->
            <circle cx="75" cy="0" r="12"
                    fill="rgba(14,165,233,0.06)"
                    stroke="var(--color-accent)"
                    stroke-width="1.5"/>
            <!-- Propeller cross-hair -->
            <line x1="75" y1="-10" x2="75" y2="10"
                  stroke="var(--color-accent)" stroke-width="1"/>
            <line x1="65" y1="0"  x2="85" y2="0"
                  stroke="var(--color-accent)" stroke-width="1"/>
            <!-- Drive shaft -->
            <line x1="63" y1="0" x2="67" y2="0"
                  stroke="var(--color-accent)" stroke-width="2.5"
                  stroke-linecap="round"/>

            <!-- ── Control fins (4) ── -->
            <!-- Dorsal fin (top, larger) -->
            <path d="M 50,-19 L 62,-40 L 71,-19"
                  fill="rgba(14,165,233,0.10)"
                  stroke="var(--color-accent)"
                  stroke-width="1.2"
                  stroke-linejoin="round"/>
            <!-- Ventral fin (bottom) -->
            <path d="M 50,19 L 62,40 L 71,19"
                  fill="rgba(14,165,233,0.10)"
                  stroke="var(--color-accent)"
                  stroke-width="1.2"
                  stroke-linejoin="round"/>
            <!-- Port/starboard stubs (seen from above, foreshortened) -->
            <path d="M 52,-19 Q 48,-26 44,-19"
                  fill="none"
                  stroke="rgba(14,165,233,0.4)"
                  stroke-width="1"/>
            <path d="M 52,19 Q 48,26 44,19"
                  fill="none"
                  stroke="rgba(14,165,233,0.4)"
                  stroke-width="1"/>

          </svg>
        </div><!-- /.orient-gimbal -->

      </div><!-- /.orient-scene -->

      <!-- ══════════════════════════════════════════════════
           COMPASS ROSE — Heading indicator
           ════════════════════════════════════════════════ -->
      <div class="compass-wrap">
        <svg class="compass-rose"
             viewBox="-68 -68 136 78"
             xmlns="http://www.w3.org/2000/svg"
             aria-label="Compass heading indicator">

          <!-- Arc track (semicircle, N through E to W) -->
          <path d="M -60,0 A 60,60 0 0,1 60,0"
                fill="none"
                stroke="var(--color-border)"
                stroke-width="2"
                stroke-linecap="round"/>

          <!-- Cardinal labels -->
          <text x="0"   y="-63" text-anchor="middle" class="crd">N</text>
          <text x="-64" y="6"   text-anchor="middle" class="crd">W</text>
          <text x="64"  y="6"   text-anchor="middle" class="crd">E</text>

          <!-- 45° degree tick marks -->
          <line x1="-42.4" y1="-42.4" x2="-36.4" y2="-36.4"
                stroke="var(--color-border)" stroke-width="1.5"/>
          <line x1="42.4"  y1="-42.4" x2="36.4"  y2="-36.4"
                stroke="var(--color-border)" stroke-width="1.5"/>

          <!-- Heading pointer -->
          <g [attr.transform]="'rotate(' + yaw + ')'">
            <line x1="0" y1="0" x2="0" y2="-54"
                  stroke="var(--color-accent)"
                  stroke-width="2.5"
                  stroke-linecap="round"/>
            <!-- Arrow tip -->
            <polygon points="0,-54 -4,-44 4,-44"
                     fill="var(--color-accent)"/>
          </g>

          <!-- Pivot -->
          <circle cx="0" cy="0" r="4" fill="var(--color-accent)"/>

          <!-- Heading numeric below pivot -->
          <text x="0" y="14" text-anchor="middle" class="hdg-text">
            {{ yaw | number:'1.0-0' }}°
          </text>

        </svg>
      </div>

      <!-- ══════════════════════════════════════════════════
           READOUTS — Roll + Pitch
           ════════════════════════════════════════════════ -->
      <div class="orient-readouts">

        <div class="readout">
          <span class="readout-lbl">ROLL</span>
          <span class="readout-val"
                [class.val-warn]="rollStatus === 'warning'"
                [class.val-crit]="rollStatus === 'critical'">
            {{ roll | number:'1.1-1' }}°
          </span>
        </div>

        <div class="readout-divider"></div>

        <div class="readout">
          <span class="readout-lbl">PITCH</span>
          <span class="readout-val"
                [class.val-warn]="pitchStatus === 'warning'"
                [class.val-crit]="pitchStatus === 'critical'">
            {{ pitch | number:'1.1-1' }}°
          </span>
        </div>

      </div>

    </div><!-- /.orient-container -->
  `,
  styles: [`
    // ── Container ─────────────────────────────────────────
    :host { display: block; height: 100%; }

    .orient-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
      height: 100%;
      padding: 10px 12px 8px;
    }

    // ── Header ────────────────────────────────────────────
    .orient-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .orient-title {
      font-family: var(--font-mono);
      font-size: 0.5625rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--color-text-secondary);
    }

    .orient-alert {
      font-family: var(--font-mono);
      font-size: 0.5rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      padding: 1px 5px;
      border-radius: var(--radius-sm);
    }

    .orient-warning  { color: var(--color-warning);  background: var(--color-warning-dim); }
    .orient-critical { color: var(--color-critical); background: var(--color-critical-dim);
                       animation: helm-pulse-critical 1.1s ease-in-out infinite; }

    // ── 3D Scene ──────────────────────────────────────────
    .orient-scene {
      perspective: 480px;
      perspective-origin: 50% 50%;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      flex-shrink: 0;
      overflow: hidden;
    }

    .orient-gimbal {
      transform-style: preserve-3d;
      transition: transform 200ms cubic-bezier(0.25, 0.1, 0.75, 1);
      width: 100%;
    }

    .auv-svg {
      width: 100%;
      height: auto;
      filter: drop-shadow(0 0 5px rgba(14, 165, 233, 0.28));
    }

    // ── Pitch horizon hint ────────────────────────────────
    .pitch-hint {
      position: absolute;
      left: 8%;
      right: 8%;
      pointer-events: none;
      transition: transform 200ms ease;
      z-index: 1;
    }

    .pitch-line {
      height: 1px;
      background: linear-gradient(
        to right,
        transparent 0%,
        rgba(14, 165, 233, 0.22) 15%,
        rgba(14, 165, 233, 0.22) 85%,
        transparent 100%
      );
    }

    // ── Compass rose ──────────────────────────────────────
    .compass-wrap {
      display: flex;
      justify-content: center;
      flex-shrink: 0;
    }

    .compass-rose {
      width: 130px;
      height: auto;
      overflow: visible;
    }

    .crd {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      fill: var(--color-text-secondary);
      letter-spacing: 0.06em;
    }

    .hdg-text {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      fill: var(--color-text-primary);
    }

    // ── Readouts ──────────────────────────────────────────
    .orient-readouts {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      flex-shrink: 0;
    }

    .readout {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .readout-divider {
      width: 1px;
      height: 26px;
      background: var(--color-border);
    }

    .readout-lbl {
      font-family: var(--font-mono);
      font-size: 0.5rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--color-text-secondary);
    }

    .readout-val {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
      transition: color var(--transition-fast);
    }

    .val-warn { color: var(--color-warning) !important; }
    .val-crit {
      color: var(--color-critical) !important;
      animation: helm-pulse-critical 1.2s ease-in-out infinite;
    }
  `],
})
export class OrientationDisplayComponent implements OnChanges {
  /** Roll angle in degrees. Negative = port roll, Positive = starboard roll. */
  @Input() roll  = 0;

  /** Pitch angle in degrees. Negative = nose down, Positive = nose up. */
  @Input() pitch = 0;

  /** Heading in degrees (0–360, true north). Drives compass pointer. */
  @Input() yaw   = 0;

  protected rollStatus:  ThresholdStatus = 'healthy';
  protected pitchStatus: ThresholdStatus = 'healthy';
  protected hasWarning   = false;
  protected hasCritical  = false;

  get gimbalTransform(): string {
    const p = Math.max(-35, Math.min(35, this.pitch));
    const r = Math.max(-55, Math.min(55, this.roll));
    return `rotateX(${(-p * 1.4).toFixed(1)}deg) rotateZ(${r.toFixed(1)}deg)`;
  }

  get pitchOffsetPx(): number {
    return Math.max(-32, Math.min(32, -this.pitch * 1.1));
  }

  ngOnChanges(): void {
    this.rollStatus  = evaluateThreshold(this.roll,  ROLL_THRESH);
    this.pitchStatus = evaluateThreshold(this.pitch, PITCH_THRESH);
    this.hasWarning  = this.rollStatus === 'warning'  || this.pitchStatus === 'warning';
    this.hasCritical = this.rollStatus === 'critical' || this.pitchStatus === 'critical';
  }
}
