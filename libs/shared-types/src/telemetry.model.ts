export interface GpsPosition {
  lat: number;
  lng: number;
}

export interface TelemetryFrame {
  vehicleId:       string;
  timestamp:       number;  // Unix ms
  depth:           number;  // meters
  heading:         number;  // 0–360°
  speed:           number;  // knots
  battery:         number;  // 0–100%
  thrust:          number;  // 0–100%
  waterTemp:       number;  // Celsius
  pressure:        number;  // bar
  roll:            number;  // degrees, negative = port roll
  pitch:           number;  // degrees, negative = nose down
  yaw:             number;  // degrees
  gps:             GpsPosition | null;
  missionProgress: number | null; // 0–100 if mission active
}

export type ThresholdOperator = 'gt' | 'lt' | 'abs-gt';

export interface SensorThreshold {
  warning:  number;
  critical: number;
  operator: ThresholdOperator;
}

export type AlertableSensorKey = Extract<keyof TelemetryFrame,
  'depth' | 'speed' | 'battery' | 'thrust' | 'waterTemp' | 'pressure' | 'roll' | 'pitch'
>;

export const DEFAULT_THRESHOLDS: Record<AlertableSensorKey, SensorThreshold> = {
  depth:     { warning: 50,  critical: 80,  operator: 'gt'     },
  speed:     { warning: 5,   critical: 7,   operator: 'gt'     },
  battery:   { warning: 40,  critical: 20,  operator: 'lt'     },
  thrust:    { warning: 80,  critical: 95,  operator: 'gt'     },
  waterTemp: { warning: 30,  critical: 40,  operator: 'gt'     },
  pressure:  { warning: 5,   critical: 8,   operator: 'gt'     },
  roll:      { warning: 15,  critical: 30,  operator: 'abs-gt' },
  pitch:     { warning: 15,  critical: 30,  operator: 'abs-gt' },
};

export type ThresholdStatus = 'healthy' | 'warning' | 'critical';

/**
 * Pure function — evaluate where a value falls relative to its thresholds.
 * Used by ThresholdColorDirective, AlertService, MetricCardComponent, and the server physics module.
 */
export function evaluateThreshold(
  value: number,
  threshold: SensorThreshold,
): ThresholdStatus {
  const compare = (v: number, limit: number): boolean => {
    switch (threshold.operator) {
      case 'gt':     return v > limit;
      case 'lt':     return v < limit;
      case 'abs-gt': return Math.abs(v) > limit;
    }
  };

  if (compare(value, threshold.critical)) return 'critical';
  if (compare(value, threshold.warning))  return 'warning';
  return 'healthy';
}
