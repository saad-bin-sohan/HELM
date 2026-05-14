import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';
import type { Command, CommandType, CommandAck } from '@helm/models';
import { environment } from '@helm/env';

@Injectable({ providedIn: 'root' })
export class CommandService {
  private readonly http   = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // ── State ──────────────────────────────────────────────
  readonly isDispatching  = signal(false);
  readonly commandHistory = signal<Command[]>([]);

  // ── Public API ─────────────────────────────────────────

  /**
   * Dispatches a command to a vehicle via REST.
   * Returns an Observable that the caller must subscribe to.
   * Loading state is managed internally via signal.
   */
  dispatch(
    vehicleId: string,
    type:      CommandType,
    payload?:  Record<string, unknown>,
  ): Observable<CommandAck> {
    const commandId = uuid();

    this.isDispatching.set(true);

    return this.http
      .post<CommandAck>(`${this.apiUrl}/vehicles/${vehicleId}/commands`, { type, payload })
      .pipe(
        tap((ack) => {
          const command: Command = {
            id:        commandId,
            vehicleId,
            type,
            payload,
            sentAt:    Date.now(),
            status:    ack.status,
          };
          // Prepend to history, cap at 50 entries
          this.commandHistory.update((h) => [command, ...h].slice(0, 50));
        }),
        finalize(() => this.isDispatching.set(false)),
      );
  }

  clearHistory(): void {
    this.commandHistory.set([]);
  }
}
