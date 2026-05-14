import { Injectable, inject, Signal } from '@angular/core';
import { Observable, filter, map, scan, share, shareReplay } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { WebSocketService } from './websocket.service';
import type { TelemetryFrame, WsMessage, MissionEvent } from '@helm/models';
import { environment } from '@helm/env';

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly ws = inject(WebSocketService);

  // ── Derived streams ────────────────────────────────────

  /** All telemetry messages from all vehicles. */
  readonly allVehicleTelemetry$ = this.ws.messages$.pipe(
    filter((msg): msg is WsMessage & { type: 'telemetry' } => msg.type === 'telemetry'),
    map((msg) => msg.payload as TelemetryFrame),
    share(),
  );

  /** All event messages (alerts, waypoints, state changes) from the server. */
  readonly events$ = this.ws.messages$.pipe(
    filter((msg): msg is WsMessage & { type: 'event' } => msg.type === 'event'),
    map((msg) => msg.payload as MissionEvent),
    share(),
  );

  /**
   * Signal containing a snapshot of the latest frame for every vehicle.
   * Key: vehicleId. Updated on every incoming telemetry frame.
   * Perfect for effects and computed() that need synchronous current values.
   */
  readonly latestFrames: Signal<ReadonlyMap<string, TelemetryFrame>> = toSignal(
    this.allVehicleTelemetry$.pipe(
      scan(
        (acc, frame) => new Map(acc).set(frame.vehicleId, frame),
        new Map<string, TelemetryFrame>(),
      ),
    ),
    { initialValue: new Map<string, TelemetryFrame>() },
  );

  // ── Per-vehicle API ────────────────────────────────────

  /**
   * Hot observable of telemetry frames for a specific vehicle.
   * Shared — multiple subscribers to the same vehicleId share one filter pipe.
   */
  telemetry$(vehicleId: string): Observable<TelemetryFrame> {
    return this.allVehicleTelemetry$.pipe(
      filter((frame) => frame.vehicleId === vehicleId),
      share(),
    );
  }

  /**
   * Rolling buffer of the last N frames for a vehicle.
   * Uses scan() for efficient incremental append + slice.
   * shareReplay(1) so late subscribers get the current buffer immediately.
   */
  telemetryBuffer$(
    vehicleId:  string,
    bufferSize  = environment.telemetryBufferSize,
  ): Observable<TelemetryFrame[]> {
    return this.telemetry$(vehicleId).pipe(
      scan((buf: TelemetryFrame[], frame) => {
        const next = [...buf, frame];
        return next.length > bufferSize ? next.slice(-bufferSize) : next;
      }, []),
      shareReplay(1),
    );
  }
}
