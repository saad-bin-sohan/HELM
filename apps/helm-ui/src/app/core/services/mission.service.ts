import { Injectable, inject, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Mission, MissionEvent, TelemetryFrame } from '@helm/models';
import { environment } from '@helm/env';

@Injectable({ providedIn: 'root' })
export class MissionService {
  private readonly http       = inject(HttpClient);
  private readonly apiUrl     = environment.apiUrl;
  // Explicit DestroyRef so takeUntilDestroyed() works in loadMissions()
  // even when called via refreshMissions() outside injection context.
  private readonly destroyRef = inject(DestroyRef);

  private readonly missionsSubject = new BehaviorSubject<Mission[]>([]);
  readonly missions$: Observable<Mission[]> = this.missionsSubject.asObservable();

  constructor() {
    this.loadMissions();
  }

  // ── Derived streams ────────────────────────────────────

  getMissionsForVehicle$(vehicleId: string): Observable<Mission[]> {
    return this.missions$.pipe(
      map((missions) => missions.filter((m) => m.vehicleId === vehicleId)),
    );
  }

  getActiveMission$(vehicleId: string): Observable<Mission | undefined> {
    return this.getMissionsForVehicle$(vehicleId).pipe(
      map((missions) =>
        missions.find((m) => m.status === 'active' || m.status === 'paused'),
      ),
    );
  }

  getPlannedMissions$(vehicleId: string): Observable<Mission[]> {
    return this.getMissionsForVehicle$(vehicleId).pipe(
      map((missions) => missions.filter((m) => m.status === 'planned')),
    );
  }

  // ── CRUD ───────────────────────────────────────────────

  refreshMissions(): void {
    this.loadMissions();
  }

  createMission(
    partial: Omit<Mission, 'id' | 'status' | 'startedAt' | 'completedAt'>,
  ): Observable<Mission> {
    return this.http.post<Mission>(`${this.apiUrl}/missions`, partial).pipe(
      tap((mission) =>
        this.missionsSubject.next([...this.missionsSubject.getValue(), mission]),
      ),
    );
  }

  updateMission(id: string, partial: Partial<Mission>): Observable<Mission> {
    return this.http.put<Mission>(`${this.apiUrl}/missions/${id}`, partial).pipe(
      tap((updated) => {
        const missions = this.missionsSubject.getValue();
        this.missionsSubject.next(
          missions.map((m) => (m.id === id ? updated : m)),
        );
      }),
    );
  }

  deleteMission(id: string): Observable<{ deleted: boolean; id: string }> {
    return this.http.delete<{ deleted: boolean; id: string }>(
      `${this.apiUrl}/missions/${id}`,
    ).pipe(
      tap(() => {
        const missions = this.missionsSubject.getValue();
        this.missionsSubject.next(missions.filter((m) => m.id !== id));
      }),
    );
  }

  getMissionLog(missionId: string): Observable<MissionEvent[]> {
    return this.http.get<MissionEvent[]>(`${this.apiUrl}/missions/${missionId}/log`);
  }

  getTelemetryHistory(
    vehicleId: string,
    limit      = 60,
    startTs?:  number,
    endTs?:    number,
  ): Observable<TelemetryFrame[]> {
    let url = `${this.apiUrl}/vehicles/${vehicleId}/telemetry?limit=${limit}`;
    if (startTs) url += `&startTs=${startTs}`;
    if (endTs)   url += `&endTs=${endTs}`;
    return this.http.get<TelemetryFrame[]>(url);
  }

  private loadMissions(): void {
    this.http
      .get<Mission[]>(`${this.apiUrl}/missions`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((missions) => this.missionsSubject.next(missions));
  }
}
