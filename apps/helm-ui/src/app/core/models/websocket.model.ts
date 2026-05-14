import type { TelemetryFrame } from './telemetry.model';
import type { MissionEvent } from './mission.model';
import type { CommandAck } from './command.model';

export type WsMessageType = 'telemetry' | 'event' | 'command_ack' | 'heartbeat';

export interface WsMessage {
  type:       WsMessageType;
  vehicleId?: string;
  payload:    TelemetryFrame | MissionEvent | CommandAck | null;
  timestamp:  number;
}

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface ConnectionState {
  status:         ConnectionStatus;
  since:          number;     // Unix ms when state last changed
  reconnectCount: number;
}
