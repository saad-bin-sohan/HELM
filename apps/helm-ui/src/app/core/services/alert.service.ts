import {
  Injectable, inject, signal, DestroyRef, PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { v4 as uuid } from 'uuid';
import { TelemetryService } from './telemetry.service';
import {
  type Alert, type TelemetryFrame, type AlertSeverity,
  type AlertableSensorKey, type SensorThreshold, type ThresholdStatus,
  DEFAULT_THRESHOLDS, evaluateThreshold,
} from '@helm/models';
import { environment } from '@helm/env';

const ALERTABLE_SENSORS: AlertableSensorKey[] = [
  'depth', 'speed', 'battery', 'thrust', 'waterTemp', 'pressure', 'roll', 'pitch',
];

const SENSOR_LABELS: Record<AlertableSensorKey, string> = {
  depth:     'Depth',
  speed:     'Speed',
  battery:   'Battery',
  thrust:    'Thrust',
  waterTemp: 'Water Temp',
  pressure:  'Pressure',
  roll:      'Roll',
  pitch:     'Pitch',
};

@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly http             = inject(HttpClient);
  private readonly telemetryService = inject(TelemetryService);
  private readonly isBrowser        = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly apiUrl           = environment.apiUrl;
  // Inject DestroyRef explicitly so we can pass it to takeUntilDestroyed()
  // in methods that run outside the constructor injection context.
  private readonly destroyRef       = inject(DestroyRef);

  // ── Alert state ────────────────────────────────────────
  private readonly alertsSubject = new BehaviorSubject<Alert[]>([]);
  readonly alerts$: Observable<Alert[]> = this.alertsSubject.asObservable();

  // Unacknowledged count as a Signal for the badge
  readonly unacknowledgedCount = signal<number>(0);

  // ── Sound mute preference ──────────────────────────────
  readonly soundMuted = signal<boolean>(
    this.isBrowser && localStorage.getItem('helm.sound.muted') === 'true',
  );

  // ── Custom threshold overrides (from Settings page) ────────────────
  private readonly customThresholds = signal<
    Partial<Record<AlertableSensorKey, SensorThreshold>>
  >({});

  // ── Internal tracking (prevent alert storm — one alert per threshold crossing) ──
  // Key format: `${vehicleId}:${sensorKey}` → current ThresholdStatus
  private readonly sensorStates = new Map<string, ThresholdStatus>();
  // Key format: `${vehicleId}:${sensorKey}` → active alert ID (for resolution)
  private readonly activeAlertIds = new Map<string, string>();

  private audioCtx: AudioContext | null = null;

  constructor() {
    // 1. Load server-side pre-seeded alerts (e.g. ROV-02 startup warnings)
    this.http
      .get<Alert[]>(`${this.apiUrl}/alerts`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((serverAlerts) => {
        this.alertsSubject.next(serverAlerts);
        this.syncBadgeCount();

        // Seed sensor states from existing unresolved alerts so we don't
        // re-generate alerts for already-active conditions
        for (const alert of serverAlerts) {
          if (!alert.resolvedAt) {
            const key = this.sensorKey(alert.vehicleId, alert.sensor);
            this.sensorStates.set(key, alert.severity as ThresholdStatus);
            this.activeAlertIds.set(key, alert.id);
          }
        }
      });

    // 2. Subscribe to all events and handle server-injected fault alerts
    this.telemetryService.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.type === 'alert_fired' && event.data['alertId']) {
          this.loadAlertFromServer(event.data['alertId'] as string);
        }
      });

    // 3. Auto-evaluate thresholds for ALL vehicles continuously.
    // This replaces the need for any component to call processFrame() manually.
    this.telemetryService.allVehicleTelemetry$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((frame) => this.processFrame(frame));

    // Bootstrap: restore threshold customizations from localStorage on service init
    if (this.isBrowser) {
      const stored = localStorage.getItem('helm.thresholds');
      if (stored) {
        try {
          this.updateThresholds(JSON.parse(stored) as Record<string, { warning: number; critical: number }>);
        } catch {
          // Ignore corrupt data — fall back to defaults
        }
      }
    }
  }

  // ── Public threshold evaluation API ───────────────────

  /**
   * Process a single telemetry frame.
   * Generates alerts on threshold crossings, resolves on recovery.
   * Called from component layer (MetricCard, Dashboard) via the async pipe.
   */
  processFrame(frame: TelemetryFrame): void {
    for (const sensor of ALERTABLE_SENSORS) {
      const value      = frame[sensor] as number;
      const threshold  = this.getThreshold(sensor);
      const newStatus  = evaluateThreshold(value, threshold);
      const key        = this.sensorKey(frame.vehicleId, sensor);
      const prevStatus = this.sensorStates.get(key) ?? 'healthy';

      if (newStatus === prevStatus) continue;

      this.sensorStates.set(key, newStatus);

      if (newStatus !== 'healthy') {
        this.createAlert(frame, sensor, newStatus as AlertSeverity, value, threshold);
        if (newStatus === 'critical') this.playCriticalBeep();
      } else {
        this.resolveAlert(frame.vehicleId, sensor);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────

  acknowledgeAlert(alertId: string): void {
    const alerts  = this.alertsSubject.getValue();
    const updated = alerts.map((a) =>
      a.id === alertId ? { ...a, acknowledged: true } : a,
    );
    this.alertsSubject.next(updated);
    this.syncBadgeCount();

    // Sync acknowledgment to server (fire-and-forget)
    this.http
      .post<Alert>(`${this.apiUrl}/alerts/${alertId}/acknowledge`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  acknowledgeAll(): void {
    const updated = this.alertsSubject.getValue().map((a) => ({ ...a, acknowledged: true }));
    this.alertsSubject.next(updated);
    this.syncBadgeCount();
  }

  toggleMute(): void {
    this.soundMuted.update((m) => !m);
    if (this.isBrowser) {
      localStorage.setItem('helm.sound.muted', String(this.soundMuted()));
    }
  }

  /**
   * Called by SettingsComponent on every form value change (debounced 500ms).
   * Merges operator from DEFAULT_THRESHOLDS with user-supplied warning/critical values.
   */
  updateThresholds(
    config: Record<string, { warning: number; critical: number }>,
  ): void {
    const thresholds: Partial<Record<AlertableSensorKey, SensorThreshold>> = {};
    for (const [key, vals] of Object.entries(config)) {
      const defaults = DEFAULT_THRESHOLDS[key as AlertableSensorKey];
      if (defaults) {
        thresholds[key as AlertableSensorKey] = {
          ...defaults,
          warning:  vals.warning,
          critical: vals.critical,
        };
      }
    }
    this.customThresholds.set(thresholds);
  }

  getAlertsForVehicle$(vehicleId: string): Observable<Alert[]> {
    return new Observable((observer) => {
      return this.alerts$.subscribe((alerts) =>
        observer.next(alerts.filter((a) => a.vehicleId === vehicleId)),
      );
    });
  }

  // ── Private ────────────────────────────────────────────

  private createAlert(
    frame:     TelemetryFrame,
    sensor:    AlertableSensorKey,
    severity:  AlertSeverity,
    value:     number,
    threshold: SensorThreshold,
  ): void {
    const thresholdValue = severity === 'critical'
      ? threshold.critical
      : threshold.warning;

    const alert: Alert = {
      id:           uuid(),
      vehicleId:    frame.vehicleId,
      sensor,
      severity,
      message:      this.buildMessage(frame.vehicleId, sensor, severity, value, thresholdValue),
      value,
      threshold:    thresholdValue,
      timestamp:    Date.now(),
      resolvedAt:   null,
      acknowledged: false,
    };

    const key = this.sensorKey(frame.vehicleId, sensor);
    this.activeAlertIds.set(key, alert.id);

    this.alertsSubject.next([alert, ...this.alertsSubject.getValue()]);
    this.syncBadgeCount();
  }

  private resolveAlert(vehicleId: string, sensor: AlertableSensorKey): void {
    const key     = this.sensorKey(vehicleId, sensor);
    const alertId = this.activeAlertIds.get(key);
    if (!alertId) return;

    this.activeAlertIds.delete(key);

    const alerts  = this.alertsSubject.getValue();
    const updated = alerts.map((a) =>
      a.id === alertId ? { ...a, resolvedAt: Date.now() } : a,
    );
    this.alertsSubject.next(updated);
    this.syncBadgeCount();
  }

  private loadAlertFromServer(alertId: string): void {
    // Reload full alert list to get the server-generated fault alert
    void alertId; // used as trigger; server returns full list
    this.http
      .get<Alert[]>(`${this.apiUrl}/alerts`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((serverAlerts) => {
        // Merge: keep client-generated alerts, add any new server ones
        const currentIds = new Set(this.alertsSubject.getValue().map((a) => a.id));
        const newAlerts  = serverAlerts.filter((a) => !currentIds.has(a.id));
        if (newAlerts.length > 0) {
          this.alertsSubject.next([...newAlerts, ...this.alertsSubject.getValue()]);
          this.syncBadgeCount();
          if (newAlerts.some((a) => a.severity === 'critical')) {
            this.playCriticalBeep();
          }
        }
      });
  }

  private getThreshold(sensor: AlertableSensorKey): SensorThreshold {
    return this.customThresholds()[sensor] ?? DEFAULT_THRESHOLDS[sensor];
  }

  private buildMessage(
    vehicleId:      string,
    sensor:         AlertableSensorKey,
    severity:       AlertSeverity,
    value:          number,
    thresholdValue: number,
  ): string {
    const label = SENSOR_LABELS[sensor];
    return `${vehicleId.toUpperCase()} — ${label} ${severity}: ${value.toFixed(1)} ` +
           `(threshold: ${thresholdValue})`;
  }

  private sensorKey(vehicleId: string, sensor: AlertableSensorKey): string {
    return `${vehicleId}:${sensor}`;
  }

  private syncBadgeCount(): void {
    const count = this.alertsSubject.getValue().filter(
      (a) => !a.acknowledged && !a.resolvedAt,
    ).length;
    this.unacknowledgedCount.set(count);
  }

  // ── Audio ──────────────────────────────────────────────

  private playCriticalBeep(): void {
    if (this.soundMuted() || !this.isBrowser) return;

    try {
      this.audioCtx ??= new AudioContext();
      const ctx = this.audioCtx;

      // Two-tone beep: 880Hz A5 then 660Hz E5
      [880, 660].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + i * 0.2;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type            = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });
    } catch {
      // Audio unavailable (browser policy, SSR, etc.) — fail silently
    }
  }
}
