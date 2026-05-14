import {
  Injectable, inject, signal, computed, effect, untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs/operators';
import { TelemetryService } from './telemetry.service';
import {
  type Vehicle, type VehicleStatus, type TelemetryFrame,
  type AlertableSensorKey, DEFAULT_THRESHOLDS, evaluateThreshold,
} from '@helm/models';
import { environment } from '@helm/env';

// ── Pure status derivation (module-level, no injection needed) ──
const ALERTABLE_SENSORS: AlertableSensorKey[] = [
  'depth', 'speed', 'battery', 'thrust', 'waterTemp', 'pressure', 'roll', 'pitch',
];

function deriveStatus(frame: TelemetryFrame, hasMission: boolean): VehicleStatus {
  if (!hasMission) return 'idle';

  let hasCritical = false;
  let hasWarning  = false;

  for (const key of ALERTABLE_SENSORS) {
    const result = evaluateThreshold(frame[key] as number, DEFAULT_THRESHOLDS[key]);
    if (result === 'critical') { hasCritical = true; break; }
    if (result === 'warning')    hasWarning = true;
  }

  return hasCritical ? 'critical' : hasWarning ? 'warning' : 'active';
}

@Injectable({ providedIn: 'root' })
export class FleetService {
  private readonly http             = inject(HttpClient);
  private readonly telemetryService = inject(TelemetryService);
  private readonly apiUrl           = environment.apiUrl;

  // ── State ──────────────────────────────────────────────
  private readonly vehiclesSubject = new BehaviorSubject<Vehicle[]>([]);

  /** All vehicles as an Observable — compatible with async pipe. */
  readonly vehicles$: Observable<Vehicle[]> = this.vehiclesSubject.asObservable();

  /** Currently selected vehicle ID. Defaults to first vehicle once loaded. */
  readonly selectedVehicleId = signal<string>('');

  // ── Computed derivations ───────────────────────────────
  readonly selectedVehicle$: Observable<Vehicle | undefined> = toObservable(
    this.selectedVehicleId,
  ).pipe(
    switchMap((id) =>
      this.vehicles$.pipe(map((vehicles) => vehicles.find((v) => v.id === id))),
    ),
  );

  /**
   * Fleet health summary — recomputed whenever vehicles$ emits.
   * Used by the fleet panel header bar.
   */
  readonly healthSummary = computed(() => {
    const vehicles = this.vehiclesSubject.getValue();
    return {
      total:    vehicles.length,
      active:   vehicles.filter((v) => v.status === 'active').length,
      warning:  vehicles.filter((v) => v.status === 'warning').length,
      critical: vehicles.filter((v) => v.status === 'critical').length,
      idle:     vehicles.filter((v) => v.status === 'idle').length,
      offline:  vehicles.filter((v) => v.status === 'offline').length,
    };
  });

  constructor() {
    // 1. Load initial vehicle list from REST
    this.http
      .get<Vehicle[]>(`${this.apiUrl}/vehicles`)
      .pipe(takeUntilDestroyed())
      .subscribe((vehicles) => {
        this.vehiclesSubject.next(vehicles);
        // Default selection: first vehicle
        if (!this.selectedVehicleId() && vehicles.length > 0) {
          this.selectedVehicleId.set(vehicles[0].id);
        }
      });

    // 2. Reactively update vehicle statuses from telemetry frames (via Signal effect)
    effect(() => {
      const frames = this.telemetryService.latestFrames(); // tracked dependency

      untracked(() => {
        const vehicles = this.vehiclesSubject.getValue();
        if (vehicles.length === 0) return;

        let changed = false;
        const updated = vehicles.map((v) => {
          const frame = frames.get(v.id);
          if (!frame) return v;

          const newStatus: VehicleStatus = deriveStatus(frame, v.activeMissionId !== null);
          const newPing                  = frame.timestamp;

          if (newStatus === v.status && newPing === v.lastPingAt) return v;
          changed = true;
          return { ...v, status: newStatus, lastPingAt: newPing };
        });

        if (changed) this.vehiclesSubject.next(updated);
      });
    });

    // 3. Offline detection — poll every 5s for vehicles whose last ping is stale
    // (Frames stop arriving during signal_loss fault, so the effect above won't fire)
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.checkOfflineVehicles());
  }

  // ── Public API ─────────────────────────────────────────

  selectVehicle(id: string): void {
    this.selectedVehicleId.set(id);
  }

  getVehicles(): Vehicle[] {
    return this.vehiclesSubject.getValue();
  }

  // ── Private ────────────────────────────────────────────

  private checkOfflineVehicles(): void {
    const OFFLINE_THRESHOLD_MS = 15_000;
    const now      = Date.now();
    const vehicles = this.vehiclesSubject.getValue();
    const frames   = this.telemetryService.latestFrames();

    let changed = false;
    const updated = vehicles.map((v) => {
      const lastFrame   = frames.get(v.id);
      const lastContact = lastFrame?.timestamp ?? v.lastPingAt;

      if (now - lastContact > OFFLINE_THRESHOLD_MS && v.status !== 'offline') {
        changed = true;
        return { ...v, status: 'offline' as VehicleStatus };
      }
      return v;
    });

    if (changed) this.vehiclesSubject.next(updated);
  }
}
