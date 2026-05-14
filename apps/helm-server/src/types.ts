// NOTE: These interfaces mirror apps/helm-ui/src/app/core/models/ exactly.
// In Week 3, extract to libs/shared-types/ as a proper Nx library.
// Until then, keep both in sync manually.

// ─── Vehicle ──────────────────────────────────────────────
export type VehicleType   = 'AUV' | 'ROV' | 'ASV';
export type VehicleStatus = 'idle' | 'active' | 'warning' | 'critical' | 'offline';

export interface Vehicle {
  id:              string;
  name:            string;
  type:            VehicleType;
  status:          VehicleStatus;
  activeMissionId: string | null;
  lastPingAt:      number;
}

// ─── Telemetry ────────────────────────────────────────────
export interface GpsPosition {
  lat: number;
  lng: number;
}

export interface TelemetryFrame {
  vehicleId:       string;
  timestamp:       number;
  depth:           number;   // meters
  heading:         number;   // 0–360°
  speed:           number;   // knots
  battery:         number;   // 0–100%
  thrust:          number;   // 0–100%
  waterTemp:       number;   // Celsius
  pressure:        number;   // bar
  roll:            number;   // degrees (negative = port)
  pitch:           number;   // degrees (negative = nose down)
  yaw:             number;   // degrees
  gps:             GpsPosition | null;
  missionProgress: number | null;
}

export type ThresholdOperator = 'gt' | 'lt' | 'abs-gt';

export interface SensorThreshold {
  warning:  number;
  critical: number;
  operator: ThresholdOperator;
}

export type ThresholdStatus       = 'healthy' | 'warning' | 'critical';
export type AlertableSensorKey    = 'depth' | 'speed' | 'battery' | 'thrust' |
                                    'waterTemp' | 'pressure' | 'roll' | 'pitch';

// ─── Mission ──────────────────────────────────────────────
export type MissionStatus =
  | 'planned' | 'active' | 'paused' | 'completed' | 'aborted';

export interface Waypoint {
  index:         number;
  lat:           number;
  lng:           number;
  targetDepth:   number;
  hoverDuration: number;
}

export interface DepthPoint {
  waypointIndex: number;
  depth:         number;
}

export interface Mission {
  id:           string;
  vehicleId:    string;
  name:         string;
  waypoints:    Waypoint[];
  depthProfile: DepthPoint[];
  maxDepth:     number;
  targetSpeed:  number;
  timeout:      number;
  status:       MissionStatus;
  startedAt:    number | null;
  completedAt:  number | null;
}

export type MissionEventType =
  | 'telemetry_snapshot'
  | 'alert_fired'
  | 'command_sent'
  | 'waypoint_reached'
  | 'mission_state_change';

export interface MissionEvent {
  id:        string;
  missionId: string;
  vehicleId: string;
  type:      MissionEventType;
  timestamp: number;
  data:      Record<string, unknown>;
}

// ─── Alert ────────────────────────────────────────────────
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id:           string;
  vehicleId:    string;
  sensor:       AlertableSensorKey;
  severity:     AlertSeverity;
  message:      string;
  value:        number;
  threshold:    number;
  timestamp:    number;
  resolvedAt:   number | null;
  acknowledged: boolean;
}

// ─── Command ──────────────────────────────────────────────
export type CommandType =
  | 'start_mission' | 'pause' | 'resume' | 'abort'
  | 'return_to_surface' | 'set_heading' | 'set_speed';

export type CommandStatus = 'pending' | 'acknowledged' | 'failed';

export interface Command {
  id:        string;
  vehicleId: string;
  type:      CommandType;
  payload?:  Record<string, unknown>;
  sentAt:    number;
  status:    CommandStatus;
}

export interface CommandAck {
  commandId:  string;
  vehicleId:  string;
  status:     'acknowledged' | 'failed';
  message?:   string;
  timestamp:  number;
}

// ─── WebSocket ────────────────────────────────────────────
export type WsMessageType = 'telemetry' | 'event' | 'command_ack' | 'heartbeat';

export interface WsMessage {
  type:       WsMessageType;
  vehicleId?: string;
  payload:    TelemetryFrame | MissionEvent | CommandAck | null;
  timestamp:  number;
}
