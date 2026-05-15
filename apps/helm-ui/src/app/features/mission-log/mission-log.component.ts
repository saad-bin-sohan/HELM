import {
  Component, ChangeDetectionStrategy, inject, signal, computed,
  viewChild, PLATFORM_ID, DestroyRef,
} from '@angular/core';
import { isPlatformBrowser, AsyncPipe } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';
import {
  Observable, combineLatest, of, EMPTY, interval,
} from 'rxjs';
import {
  switchMap, map, scan, filter, startWith, catchError,
  shareReplay, take,
} from 'rxjs/operators';
import {
  toSignal, toObservable, takeUntilDestroyed,
} from '@angular/core/rxjs-interop';
import {
  trigger, transition, style, animate,
} from '@angular/animations';

import { FleetService }     from '../../core/services/fleet.service';
import { MissionService }   from '../../core/services/mission.service';
import { TelemetryService } from '../../core/services/telemetry.service';
import { AutoScrollDirective } from '../../shared/directives/auto-scroll.directive';
import { TimeAgoPipe }         from '../../shared/pipes/time-ago.pipe';

import type {
  Mission, MissionEvent, MissionEventType,
} from '@helm/models';

const eventEnterAnimation = trigger('eventEnter', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(-8px)' }),
    animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

@Component({
  selector:        'helm-mission-log',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations:      [eventEnterAnimation],
  imports: [
    AsyncPipe,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSliderModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatProgressBarModule,
    AutoScrollDirective,
    TimeAgoPipe,
  ],
  templateUrl: './mission-log.component.html',
  styleUrl:    './mission-log.component.scss',
})
export class MissionLogComponent {

  private readonly fleetService     = inject(FleetService);
  private readonly missionService   = inject(MissionService);
  private readonly telemetryService = inject(TelemetryService);
  private readonly destroyRef       = inject(DestroyRef);
  private readonly platformId       = inject(PLATFORM_ID);

  readonly mode = signal<'live' | 'historical'>('live');
  readonly selectedMissionId = signal<string | null>(null);
  readonly isLoadingHistory = signal(false);
  readonly historicalEvents = signal<MissionEvent[]>([]);
  readonly filterType = signal<MissionEventType | 'all'>('all');
  readonly showJumpToNow = signal(false);

  readonly replayActive = signal(false);
  readonly replayIndex = signal(0);
  readonly replaySpeed = signal<1 | 2 | 5>(1);

  readonly selectedVehicleId = this.fleetService.selectedVehicleId;

  private readonly activeMission$ = toObservable(this.selectedVehicleId).pipe(
    switchMap((vehicleId) => this.missionService.getActiveMission$(vehicleId)),
    shareReplay(1),
  );

  readonly completedMissions$: Observable<Mission[]> = toObservable(this.selectedVehicleId).pipe(
    switchMap((vehicleId) => this.missionService.getCompletedMissions$(vehicleId)),
    shareReplay(1),
  );

  readonly liveEvents$: Observable<MissionEvent[]> = this.activeMission$.pipe(
    switchMap((mission) => {
      if (!mission) return of([] as MissionEvent[]);

      const prior$ = this.missionService.getMissionLog(mission.id).pipe(
        catchError(() => of([] as MissionEvent[])),
      );

      const live$ = this.telemetryService.events$.pipe(
        filter(
          (e) =>
            e.vehicleId === this.selectedVehicleId() ||
            e.missionId === mission.id,
        ),
        scan((acc: MissionEvent[], e: MissionEvent) => {
          if (acc.some((existing) => existing.id === e.id)) return acc;
          const next = [...acc, e];
          return next.length > 200 ? next.slice(-200) : next;
        }, [] as MissionEvent[]),
        startWith([] as MissionEvent[]),
      );

      return combineLatest([prior$, live$]).pipe(
        map(([prior, live]) => {
          const evtMap = new Map<string, MissionEvent>();
          for (const e of [...prior, ...live]) evtMap.set(e.id, e);
          return Array.from(evtMap.values()).sort(
            (a, b) => a.timestamp - b.timestamp,
          );
        }),
      );
    }),
    shareReplay(1),
  );

  readonly activeMission = toSignal(this.activeMission$, {
    initialValue: undefined as Mission | undefined,
  });

  private readonly liveEventsSignal = toSignal(this.liveEvents$, {
    initialValue: [] as MissionEvent[],
  });

  readonly displayEvents = computed(() => {
    const raw: MissionEvent[] =
      this.mode() === 'live' ? this.liveEventsSignal() : this.historicalEvents();
    const filterVal = this.filterType();
    if (filterVal === 'all') return raw;
    return raw.filter((e) => e.type === filterVal);
  });

  private readonly autoScrollDir = viewChild(AutoScrollDirective);

  constructor() {
    toObservable(this.replayActive)
      .pipe(
        switchMap((active) => {
          if (!active) return EMPTY;
          return toObservable(this.replaySpeed).pipe(
            switchMap((speed) => interval(1000 / speed)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const max = this.displayEvents().length - 1;
        if (max < 0) {
          this.replayActive.set(false);
          return;
        }
        if (this.replayIndex() >= max) {
          this.replayActive.set(false);
          return;
        }
        this.replayIndex.update((i) => i + 1);
      });

    toObservable(this.mode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.replayActive.set(false);
        this.replayIndex.set(0);
        this.historicalEvents.set([]);
        this.selectedMissionId.set(null);
        this.showJumpToNow.set(false);
      });
  }

  onMissionSelected(missionId: string): void {
    this.selectedMissionId.set(missionId);
    this.historicalEvents.set([]);
    this.replayActive.set(false);
    this.replayIndex.set(0);
    this.isLoadingHistory.set(true);

    this.missionService
      .getMissionLog(missionId)
      .pipe(take(1))
      .subscribe({
        next: (events) => {
          const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
          this.historicalEvents.set(sorted);
          this.isLoadingHistory.set(false);
        },
        error: () => {
          this.isLoadingHistory.set(false);
        },
      });
  }

  toggleReplay(): void {
    if (this.replayIndex() >= this.displayEvents().length - 1 && !this.replayActive()) {
      this.replayIndex.set(0);
    }
    this.replayActive.update((v) => !v);
  }

  onScrubberChange(value: number): void {
    this.replayIndex.set(Math.round(value));
  }

  cycleSpeed(): void {
    const speeds: Array<1 | 2 | 5> = [1, 2, 5];
    const current = this.replaySpeed();
    const idx = speeds.indexOf(current);
    this.replaySpeed.set(speeds[(idx + 1) % speeds.length]);
  }

  onScrolledUp(scrolledUp: boolean): void {
    if (this.mode() === 'live') {
      this.showJumpToNow.set(scrolledUp);
    }
  }

  jumpToNow(): void {
    this.autoScrollDir()?.resumeAutoScroll();
    this.showJumpToNow.set(false);
  }

  exportLog(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const data = JSON.stringify(this.displayEvents(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mission-log-${this.selectedMissionId() ?? 'live'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  copyMissionSummary(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const events    = this.displayEvents();
    const vehicleId = this.selectedVehicleId();
    const mission   = this.activeMission();
    const lines = [
      `HELM Mission Log — Export`,
      `Vehicle  : ${vehicleId}`,
      `Mission  : ${mission?.name ?? this.selectedMissionId() ?? 'Live Feed'}`,
      `Mode     : ${this.mode()}`,
      `Events   : ${events.length}`,
      `Exported : ${new Date().toISOString()}`,
      ``,
      ...events.map(
        (e) =>
          `[${new Date(e.timestamp).toISOString()}] ${this.eventTypeLabel(e.type).padEnd(10)} ${this.formatEventDetail(e)}`,
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {
      // Clipboard may be denied — fail silently
    });
  }

  protected eventTypeLabel(type: MissionEventType): string {
    const labels: Record<MissionEventType, string> = {
      telemetry_snapshot:   'TELEMETRY',
      alert_fired:          'ALERT',
      command_sent:         'COMMAND',
      waypoint_reached:     'WAYPOINT',
      mission_state_change: 'STATE',
    };
    return labels[type] ?? type.toUpperCase().replace(/_/g, ' ');
  }

  protected formatEventDetail(event: MissionEvent): string {
    const d = event.data;
    switch (event.type) {
      case 'telemetry_snapshot': {
        const depth   = d['depth']   != null ? `${Number(d['depth']).toFixed(1)}m`   : '—';
        const battery = d['battery'] != null ? `${Number(d['battery']).toFixed(0)}%` : '—';
        const speed   = d['speed']   != null ? `${Number(d['speed']).toFixed(1)} kn` : null;
        return speed
          ? `Depth ${depth} · Battery ${battery} · Speed ${speed}`
          : `Depth ${depth} · Battery ${battery}`;
      }
      case 'alert_fired': {
        const severity = String(d['severity'] ?? 'warning').toUpperCase();
        const sensor   = String(d['sensor']   ?? 'unknown');
        const value    = d['value']   != null ? Number(d['value']).toFixed(1) : '?';
        const thresh   = d['threshold'] != null ? ` (threshold: ${d['threshold']})` : '';
        return `${severity} on ${sensor}: ${value}${thresh}`;
      }
      case 'command_sent': {
        const type    = String(d['commandType'] ?? d['type'] ?? 'unknown');
        const payload = d['payload'] ? ` · ${JSON.stringify(d['payload'])}` : '';
        return `${type}${payload}`;
      }
      case 'waypoint_reached': {
        const idx = d['waypointIndex'] ?? d['index'];
        const lat = d['lat'] != null ? ` at ${Number(d['lat']).toFixed(4)}°N` : '';
        return `Waypoint #${idx ?? '?'} reached${lat}`;
      }
      case 'mission_state_change': {
        const from = d['from'] ? `${d['from']} → ` : '';
        const to   = String(d['to'] ?? d['status'] ?? '?');
        return `${from}${to}`;
      }
      default:
        return JSON.stringify(d).slice(0, 100);
    }
  }

  protected eventSeverityClass(event: MissionEvent): string {
    if (event.type === 'alert_fired') {
      const sev = String(event.data['severity'] ?? 'warning');
      return `severity-${sev}`;
    }
    return '';
  }

  protected readonly filterOptions: Array<{
    value: MissionEventType | 'all';
    label: string;
  }> = [
    { value: 'all',                  label: 'ALL' },
    { value: 'telemetry_snapshot',   label: 'TELEMETRY' },
    { value: 'alert_fired',         label: 'ALERTS' },
    { value: 'command_sent',         label: 'COMMANDS' },
    { value: 'waypoint_reached',     label: 'WAYPOINTS' },
    { value: 'mission_state_change', label: 'STATE' },
  ];
}
