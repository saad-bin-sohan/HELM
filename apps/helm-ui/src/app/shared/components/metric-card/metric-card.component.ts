import {
  Component, Input, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, signal,
} from '@angular/core';
import { DecimalPipe }    from '@angular/common';
import { GaugeComponent } from '../gauge/gauge.component';
import { SparklineComponent } from '../sparkline/sparkline.component';
import { ThresholdColorDirective } from '../../directives/threshold-color.directive';
import {
  type TelemetryFrame,
  type SensorThreshold,
  type ThresholdStatus,
  type AlertableSensorKey,
  evaluateThreshold,
} from '@helm/models';

export type MetricSensor = AlertableSensorKey | 'heading' | 'yaw';

// Sensor display metadata: label, unit, decimal places, icon name
interface SensorMeta {
  label:    string;
  unit:     string;
  decimals: number;
  icon:     string;
}

const SENSOR_META: Record<MetricSensor, SensorMeta> = {
  depth:     { label: 'DEPTH',      unit: 'm',   decimals: 1, icon: 'arrow-down'    },
  heading:   { label: 'HEADING',    unit: '°',   decimals: 0, icon: 'compass'       },
  speed:     { label: 'SPEED',      unit: 'kn',  decimals: 1, icon: 'gauge'         },
  battery:   { label: 'BATTERY',    unit: '%',   decimals: 0, icon: 'battery'       },
  thrust:    { label: 'THRUST',     unit: '%',   decimals: 0, icon: 'zap'           },
  waterTemp: { label: 'WATER TEMP', unit: '°C',  decimals: 1, icon: 'thermometer'   },
  pressure:  { label: 'PRESSURE',   unit: 'bar', decimals: 2, icon: 'activity'      },
  roll:      { label: 'ROLL',       unit: '°',   decimals: 1, icon: 'rotate-ccw'    },
  pitch:     { label: 'PITCH',      unit: '°',   decimals: 1, icon: 'move-vertical' },
  yaw:       { label: 'YAW',        unit: '°',   decimals: 0, icon: 'rotate-cw'     },
};

@Component({
  selector:        'helm-metric-card',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [DecimalPipe, GaugeComponent, SparklineComponent, ThresholdColorDirective],
  templateUrl:     './metric-card.component.html',
  styleUrl:        './metric-card.component.scss',
})
export class MetricCardComponent implements OnChanges {
  /** Which telemetry field this card displays. */
  @Input({ required: true }) sensor!: MetricSensor;

  /** Current raw sensor value. Null shows "—" placeholder. */
  @Input() value: number | null = null;

  /**
   * Rolling frame buffer (last N frames from TelemetryService.telemetryBuffer$).
   * The component extracts the sparkline values for its own sensor field.
   */
  @Input() frames: TelemetryFrame[] | null = null;

  /**
   * Threshold config for this sensor. If null (e.g. heading), card stays green.
   */
  @Input() threshold: SensorThreshold | null = null;

  /**
   * When true, renders a GaugeComponent instead of the plain numeric value.
   * Use for battery and thrust.
   */
  @Input() showGauge = false;

  // ── Computed display values ────────────────────────────────────────────────
  get meta():            SensorMeta      { return SENSOR_META[this.sensor] ?? SENSOR_META['depth']; }
  get displayValue():    string          { return this.value?.toFixed(this.meta.decimals) ?? '—'; }
  get thresholdStatus(): ThresholdStatus {
    if (this.value === null || !this.threshold) return 'healthy';
    return evaluateThreshold(this.value, this.threshold);
  }

  /** Values extracted from the frame buffer for this sensor's sparkline. */
  get sparklineValues(): number[] {
    return (this.frames ?? [])
      .map(f => f[this.sensor as keyof TelemetryFrame] as number)
      .filter(v => v !== null && !isNaN(v));
  }

  // ── Value-change flash animation ───────────────────────────────────────────
  protected readonly flashActive = signal(false);
  private prevValue: number | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && this.value !== null) {
      if (this.prevValue !== null && this.prevValue !== 0) {
        const delta = Math.abs((this.value - this.prevValue) / this.prevValue);
        if (delta > 0.10) {
          this.triggerFlash();
        }
      }
      this.prevValue = this.value;
    }
  }

  private triggerFlash(): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashActive.set(true);
    this.flashTimer = setTimeout(() => this.flashActive.set(false), 500);
  }
}
