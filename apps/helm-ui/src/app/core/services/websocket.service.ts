import {
  Injectable, signal, inject, PLATFORM_ID, OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, Observable } from 'rxjs';
import { environment } from '@helm/env';
import type { WsMessage, ConnectionState, ConnectionStatus } from '@helm/models';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ── State ──────────────────────────────────────────────
  readonly connectionState = signal<ConnectionState>({
    status:         'connecting',
    since:          Date.now(),
    reconnectCount: 0,
  });

  // ── Observable message stream ──────────────────────────
  // All WS messages flow through this single hot Subject.
  // Services filter the stream for the types they care about.
  private readonly messagesSubject = new Subject<WsMessage>();
  readonly messages$: Observable<WsMessage> = this.messagesSubject.asObservable();

  // ── Internals ──────────────────────────────────────────
  private ws:                WebSocket | null = null;
  private reconnectTimer:    ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer:    ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts  = 0;
  private destroyed          = false;

  private readonly BASE_DELAY_MS = environment.wsReconnectBaseMs;  // 1000
  private readonly MAX_DELAY_MS  = environment.wsReconnectMaxMs;   // 30000
  private readonly HEARTBEAT_TIMEOUT_MS = 10_000;                  // 10s without heartbeat = degraded

  constructor() {
    if (this.isBrowser) {
      this.connect();
    }
  }

  // ── Public API ─────────────────────────────────────────

  connect(): void {
    if (!this.isBrowser || this.destroyed) return;
    this.clearTimers();
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(environment.wsUrl);
      this.ws.onopen    = () => this.handleOpen();
      this.ws.onmessage = (e) => this.handleMessage(e);
      this.ws.onerror   = () => this.handleError();
      this.ws.onclose   = () => this.handleClose();
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearTimers();
    this.ws?.close(1000, 'Client disconnecting');
    this.ws = null;
  }

  get status(): ConnectionStatus {
    return this.connectionState().status;
  }

  // ── WebSocket event handlers ───────────────────────────

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.setStatus('live');
    this.resetHeartbeatTimeout();
    console.log('[WS] Connected →', environment.wsUrl);
  }

  private handleMessage(event: MessageEvent<string>): void {
    try {
      const msg = JSON.parse(event.data) as WsMessage;

      // Heartbeat keeps the connection-alive timeout reset
      if (msg.type === 'heartbeat') {
        this.resetHeartbeatTimeout();
        return; // Don't push heartbeats downstream — no consumer cares
      }

      this.resetHeartbeatTimeout();
      this.messagesSubject.next(msg);
    } catch (err) {
      console.warn('[WS] Malformed message — ignoring:', err);
    }
  }

  private handleError(): void {
    // onerror is always followed by onclose; let onclose drive reconnect
    console.warn('[WS] Socket error');
  }

  private handleClose(): void {
    if (this.destroyed) return;
    this.clearHeartbeatTimer();
    this.scheduleReconnect();
  }

  // ── Reconnect with exponential backoff ─────────────────

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    this.reconnectAttempts++;
    // 1s, 2s, 4s, 8s, 16s — capped at 30s
    const delayMs = Math.min(
      this.BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      this.MAX_DELAY_MS,
    );

    this.connectionState.update((s) => ({
      status:         'reconnecting',
      since:          Date.now(),
      reconnectCount: s.reconnectCount + 1,
    }));

    console.log(`[WS] Reconnecting in ${delayMs}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  // ── Heartbeat timeout ──────────────────────────────────

  private resetHeartbeatTimeout(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      // No heartbeat for HEARTBEAT_TIMEOUT_MS — connection degraded
      if (this.connectionState().status === 'live') {
        this.setStatus('reconnecting');
        console.warn('[WS] Heartbeat timeout — marking connection as degraded');
      }
    }, this.HEARTBEAT_TIMEOUT_MS);
  }

  // ── Helpers ────────────────────────────────────────────

  private setStatus(status: ConnectionStatus): void {
    this.connectionState.update((s) => ({ ...s, status, since: Date.now() }));
  }

  private clearTimers(): void {
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
