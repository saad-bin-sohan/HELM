import type {
  Vehicle, TelemetryFrame, Mission, MissionEvent, Alert,
} from './types';

const HISTORY_MAX = 1440; // 6 minutes at 4 Hz — enough for the analytics charts

/**
 * Singleton in-memory data store.
 * All mutations are synchronous (Node.js single-threaded — no locking needed).
 */
export class DataStore {
  private readonly vehicles     = new Map<string, Vehicle>();
  private readonly telemetry    = new Map<string, TelemetryFrame[]>();
  private readonly missions     = new Map<string, Mission>();
  private readonly missionLogs  = new Map<string, MissionEvent[]>();
  private readonly alerts       = new Map<string, Alert>();

  // ─── Vehicles ───────────────────────────────────────────
  upsertVehicle(v: Vehicle): void {
    this.vehicles.set(v.id, { ...v });
  }

  getVehicle(id: string): Vehicle | undefined {
    return this.vehicles.get(id);
  }

  getVehicles(): Vehicle[] {
    return Array.from(this.vehicles.values());
  }

  // ─── Telemetry history ──────────────────────────────────
  pushTelemetry(vehicleId: string, frame: TelemetryFrame): void {
    const buf = this.telemetry.get(vehicleId) ?? [];
    buf.push({ ...frame });
    // Trim to circular buffer size — avoid unbounded memory growth
    if (buf.length > HISTORY_MAX) buf.splice(0, buf.length - HISTORY_MAX);
    this.telemetry.set(vehicleId, buf);
  }

  /**
   * Returns up to `limit` most-recent frames, oldest-first.
   * If `startTs` and `endTs` are provided, filters to that range instead.
   */
  getTelemetryHistory(
    vehicleId:  string,
    limit       = 60,
    startTs?:   number,
    endTs?:     number,
  ): TelemetryFrame[] {
    const buf = this.telemetry.get(vehicleId) ?? [];
    if (startTs !== undefined && endTs !== undefined) {
      return buf.filter(f => f.timestamp >= startTs && f.timestamp <= endTs);
    }
    return buf.slice(-limit);
  }

  // ─── Missions ───────────────────────────────────────────
  upsertMission(m: Mission): void {
    this.missions.set(m.id, { ...m });
  }

  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  getMissions(): Mission[] {
    return Array.from(this.missions.values());
  }

  deleteMission(id: string): boolean {
    return this.missions.delete(id);
  }

  // ─── Mission event log ──────────────────────────────────
  pushMissionEvent(event: MissionEvent): void {
    const log = this.missionLogs.get(event.missionId) ?? [];
    log.push({ ...event });
    this.missionLogs.set(event.missionId, log);
  }

  getMissionLog(missionId: string): MissionEvent[] {
    return this.missionLogs.get(missionId) ?? [];
  }

  // ─── Alerts ─────────────────────────────────────────────
  upsertAlert(a: Alert): void {
    this.alerts.set(a.id, { ...a });
  }

  getAlert(id: string): Alert | undefined {
    return this.alerts.get(id);
  }

  /** Returns up to 100 most-recent alerts, newest-first. */
  getAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
  }
}
