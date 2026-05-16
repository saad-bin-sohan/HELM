import type { AlertableSensorKey } from './telemetry.model';

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
