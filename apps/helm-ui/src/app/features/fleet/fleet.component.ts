import {
  Component, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router }    from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map, startWith }            from 'rxjs/operators';
import { trigger, transition, style, animate } from '@angular/animations';

import { FleetService }     from '../../core/services/fleet.service';
import { TelemetryService } from '../../core/services/telemetry.service';
import { MissionService }   from '../../core/services/mission.service';

import { FleetCardComponent }  from '../../shared/components/fleet-card/fleet-card.component';
import { FleetStatusSortPipe } from '../../shared/pipes/fleet-status-sort.pipe';
import { TimeAgoPipe }         from '../../shared/pipes/time-ago.pipe';

import type { Vehicle, Mission, TelemetryFrame } from '@helm/models';

interface FleetHealth {
  total: number; active: number; warning: number;
  critical: number; idle: number; offline: number;
}

interface FleetVm {
  vehicles:   Vehicle[];
  missionMap: ReadonlyMap<string, Mission>;
  health:     FleetHealth;
}

@Component({
  selector:        'helm-fleet',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [AsyncPipe, FleetCardComponent, FleetStatusSortPipe, TimeAgoPipe],
  animations: [
    trigger('cardSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('220ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'translateY(8px)' })),
      ]),
    ]),
  ],
  templateUrl: './fleet.component.html',
  styleUrl:    './fleet.component.scss',
})
export class FleetComponent {
  private readonly fleet    = inject(FleetService);
  private readonly telemetry = inject(TelemetryService);
  private readonly missions  = inject(MissionService);
  private readonly router    = inject(Router);

  protected readonly selectedId   = this.fleet.selectedVehicleId;
  protected readonly latestFrames = this.telemetry.latestFrames;

  // Map of vehicleId → active/paused mission — avoids N Observable subscriptions in template
  private readonly missionMap$: Observable<ReadonlyMap<string, Mission>> =
    this.missions.missions$.pipe(
      map((missions) => {
        const m = new Map<string, Mission>();
        for (const mission of missions) {
          if ((mission.status === 'active' || mission.status === 'paused')
              && !m.has(mission.vehicleId)) {
            m.set(mission.vehicleId, mission);
          }
        }
        return m as ReadonlyMap<string, Mission>;
      }),
      startWith(new Map<string, Mission>() as ReadonlyMap<string, Mission>),
    );

  // Single combined view-model — one async pipe drives the entire template
  readonly vm$: Observable<FleetVm> = combineLatest({
    vehicles:   this.fleet.vehicles$,
    missionMap: this.missionMap$,
  }).pipe(
    map(({ vehicles, missionMap }) => ({
      vehicles,
      missionMap,
      health: {
        total:    vehicles.length,
        active:   vehicles.filter((v) => v.status === 'active').length,
        warning:  vehicles.filter((v) => v.status === 'warning').length,
        critical: vehicles.filter((v) => v.status === 'critical').length,
        idle:     vehicles.filter((v) => v.status === 'idle').length,
        offline:  vehicles.filter((v) => v.status === 'offline').length,
      },
    })),
  );

  onVehicleSelect(vehicleId: string): void {
    this.fleet.selectVehicle(vehicleId);
    this.router.navigate(['/dashboard']);
  }

  /** Helper for template — avoids null issues with mission map lookup. */
  getMission(map: ReadonlyMap<string, Mission>, vehicleId: string): Mission | undefined {
    return map.get(vehicleId);
  }
}
