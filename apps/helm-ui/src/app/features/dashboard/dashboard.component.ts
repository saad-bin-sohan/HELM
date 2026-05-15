import {
  Component, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import {
  combineLatest, of, type Observable,
} from 'rxjs';
import {
  switchMap, startWith, map, share, filter,
} from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';

// Services
import { FleetService }     from '../../core/services/fleet.service';
import { TelemetryService } from '../../core/services/telemetry.service';
import { MissionService }   from '../../core/services/mission.service';

// Shared components
import { MetricCardComponent }  from '../../shared/components/metric-card/metric-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { SparklineComponent }   from '../../shared/components/sparkline/sparkline.component';
import { OrientationDisplayComponent } from '../../shared/components/orientation-display/orientation-display.component';
import { FleetCardComponent }          from '../../shared/components/fleet-card/fleet-card.component';
import { CommandPanelComponent }        from '../../shared/components/command-panel/command-panel.component';

// Pipes
import { TimeAgoPipe }         from '../../shared/pipes/time-ago.pipe';
import { NauticalUnitsPipe }   from '../../shared/pipes/nautical-units.pipe';
import { MissionDurationPipe } from '../../shared/pipes/mission-duration.pipe';
import { FrameValuesPipe }     from '../../shared/pipes/frame-values.pipe';
import { FleetStatusSortPipe }  from '../../shared/pipes/fleet-status-sort.pipe';
import { RouterLink }           from '@angular/router';

// Models
import {
  type TelemetryFrame, type Vehicle, type Mission,
  type SensorThreshold, type ThresholdOperator,
  DEFAULT_THRESHOLDS,
} from '@helm/models';

/** The combined view-model for the dashboard template. One async pipe drives it all. */
interface DashboardVm {
  vehicle:         Vehicle;
  frame:           TelemetryFrame | null;   // null until first WS frame arrives
  buffer:          TelemetryFrame[];        // last 60 frames for sparklines
  mission:         Mission | undefined;
  plannedMissions: Mission[];
}

/** Heading has no threshold violations — use an Infinity sentinel. */
const NO_THRESHOLD: SensorThreshold = {
  warning:  Infinity,
  critical: Infinity,
  operator: 'gt' as ThresholdOperator,
};

@Component({
  selector:        'helm-dashboard',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    DecimalPipe,
    MetricCardComponent,
    StatusBadgeComponent,
    SparklineComponent,
    OrientationDisplayComponent,
    FleetCardComponent,
    CommandPanelComponent,
    TimeAgoPipe,
    NauticalUnitsPipe,
    MissionDurationPipe,
    FrameValuesPipe,
    FleetStatusSortPipe,
    RouterLink,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl:    './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly fleet     = inject(FleetService);
  protected readonly telemetry = inject(TelemetryService);
  protected readonly missions  = inject(MissionService);

  // Exposed to template for sidebar orientation display + mini fleet panel
  protected readonly latestFrames = this.telemetry.latestFrames;
  protected readonly vehicles$    = this.fleet.vehicles$;

  // ── Expose thresholds to template ──────────────────────────────────────────
  protected readonly thresholds   = DEFAULT_THRESHOLDS;
  protected readonly noThreshold  = NO_THRESHOLD;

  // ── Reactive ID stream (switches when user selects a different vehicle) ─────
  private readonly id$ = toObservable(this.fleet.selectedVehicleId);

  // ── Telemetry buffer for selected vehicle ──────────────────────────────────
  private readonly buffer$: Observable<TelemetryFrame[]> = this.id$.pipe(
    switchMap((id) =>
      id ? this.telemetry.telemetryBuffer$(id, 60) : of([] as TelemetryFrame[]),
    ),
    startWith([] as TelemetryFrame[]),
    share(),
  );

  // ── Active mission for selected vehicle ───────────────────────────────────
  private readonly mission$: Observable<Mission | undefined> = this.id$.pipe(
    switchMap((id): Observable<Mission | undefined> =>
      id ? this.missions.getActiveMission$(id) : of(undefined),
    ),
    startWith<Mission | undefined>(undefined),
  );

  // ── Planned missions for selected vehicle (used by CommandPanel) ──────────
  private readonly plannedMissions$: Observable<Mission[]> = this.id$.pipe(
    switchMap((id): Observable<Mission[]> =>
      id ? this.missions.getPlannedMissions$(id) : of([] as Mission[]),
    ),
    startWith([] as Mission[]),
  );

  // ── Combined view model — single async pipe in template ───────────────────
  readonly vm$: Observable<DashboardVm> = combineLatest({
    vehicle: this.fleet.selectedVehicle$.pipe(
      filter((v): v is Vehicle => v !== undefined),
    ),
    buffer:          this.buffer$,
    mission:         this.mission$,
    plannedMissions: this.plannedMissions$,
  }).pipe(
    map(({ vehicle, buffer, mission, plannedMissions }) => ({
      vehicle,
      buffer,
      mission,
      plannedMissions,
      frame: buffer.length > 0 ? buffer[buffer.length - 1] : null,
    })),
    share(),
  );
}
