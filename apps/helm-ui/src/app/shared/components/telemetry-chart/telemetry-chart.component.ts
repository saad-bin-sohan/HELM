import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ElementRef,
  inject,
  PLATFORM_ID,
  afterNextRender,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import type {
  TelemetryFrame,
  AlertableSensorKey,
  SensorThreshold,
} from '@helm/models';
import { DEFAULT_THRESHOLDS } from '@helm/models';

// ── Register Chart.js components once at module level ──
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
);

// ── Channel color mapping (hardcoded hex — Chart.js cannot resolve CSS vars) ──
const CHANNEL_COLORS: Record<AlertableSensorKey, string> = {
  depth:     '#22d3ee',
  battery:   '#4ade80',
  speed:     '#a78bfa',
  thrust:    '#f97316',
  waterTemp: '#fb7185',
  pressure:  '#34d399',
  roll:      '#fbbf24',
  pitch:     '#60a5fa',
};

const CHANNEL_LABELS: Record<AlertableSensorKey, string> = {
  depth:     'Depth (m)',
  speed:     'Speed (kn)',
  battery:   'Battery (%)',
  thrust:    'Thrust (%)',
  waterTemp: 'Temp (°C)',
  pressure:  'Pressure (bar)',
  roll:      'Roll (°)',
  pitch:     'Pitch (°)',
};

@Component({
  selector: 'helm-telemetry-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-container">
      <canvas #chartCanvas></canvas>
    </div>
  `,
  styleUrl: './telemetry-chart.component.scss',
})
export class TelemetryChartComponent implements OnChanges, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser  = isPlatformBrowser(this.platformId);

  @Input() frames:             TelemetryFrame[] = [];
  @Input() channels:           AlertableSensorKey[] = [];
  @Input() thresholds:         Record<AlertableSensorKey, SensorThreshold> = DEFAULT_THRESHOLDS;
  @Input() showThresholdLines = true;
  @Input() animateUpdates     = false;

  private chart: Chart<'line', number[], string> | null = null;

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');

  constructor() {
    afterNextRender(() => {
      this.initChart();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.isBrowser || !this.chart) return;

    if (changes['channels']) {
      this.destroyChart();
      this.initChart();
      return;
    }

    if (changes['frames'] || changes['thresholds'] || changes['showThresholdLines']) {
      this.updateChartData();
    }
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  // ── Chart lifecycle ────────────────────────────────────

  private initChart(): void {
    if (!this.isBrowser) return;

    const canvas = this.canvasRef().nativeElement;
    this.destroyChart();

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: this.animateUpdates ? undefined : false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f2035',
          titleColor: '#e2eaf4',
          bodyColor: '#7a9abf',
          borderColor: '#1e3358',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#7a9abf',
            font: { family: 'JetBrains Mono, monospace', size: 10 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
          grid: {
            color: 'rgba(30, 51, 88, 0.6)',
          },
          border: { color: '#1e3358' },
        },
        y: {
          ticks: {
            color: '#7a9abf',
            font: { family: 'JetBrains Mono, monospace', size: 10 },
          },
          grid: {
            color: 'rgba(30, 51, 88, 0.6)',
          },
          border: { color: '#1e3358' },
        },
      },
    };

    this.chart = new Chart(canvas, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options,
    });

    this.updateChartData();
  }

  private updateChartData(): void {
    if (!this.chart) return;

    this.chart.data.labels   = this.buildLabels();
    this.chart.data.datasets = this.buildDatasets();

    if (this.animateUpdates) {
      this.chart.update();
    } else {
      this.chart.update('none');
    }
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  // ── Data builders ──────────────────────────────────────

  private buildLabels(): string[] {
    return this.frames.map(f => this.formatTimestamp(f.timestamp));
  }

  private buildDatasets(): ChartDataset<'line', number[]>[] {
    const datasets: ChartDataset<'line', number[]>[] = [];

    for (const channel of this.channels) {
      const values = this.frames.map(f => f[channel] as number);

      datasets.push({
        label: CHANNEL_LABELS[channel],
        data: values,
        borderColor: CHANNEL_COLORS[channel],
        backgroundColor: `${CHANNEL_COLORS[channel]}18`,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.3,
      });

      // Threshold lines (flat horizontal dashed datasets)
      if (this.showThresholdLines && this.thresholds[channel]) {
        const threshold = this.thresholds[channel];
        const frameCount = this.frames.length;

        // Warning threshold line
        datasets.push({
          label: `${CHANNEL_LABELS[channel]} Warning`,
          data: Array(frameCount).fill(threshold.warning) as number[],
          borderColor: '#fbbf24',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
        } as ChartDataset<'line', number[]>);

        // Critical threshold line
        datasets.push({
          label: `${CHANNEL_LABELS[channel]} Critical`,
          data: Array(frameCount).fill(threshold.critical) as number[],
          borderColor: '#f87171',
          borderWidth: 1,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false,
          tension: 0,
        } as ChartDataset<'line', number[]>);
      }
    }

    return datasets;
  }

  // ── Helpers ────────────────────────────────────────────

  private formatTimestamp(ts: number): string {
    const d  = new Date(ts);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}
