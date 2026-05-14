export type MissionStatus =
  | 'planned'
  | 'active'
  | 'paused'
  | 'completed'
  | 'aborted';

export interface Waypoint {
  index:         number;
  lat:           number;
  lng:           number;
  targetDepth:   number; // meters
  hoverDuration: number; // seconds
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
  timeout:      number;   // minutes
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
