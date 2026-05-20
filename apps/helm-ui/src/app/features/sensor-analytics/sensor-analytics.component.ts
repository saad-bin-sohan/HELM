import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  untracked,
  DestroyRef,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, DecimalPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, interval, Subscription, throttleTime, asyncScheduler } from 'rxjs';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule }       from '@angular/material/slider';
import { MatProgressBarModule }  from '@angular/material/progress-bar';
import { MatTooltipModule }      from '@angular/material/tooltip';
import {
  LucideAngularModule,
  LUCIDE_ICONS,
  LucideIconProvider,
  Activity,
  Download,
  Play,
  Pause,
  SkipBack,
  Gauge,
  Wifi,
  ChevronDown,
} from 'lucide-angular';

import { TelemetryService } from '../../core/services/telemetry.service';
import { MissionService }   from '../../core/services/mission.service';
import { FleetService }     from '../../core/services/fleet.service';
import { TelemetryChartComponent } from '../../shared/components/telemetry-chart/telemetry-chart.component';
import type { TelemetryFrame, AlertableSensorKey } from '@helm/models';

@Component({
  selector: 'helm-sensor-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    DatePipe,
    MatButtonToggleModule,
    MatSliderModule,
    MatProgressBarModule,
    MatTooltipModule,
    LucideAngularModule,
    TelemetryChartComponent,
  ],
  providers: [
    {
      provide:  LUCIDE_ICONS,
      multi:    true,
      useValue: new LucideIconProvider({
        Activity, Download, Play, Pause, SkipBack, Gauge, Wifi, ChevronDown,
      }),
    },
  ],
  templateUrl: './sensor-analytics.component.html',
  styleUrl:    './sensor-analytics.component.scss',
})
export class SensorAnalyticsComponent {
  private readonly telemetryService = inject(TelemetryService);
  private readonly missionService   = inject(MissionService);
  private readonly fleetService     = inject(FleetService);
  private readonly destroyRef       = inject(DestroyRef);
  private readonly platformId       = inject(PLATFORM_ID);
  private readonly isBrowser        = isPlatformBrowser(this.platformId);

  // ── Global vehicle selection (mirrors top-bar, read-only here) ──
  readonly selectedVehicleId = this.fleetService.selectedVehicleId;

  // ── Mode ──
  readonly mode = signal<'realtime' | 'historical'>('realtime');

  // ── Channel selection (max 4 simultaneous) ──
  readonly ALL_CHANNELS: AlertableSensorKey[] = [
    'depth', 'battery', 'speed', 'thrust', 'waterTemp', 'pressure', 'roll', 'pitch',
  ];
  readonly selectedChannels = signal<AlertableSensorKey[]>(['depth', 'battery']);

  // ── Real-time data ──
  private readonly realtimeBuffer$ = toObservable(this.selectedVehicleId).pipe(
    switchMap(id => this.telemetryService.telemetryBuffer$(id, 300)),
    throttleTime(100, asyncScheduler, { leading: true, trailing: true })
  );
  readonly realtimeFrames = toSignal(this.realtimeBuffer$, {
    initialValue: [] as TelemetryFrame[],
  });

  // ── Historical mode ──
  readonly historyRange     = signal<'5m' | '30m' | '1h' | 'mission'>('5m');
  readonly isLoadingHistory = signal(false);
  readonly historicalFrames = signal<TelemetryFrame[]>([]);

  // ── Replay state (historical only) ──
  readonly replayIndex = signal(0);
  readonly isReplaying = signal(false);
  readonly replaySpeed = signal<1 | 2 | 5>(1);

  private replaySubscription: Subscription | null = null;

  // ── Computed: which frames to show (realtime vs historical slice) ──
  readonly displayFrames = computed((): TelemetryFrame[] => {
    if (this.mode() === 'realtime') return this.realtimeFrames();
    const all = this.historicalFrames();
    const idx = this.replayIndex();
    return idx >= all.length - 1 ? all : all.slice(0, idx + 1);
  });

  // ── Channel color mapping (for external legend in template) ──
  readonly CHANNEL_COLORS: Record<AlertableSensorKey, string> = {
    depth:     '#22d3ee',
    battery:   '#4ade80',
    speed:     '#a78bfa',
    thrust:    '#f97316',
    waterTemp: '#fb7185',
    pressure:  '#34d399',
    roll:      '#fbbf24',
    pitch:     '#60a5fa',
  };

  readonly CHANNEL_LABELS: Record<AlertableSensorKey, string> = {
    depth:     'Depth',
    battery:   'Battery',
    speed:     'Speed',
    thrust:    'Thrust',
    waterTemp: 'Temp',
    pressure:  'Pressure',
    roll:      'Roll',
    pitch:     'Pitch',
  };

