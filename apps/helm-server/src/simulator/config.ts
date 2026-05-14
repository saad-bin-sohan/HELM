import type { Mission, Alert, VehicleType } from '../types';

// ─── Simulation constants ─────────────────────────────────
export const FRAME_INTERVAL_MS = 250;           // 4 Hz
export const FAULT_MIN_FRAMES  = 240;           // ~60s minimum between faults
export const FAULT_MAX_FRAMES  = 480;           // ~120s maximum between faults

// Each phase duration in frames
export const IDLE_FRAMES   = 120;              // ~30s idle between missions
export const DESCEND_FRAMES_PER_METER = 2;    // frames to drop 1m
export const CRUISE_FRAMES = 1200;             // ~5 minutes cruising
export const ASCEND_FRAMES = 200;             // ~50s ascent

// ─── VehicleConfig ────────────────────────────────────────
export type MissionPhase = 'idle' | 'descending' | 'cruising' | 'ascending';

export interface VehicleConfig {
  id:              string;
  name:            string;
  type:            VehicleType;

  // Initial GPS (North Sea, south of Shetland)
  initLat:         number;
  initLng:         number;

  // Physics personality — each vehicle feels different
  baseSpeed:       number;   // knots
  speedNoise:      number;   // ± knots per frame
  headingNoise:    number;   // ± degrees per frame random walk
  rollNoise:       number;   // ± degrees per frame
  pitchNoise:      number;   // ± degrees per frame
  depthLerpRate:   number;   // 0–1 lerp toward targetDepth per frame (0=never, 1=instant)
  surfaceTemp:     number;   // °C at surface (waterTemp baseline)

  // Mission characteristics
  missionDepth:    number;   // nominal cruise depth (m)
  isSubsurface:    boolean;  // false → ASV, always near surface

  // Dramatic initial state — vehicles arrive mid-operation
  initBattery:     number;
  initPhase:       MissionPhase;
  initPhaseFrame:  number;   // how far into that phase we start
  initHeading:     number;
  initDepth:       number;
  initActiveMissionId: string | null;

  // How far into the fault cooldown countdown we start (frames)
  initFaultCooldown: number;
}

// ─── Three vehicles with distinct personalities ───────────
export const VEHICLE_CONFIGS: VehicleConfig[] = [
  {
    // ── AUV-01 Nereid: deep-dive workhorse, smooth and methodical ──
    id:             'auv-01',
    name:           'AUV-01 Nereid',
    type:           'AUV',
    initLat:         58.2341,
    initLng:          1.4523,
    baseSpeed:        3.2,
    speedNoise:       0.22,
    headingNoise:     1.4,
    rollNoise:        1.6,
    pitchNoise:       1.1,
    depthLerpRate:    0.016,
    surfaceTemp:      12.0,
    missionDepth:     46,
    isSubsurface:     true,
    initBattery:      82.4,
    initPhase:        'cruising',
    initPhaseFrame:   320,     // well into cruise — data immediately interesting
    initHeading:      127,
    initDepth:        43.8,
    initActiveMissionId: 'mission-alpha-1',
    initFaultCooldown:   180,  // first fault in ~45s
  },
  {
    // ── ROV-02 Triton: cable-operated, erratic, already in trouble ──
    id:             'rov-02',
    name:           'ROV-02 Triton',
    type:           'ROV',
    initLat:         58.2298,
    initLng:          1.4612,
    baseSpeed:        1.5,
    speedNoise:       0.18,
    headingNoise:     2.8,    // cable drag → erratic heading
    rollNoise:        3.8,    // cable tension → high roll noise
    pitchNoise:       2.6,
    depthLerpRate:    0.010,
    surfaceTemp:      11.5,
    missionDepth:     53,     // > 50m → depth WARNING from frame 1
    isSubsurface:     true,
    initBattery:      28.2,   // < 40% → battery WARNING from frame 1
    initPhase:        'cruising',
    initPhaseFrame:   600,
    initHeading:      285,
    initDepth:        52.9,   // just over 50m warning threshold
    initActiveMissionId: 'mission-triton-1',
    initFaultCooldown:   300,  // first fault in ~75s
  },
  {
    // ── ASV-03 Horizon: fast surface patrol, wave-tossed ──
    id:             'asv-03',
    name:           'ASV-03 Horizon',
    type:           'ASV',
    initLat:         58.2412,
    initLng:          1.4401,
    baseSpeed:        4.8,
    speedNoise:       0.42,
    headingNoise:     2.1,
    rollNoise:        5.8,    // wave motion → high roll noise for surface vessel
    pitchNoise:       3.6,
    depthLerpRate:    0.0,    // N/A — surface vessel
    surfaceTemp:      12.2,
    missionDepth:     0.3,    // stays at surface
    isSubsurface:     false,
    initBattery:      91.2,
    initPhase:        'cruising',
    initPhaseFrame:   900,
    initHeading:      45,
    initDepth:        0.3,
    initActiveMissionId: 'mission-horizon-1',
    initFaultCooldown:   390,  // first fault in ~97s
  },
];

