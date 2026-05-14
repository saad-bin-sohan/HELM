import type {
  TelemetryFrame, VehicleStatus, SensorThreshold,
  ThresholdStatus, AlertableSensorKey,
} from '../types';

// ─── Sensor thresholds (must stay in sync with Angular DEFAULT_THRESHOLDS) ──
export const SERVER_THRESHOLDS: Record<AlertableSensorKey, SensorThreshold> = {
  depth:     { warning:  50, critical:  80, operator: 'gt'     },
  speed:     { warning:   5, critical:   7, operator: 'gt'     },
  battery:   { warning:  40, critical:  20, operator: 'lt'     },
  thrust:    { warning:  80, critical:  95, operator: 'gt'     },
  waterTemp: { warning:  30, critical:  40, operator: 'gt'     },
  pressure:  { warning:   5, critical:   8, operator: 'gt'     },
  roll:      { warning:  15, critical:  30, operator: 'abs-gt' },
  pitch:     { warning:  15, critical:  30, operator: 'abs-gt' },
};

// ─── Math helpers ─────────────────────────────────────────

/** Constrain value to [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Wrap a heading/bearing to [0, 360). */
export function wrapHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Exponential lerp — moves current toward target at `rate` per frame.
 * rate=0.05 → smooth lag; rate=0.5 → near-instant.
 */
export function lerpToward(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

/**
 * Gaussian-ish random number using Box-Muller approximation.
 * Useful for noise that looks more natural than flat uniform noise.
 */
export function gaussianNoise(sigma: number): number {
  // Simple 3-sample average approximation
  return ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2 * sigma;
}

// ─── Physics calculations ─────────────────────────────────

/**
 * Steps heading toward a target with drift noise.
 * Returns the actual delta applied (used for roll/thrust correlation).
 */
export function stepHeading(
  current:       number,
  targetHeading: number,
  noiseDeg:      number,
  maxCorrection  = 4,
): { newHeading: number; delta: number } {
  // Angular error — take shortest path
  let error = targetHeading - current;
  if (error >  180) error -= 360;
  if (error < -180) error += 360;

  const correction = clamp(error * 0.05, -maxCorrection, maxCorrection);
  const noise      = gaussianNoise(noiseDeg * 0.5);
  const delta      = correction + noise;

  return {
    newHeading: wrapHeading(current + delta),
    delta,
  };
}

/**
 * Convert speed + heading to lat/lng delta per frame.
 * Coordinates are near 58°N — uses appropriate longitude correction.
 */
export function calcGpsStep(
  lat:     number,
  lng:     number,
  heading: number,
  speed:   number,  // knots
): [number, number] {
  // 1 knot ≈ 1.852 km/h = 1.852/111 deg lat/h ≈ 4.63e-6 deg/s at equator
  // At 4Hz: 4.63e-6 / 4 per frame = 1.157e-6 deg·lat per knot per frame
  const DEG_PER_KN_PER_FRAME  = 1.157e-6;
  const LON_CORRECTION        = 1 / Math.cos(lat * (Math.PI / 180)); // ≈ 1.887 at 58°N

  const headingRad = heading * (Math.PI / 180);
  const dlat       = Math.cos(headingRad) * speed * DEG_PER_KN_PER_FRAME;
  const dlng       = Math.sin(headingRad) * speed * DEG_PER_KN_PER_FRAME * LON_CORRECTION;

  return [lat + dlat, lng + dlng];
}

/**
 * Hydrostatic pressure from depth.
 * P = 1 atm (1.013 bar) + ρgh ≈ 1.013 + depth × 0.09807 bar
 */
export function calcPressure(depth: number): number {
  return 1.013 + depth * 0.09807;
}

/**
 * Water temperature from depth.
 * Approximates a thermocline: surface temp drops ~0.3°C per 10m.
 */
export function calcWaterTemp(depth: number, surfaceTemp: number): number {
  return Math.max(2, surfaceTemp - depth * 0.03);
}

// ─── Threshold evaluation ─────────────────────────────────

export function evaluateThreshold(
  value:     number,
  threshold: SensorThreshold,
): ThresholdStatus {
  const exceeds = (v: number, limit: number): boolean => {
    switch (threshold.operator) {
      case 'gt':     return v > limit;
      case 'lt':     return v < limit;
      case 'abs-gt': return Math.abs(v) > limit;
    }
  };
  if (exceeds(value, threshold.critical)) return 'critical';
  if (exceeds(value, threshold.warning))  return 'warning';
  return 'healthy';
}

/**
 * Derive VehicleStatus from current telemetry and whether a mission is active.
 * 'idle' is determined by the caller (mission phase), not here.
 */
export function evaluateVehicleStatus(
  frame:          TelemetryFrame,
  missionActive:  boolean,
): VehicleStatus {
  if (!missionActive) return 'idle';

  const sensors: Array<{ value: number; key: AlertableSensorKey }> = [
    { value: frame.depth,     key: 'depth'     },
    { value: frame.speed,     key: 'speed'     },
    { value: frame.battery,   key: 'battery'   },
    { value: frame.thrust,    key: 'thrust'    },
    { value: frame.waterTemp, key: 'waterTemp' },
    { value: frame.pressure,  key: 'pressure'  },
    { value: frame.roll,      key: 'roll'      },
    { value: frame.pitch,     key: 'pitch'     },
  ];

  let worstStatus: ThresholdStatus = 'healthy';

  for (const { value, key } of sensors) {
    const s = evaluateThreshold(value, SERVER_THRESHOLDS[key]);
    if (s === 'critical') { worstStatus = 'critical'; break; }
    if (s === 'warning')    worstStatus = 'warning';
  }

  if (worstStatus === 'critical') return 'critical';
  if (worstStatus === 'warning')  return 'warning';
  return 'active';
}