  // ── Computed: current frame value display (for historical scrubber info) ──
  readonly currentFrameInfo = computed(() => {
    const frames = this.historicalFrames();
    const idx    = this.replayIndex();
    return frames[idx] ?? null;
  });

  readonly replayProgress = computed((): number => {
    const total = this.historicalFrames().length;
    return total > 1 ? (this.replayIndex() / (total - 1)) * 100 : 0;
  });

  constructor() {
    // Reload history when selectedVehicleId changes while in historical mode
    effect(() => {
      this.selectedVehicleId(); // tracked dependency
      if (this.mode() === 'historical') {
        untracked(() => {
          this.stopReplay();
          this.replayIndex.set(0);
          this.loadHistory();
        });
      }
    });
  }

  // ── Channel toggle ──
  isChannelDisabled(channel: AlertableSensorKey): boolean {
    const selected = this.selectedChannels();
    return selected.length >= 4 && !selected.includes(channel);
  }

  toggleChannel(channel: AlertableSensorKey): void {
    this.selectedChannels.update(prev => {
      const idx = prev.indexOf(channel);
      if (idx >= 0) {
        return prev.filter(c => c !== channel);
      }
      if (prev.length < 4) return [...prev, channel];
      return prev;
    });
  }

  // ── Mode switching ──
  onModeChange(newMode: 'realtime' | 'historical'): void {
    this.stopReplay();
    this.mode.set(newMode);
    if (newMode === 'historical') {
      this.loadHistory();
    }
  }

  // ── History range change ──
  onRangeChange(range: '5m' | '30m' | '1h' | 'mission'): void {
    this.historyRange.set(range);
    this.stopReplay();
    this.replayIndex.set(0);
    this.loadHistory();
  }

  // ── Replay controls ──
  toggleReplay(): void {
    if (this.isReplaying()) {
      this.stopReplay();
    } else {
      this.startReplay();
    }
  }

  onReplaySpeedChange(speed: 1 | 2 | 5): void {
    this.replaySpeed.set(speed);
    if (this.isReplaying()) {
      this.stopReplay();
      this.startReplay();
    }
  }

  onScrubberChange(index: number): void {
    this.stopReplay();
    this.replayIndex.set(index);
  }

  resetReplay(): void {
    this.stopReplay();
    this.replayIndex.set(0);
  }

  // ── CSV Export ──
  exportCsv(): void {
    if (!this.isBrowser) return;
    const frames = this.historicalFrames();
    if (frames.length === 0) return;

    const channels = this.selectedChannels();
    const headers  = ['timestamp', 'vehicleId', ...channels];
    const rows     = frames.map(f => {
      const ts     = new Date(f.timestamp).toISOString();
      const values = channels.map(ch => String(f[ch] ?? ''));
      return [ts, f.vehicleId, ...values].join(',');
    });

    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `helm-telemetry-${this.selectedVehicleId()}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Private ──

  private loadHistory(): void {
    if (!this.isBrowser) return;
    const vehicleId = this.selectedVehicleId();
    const range     = this.historyRange();
    const now       = Date.now();

    let limit    = 300;
    let startTs: number | undefined;
    let endTs:   number | undefined;

    switch (range) {
      case '5m':      limit = 300; startTs = now - 5 * 60_000;  endTs = now; break;
      case '30m':     limit = 500; startTs = now - 30 * 60_000; endTs = now; break;
      case '1h':      limit = 500; startTs = now - 60 * 60_000; endTs = now; break;
      case 'mission': limit = 500; break;
    }

    this.isLoadingHistory.set(true);
    this.historicalFrames.set([]);
    this.replayIndex.set(0);

    this.missionService
      .getTelemetryHistory(vehicleId, limit, startTs, endTs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (frames) => {
          this.historicalFrames.set(frames);
          this.replayIndex.set(Math.max(0, frames.length - 1));
          this.isLoadingHistory.set(false);
        },
        error: () => this.isLoadingHistory.set(false),
      });
  }

  private startReplay(): void {
    if (this.replayIndex() >= this.historicalFrames().length - 1) {
      this.replayIndex.set(0);
    }
    this.isReplaying.set(true);
    const intervalMs = Math.floor(250 / this.replaySpeed());
    this.replaySubscription = interval(intervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const current = this.replayIndex();
        const max     = this.historicalFrames().length - 1;
        if (current >= max) {
          this.stopReplay();
        } else {
          this.replayIndex.set(current + 1);
        }
      });
  }

  private stopReplay(): void {
    this.isReplaying.set(false);
    this.replaySubscription?.unsubscribe();
    this.replaySubscription = null;
  }
}