// ─── Seed missions ────────────────────────────────────────
// Active missions reflect vehicles already mid-operation.
// startedAt offsets are relative to server startup (Date.now()).
export function buildInitialMissions(): Mission[] {
  const now = Date.now();
  return [
    {
      id: 'mission-alpha-1',
      vehicleId: 'auv-01',
      name: 'Alpha Survey Grid',
      waypoints: [
        { index: 0, lat: 58.2341, lng: 1.4523, targetDepth: 44, hoverDuration: 30 },
        { index: 1, lat: 58.2380, lng: 1.4620, targetDepth: 51, hoverDuration: 45 },
        { index: 2, lat: 58.2418, lng: 1.4710, targetDepth: 47, hoverDuration: 30 },
        { index: 3, lat: 58.2380, lng: 1.4790, targetDepth: 40, hoverDuration: 0  },
      ],
      depthProfile: [
        { waypointIndex: 0, depth: 44 },
        { waypointIndex: 1, depth: 51 },
        { waypointIndex: 2, depth: 47 },
        { waypointIndex: 3, depth: 40 },
      ],
      maxDepth: 80,
      targetSpeed: 3.2,
      timeout: 120,
      status: 'active',
      startedAt: now - 8 * 60 * 1000,
      completedAt: null,
    },
    {
      id: 'mission-triton-1',
      vehicleId: 'rov-02',
      name: 'Platform Inspection Run',
      waypoints: [
        { index: 0, lat: 58.2298, lng: 1.4612, targetDepth: 50, hoverDuration: 60  },
        { index: 1, lat: 58.2312, lng: 1.4655, targetDepth: 56, hoverDuration: 120 },
        { index: 2, lat: 58.2277, lng: 1.4580, targetDepth: 52, hoverDuration: 90  },
      ],
      depthProfile: [
        { waypointIndex: 0, depth: 50 },
        { waypointIndex: 1, depth: 56 },
        { waypointIndex: 2, depth: 52 },
      ],
      maxDepth: 80,
      targetSpeed: 1.5,
      timeout: 90,
      status: 'active',
      startedAt: now - 5 * 60 * 1000,
      completedAt: null,
    },
    {
      id: 'mission-horizon-1',
      vehicleId: 'asv-03',
      name: 'Surface Patrol Alpha',
      waypoints: [
        { index: 0, lat: 58.2412, lng: 1.4401, targetDepth: 0, hoverDuration: 0 },
        { index: 1, lat: 58.2490, lng: 1.4530, targetDepth: 0, hoverDuration: 0 },
        { index: 2, lat: 58.2558, lng: 1.4380, targetDepth: 0, hoverDuration: 0 },
        { index: 3, lat: 58.2492, lng: 1.4245, targetDepth: 0, hoverDuration: 0 },
        { index: 4, lat: 58.2412, lng: 1.4310, targetDepth: 0, hoverDuration: 0 },
      ],
      depthProfile: [],
      maxDepth: 1,
      targetSpeed: 4.8,
      timeout: 60,
      status: 'active',
      startedAt: now - 15 * 60 * 1000,
      completedAt: null,
    },
    // ── Planned missions (not yet dispatched) ─────────────
    {
      id: 'mission-alpha-2',
      vehicleId: 'auv-01',
      name: 'Beta Deep Survey',
      waypoints: [
        { index: 0, lat: 58.2500, lng: 1.4600, targetDepth: 68, hoverDuration: 60 },
        { index: 1, lat: 58.2550, lng: 1.4720, targetDepth: 74, hoverDuration: 90 },
        { index: 2, lat: 58.2490, lng: 1.4820, targetDepth: 70, hoverDuration: 45 },
      ],
      depthProfile: [
        { waypointIndex: 0, depth: 68 },
        { waypointIndex: 1, depth: 74 },
        { waypointIndex: 2, depth: 70 },
      ],
      maxDepth: 80,
      targetSpeed: 2.8,
      timeout: 180,
      status: 'planned',
      startedAt: null,
      completedAt: null,
    },
    {
      id: 'mission-triton-2',
      vehicleId: 'rov-02',
      name: 'Flare Stack Inspection',
      waypoints: [
        { index: 0, lat: 58.2320, lng: 1.4700, targetDepth: 61, hoverDuration: 180 },
        { index: 1, lat: 58.2295, lng: 1.4740, targetDepth: 58, hoverDuration: 120 },
      ],
      depthProfile: [
        { waypointIndex: 0, depth: 61 },
        { waypointIndex: 1, depth: 58 },
      ],
      maxDepth: 80,
      targetSpeed: 1.0,
      timeout: 120,
      status: 'planned',
      startedAt: null,
      completedAt: null,
    },
  ];
}

// ─── Seed alerts ──────────────────────────────────────────
// ROV-02 starts in a dire state — two pre-existing unacknowledged alerts.
export function buildInitialAlerts(): Alert[] {
  const now = Date.now();
  return [
    {
      id: 'alert-init-bat-rov',
      vehicleId:    'rov-02',
      sensor:       'battery',
      severity:     'warning',
      message:      'ROV-02 battery below 40% — consider mission recall',
      value:        28.2,
      threshold:    40,
      timestamp:    now - 3 * 60 * 1000,
      resolvedAt:   null,
      acknowledged: false,
    },
    {
      id: 'alert-init-depth-rov',
      vehicleId:    'rov-02',
      sensor:       'depth',
      severity:     'warning',
      message:      'ROV-02 exceeded 50m depth warning threshold',
      value:        52.9,
      threshold:    50,
      timestamp:    now - 2.5 * 60 * 1000,
      resolvedAt:   null,
      acknowledged: false,
    },
  ];
}
