import { v4 as uuid } from 'uuid';
import type {
  Vehicle, TelemetryFrame, Mission, Alert,
  Command, CommandAck, WsMessage, AlertableSensorKey, AlertSeverity,
} from '../types';
import type { DataStore } from '../data-store';
import {
  VEHICLE_CONFIGS, FAULT_MIN_FRAMES, FAULT_MAX_FRAMES,
  CRUISE_FRAMES, IDLE_FRAMES, type MissionPhase, type VehicleConfig,
} from './config';
import * as physics from './physics';

// ─── Fault system ─────────────────────────────────────────

type FaultType =
  | 'battery_drop'
  | 'depth_overshoot'
  | 'thruster_spike'
  | 'signal_loss';

interface ActiveFault {
  type:       FaultType;
  framesLeft: number;
}

// ─── Per-vehicle simulation state ─────────────────────────

interface SimVehicleState {
  config:        VehicleConfig;
  vehicle:       Vehicle;
  telemetry:     TelemetryFrame;

  // Mission phase state machine
  missionPhase:         MissionPhase;
  phaseFrameCounter:    number;
  targetDepth:          number;
  targetSpeed:          number;
  targetHeading:        number;
  missionProgress:      number;   // 0–100
  currentWaypointIndex: number;

  // Last heading delta — used for thrust/roll correlation
  lastHeadingDelta: number;

  // Fault system
  activeFault:         ActiveFault | null;
  faultCooldownFrames: number;

  // GPS tracking (persists between frames)
  gpsLat: number;
  gpsLng: number;
}

// ─── Engine ───────────────────────────────────────────────

export class SimulatorEngine {
  private readonly states = new Map<string, SimVehicleState>();
  private frameCount = 0;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store:       DataStore,
    private readonly broadcastFn: (msg: WsMessage) => void,
  ) {}

  // ── Initialization ──────────────────────────────────────

  initialize(): void {
    for (const config of VEHICLE_CONFIGS) {
      const vehicle: Vehicle = {
        id:              config.id,
        name:            config.name,
        type:            config.type,
        status:          config.initPhase === 'idle' ? 'idle' : 'active',
        activeMissionId: config.initActiveMissionId,
        lastPingAt:      Date.now(),
      };

      const telemetry: TelemetryFrame = {
        vehicleId:       config.id,
        timestamp:       Date.now(),
        depth:           config.initDepth,
        heading:         config.initHeading,
        speed:           config.baseSpeed * (config.initPhase === 'idle' ? 0 : 0.9),
        battery:         config.initBattery,
        thrust:          config.initPhase === 'idle' ? 0 : 55 + Math.random() * 15,
        waterTemp:       physics.calcWaterTemp(config.initDepth, config.surfaceTemp),
        pressure:        physics.calcPressure(config.initDepth),
        roll:            (Math.random() - 0.5) * config.rollNoise * 2,
        pitch:           (Math.random() - 0.5) * config.pitchNoise * 2,
        yaw:             config.initHeading,
        gps:             config.isSubsurface && config.initDepth >= 2
                           ? null
                           : { lat: config.initLat, lng: config.initLng },
        missionProgress: config.initPhase === 'cruising'
                           ? Math.round((config.initPhaseFrame / CRUISE_FRAMES) * 70 + 10)
                           : null,
      };

      const state: SimVehicleState = {
        config,
        vehicle,
        telemetry,
        missionPhase:         config.initPhase,
        phaseFrameCounter:    config.initPhaseFrame,
        targetDepth:          config.initDepth,
        targetSpeed:          config.baseSpeed,
        targetHeading:        config.initHeading + (Math.random() - 0.5) * 20,
        missionProgress:      telemetry.missionProgress ?? 0,
        currentWaypointIndex: 0,
        lastHeadingDelta:     0,
        activeFault:          null,
        faultCooldownFrames:  config.initFaultCooldown,
        gpsLat:               config.initLat,
        gpsLng:               config.initLng,
      };

      this.states.set(config.id, state);
      this.store.upsertVehicle(vehicle);
      this.store.pushTelemetry(config.id, { ...telemetry });

      console.log(
        `[Engine] Initialized ${config.name} | phase: ${config.initPhase} ` +
        `| battery: ${config.initBattery}% | depth: ${config.initDepth}m`
      );
    }
  }

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => this.tick(), 250); // 4 Hz
    console.log('[Engine] Simulation started at 4 Hz');
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ── Main simulation tick ────────────────────────────────

  private tick(): void {
    this.frameCount++;

    for (const [, state] of this.states) {
      // ── Offline fault: skip physics, just tick the countdown ──
      if (state.activeFault?.type === 'signal_loss') {
        state.activeFault.framesLeft--;
        if (state.activeFault.framesLeft <= 0) {
          state.activeFault          = null;
          state.vehicle.status       = 'active';
          state.vehicle.lastPingAt   = Date.now();
          this.store.upsertVehicle({ ...state.vehicle });
          this.emitEvent(state, 'mission_state_change', {
            message: 'Vehicle signal restored',
            prevStatus: 'offline',
          });
          console.log(`[Engine] ${state.vehicle.name} signal restored`);
        }
        continue; // No telemetry while offline
      }

      // ── Normal tick ───────────────────────────────────────
      this.updateMissionPhase(state);
      this.updatePhysics(state);

      // Tick any non-offline active fault
      if (state.activeFault) this.tickActiveFault(state);

      // Check whether to trigger next fault
      this.checkFaultInjection(state);

      // Sync to store and broadcast
      this.store.upsertVehicle({ ...state.vehicle });
      this.store.pushTelemetry(state.vehicle.id, { ...state.telemetry });
      this.broadcastFn({
        type:      'telemetry',
        vehicleId: state.vehicle.id,
        payload:   { ...state.telemetry },
        timestamp: Date.now(),
      });
    }

    // Heartbeat every 2 s (8 frames)
    if (this.frameCount % 8 === 0) {
      this.broadcastFn({ type: 'heartbeat', payload: null, timestamp: Date.now() });
    }
  }

  // ── Mission phase state machine ─────────────────────────

  private updateMissionPhase(state: SimVehicleState): void {
    state.phaseFrameCounter++;

    switch (state.missionPhase) {
      case 'idle':
        state.targetDepth  = 0;
        state.targetSpeed  = 0;
        state.telemetry.missionProgress = null;

        if (state.phaseFrameCounter >= IDLE_FRAMES) {
          // Begin next mission cycle
          state.missionPhase       = 'descending';
          state.phaseFrameCounter  = 0;
          state.targetDepth        = state.config.missionDepth;
          state.targetSpeed        = state.config.baseSpeed;
          state.targetHeading      = physics.wrapHeading(
            state.telemetry.heading + 90 + (Math.random() - 0.5) * 60
          );
          state.missionProgress    = 0;
          this.emitEvent(state, 'mission_state_change', { message: 'Mission cycle started', phase: 'descending' });
        }
        break;

      case 'descending':
        state.targetDepth = state.config.missionDepth;
        state.targetSpeed = state.config.baseSpeed * 0.65;
        state.missionProgress = physics.clamp(
          (state.telemetry.depth / state.config.missionDepth) * 10, 0, 10
        );
        state.telemetry.missionProgress = Math.round(state.missionProgress);

        if (state.telemetry.depth >= state.config.missionDepth * 0.90) {
          state.missionPhase      = 'cruising';
          state.phaseFrameCounter = 0;
          state.targetSpeed       = state.config.baseSpeed;
          this.emitEvent(state, 'mission_state_change', { message: 'Reached cruise depth', phase: 'cruising' });
        }
        break;

      case 'cruising': {
        // Simulate waypoint progression — reach a new waypoint every ~45 seconds
        const waypointPeriod    = 180; // frames
        const waypointsPassed   = Math.floor(state.phaseFrameCounter / waypointPeriod);
        const frameInWaypoint   = state.phaseFrameCounter % waypointPeriod;

        if (frameInWaypoint === 1 && waypointsPassed > state.currentWaypointIndex) {
          state.currentWaypointIndex = waypointsPassed;
          // Vary heading and depth for each "waypoint"
          state.targetHeading = physics.wrapHeading(
            state.targetHeading + 80 + (Math.random() - 0.5) * 40
          );
          const depthVariation = (Math.random() - 0.5) * 12;
          state.targetDepth = physics.clamp(
            state.config.missionDepth + depthVariation, 5, state.config.missionDepth + 15
          );
          this.emitEvent(state, 'waypoint_reached', {
            waypointIndex: state.currentWaypointIndex,
            depth: state.telemetry.depth,
          });
        }

        state.missionProgress = physics.clamp(
          10 + (state.phaseFrameCounter / CRUISE_FRAMES) * 80, 10, 90
        );
        state.telemetry.missionProgress = Math.round(state.missionProgress);

        if (state.phaseFrameCounter >= CRUISE_FRAMES) {
          state.missionPhase       = 'ascending';
          state.phaseFrameCounter  = 0;
          state.targetDepth        = 0;
          state.targetSpeed        = state.config.baseSpeed * 0.55;
          this.emitEvent(state, 'mission_state_change', { message: 'Ascending to surface', phase: 'ascending' });
        }
        break;
      }

      case 'ascending':
        state.targetDepth = 0;
        state.targetSpeed = state.config.baseSpeed * 0.55;
        state.missionProgress = physics.clamp(
          90 + (state.phaseFrameCounter / 200) * 10, 90, 100
        );
        state.telemetry.missionProgress = Math.round(state.missionProgress);

        if (!state.config.isSubsurface || state.telemetry.depth < 2) {
          state.missionPhase       = 'idle';
          state.phaseFrameCounter  = 0;
          state.missionProgress    = 0;
          state.currentWaypointIndex = 0;
          this.emitEvent(state, 'mission_state_change', { message: 'Mission complete', phase: 'idle' });
        }
        break;
    }
  }

  // ── Physics update ──────────────────────────────────────

  private updatePhysics(state: SimVehicleState): void {
    const cfg = state.config;
    const t   = state.telemetry;

    // 1. Heading — random walk toward target
    const { newHeading, delta } = physics.stepHeading(
      t.heading, state.targetHeading, cfg.headingNoise
    );
    t.heading            = newHeading;
    t.yaw                = newHeading;
    state.lastHeadingDelta = delta;

    // 2. Speed
    t.speed = physics.clamp(
      physics.lerpToward(t.speed, state.targetSpeed, 0.06)
        + physics.gaussianNoise(cfg.speedNoise * 0.4),
      0, 12
    );

    // 3. Depth (surface vessels stay near 0)
    if (!cfg.isSubsurface) {
      t.depth = 0.2 + Math.random() * 0.25; // Wave bob
    } else {
      const depthNoise = physics.gaussianNoise(0.5);
      t.depth = physics.clamp(
        physics.lerpToward(t.depth, state.targetDepth, cfg.depthLerpRate) + depthNoise,
        0, 200
      );
    }

    // 4. Battery drain — linear, never recharges in sim
    t.battery = physics.clamp(t.battery - 0.008, 0, 100);

    // 5. Thrust — correlated with speed and turn rate
    const absYawDelta  = Math.abs(state.lastHeadingDelta);
    const thrustTarget = (t.speed / 8) * 65 + absYawDelta * 2.2;
    t.thrust = physics.clamp(
      physics.lerpToward(t.thrust, thrustTarget, 0.12)
        + physics.gaussianNoise(3),
      0, 100
    );

    // 6. Roll — bank into turns + wave/current noise
    const rollFromTurn = -state.lastHeadingDelta * 1.6;
    t.roll = physics.clamp(
      t.roll * 0.87 + rollFromTurn + physics.gaussianNoise(cfg.rollNoise * 0.5),
      -45, 45
    );

    // 7. Pitch — nose angle reflects descent/ascent
    const pitchTarget = state.missionPhase === 'descending'
      ?  8
      : state.missionPhase === 'ascending'
      ? -6
      :  0;
    t.pitch = physics.clamp(
      physics.lerpToward(t.pitch, pitchTarget, 0.04)
        + physics.gaussianNoise(cfg.pitchNoise * 0.5),
      -30, 30
    );

    // 8. Water temperature — thermal inertia, correlated with depth
    const tempTarget = physics.calcWaterTemp(t.depth, cfg.surfaceTemp);
    t.waterTemp = physics.clamp(
      physics.lerpToward(t.waterTemp, tempTarget, 0.015)
        + physics.gaussianNoise(0.04),
      0, 45
    );

    // 9. Pressure — direct function of depth
    t.pressure = physics.calcPressure(t.depth);

    // 10. GPS — only visible at/near surface
    if (!cfg.isSubsurface || t.depth < 2) {
      const [lat, lng] = physics.calcGpsStep(
        state.gpsLat, state.gpsLng, t.heading, t.speed
      );
      state.gpsLat = lat;
      state.gpsLng = lng;
      t.gps = { lat, lng };
    } else {
      t.gps = null; // Submerged — no GPS fix
    }

    // 11. Timestamp + vehicle status
    t.timestamp       = Date.now();
    t.vehicleId       = cfg.id;
    state.vehicle.lastPingAt = Date.now();
    state.vehicle.status = physics.evaluateVehicleStatus(
      t, state.missionPhase !== 'idle'
    );
  }

  // ── Fault injection ─────────────────────────────────────

  private checkFaultInjection(state: SimVehicleState): void {
    if (state.activeFault) return; // Already has a fault

    state.faultCooldownFrames--;
    if (state.faultCooldownFrames > 0) return;

    // Reset cooldown for the NEXT fault (regardless of whether this one fires)
    state.faultCooldownFrames =
      FAULT_MIN_FRAMES + Math.floor(Math.random() * (FAULT_MAX_FRAMES - FAULT_MIN_FRAMES));

    // Pick a random fault appropriate for this vehicle type
    const faultPool: FaultType[] = state.config.isSubsurface
      ? ['battery_drop', 'depth_overshoot', 'thruster_spike', 'signal_loss']
      : ['battery_drop', 'thruster_spike']; // ASV can't signal-loss or depth-overshoot

    const faultType = faultPool[Math.floor(Math.random() * faultPool.length)];
    this.triggerFault(state, faultType);
  }

  private triggerFault(state: SimVehicleState, type: FaultType): void {
    console.log(`[Fault] ${state.vehicle.name}: ${type}`);

    switch (type) {
      case 'battery_drop':
        state.telemetry.battery = physics.clamp(state.telemetry.battery - 5, 0, 100);
        // Instant — no duration needed
        this.emitFaultAlert(state, 'battery', 'warning',
          `${state.vehicle.name}: battery anomaly — sudden 5% drop detected`,
          state.telemetry.battery, 40);
        break;

      case 'depth_overshoot':
        state.activeFault  = { type, framesLeft: 48 }; // ~12s
        state.targetDepth  = state.config.missionDepth + 38; // Force into warning/critical
        this.emitFaultAlert(state, 'depth', 'critical',
          `${state.vehicle.name}: depth overshoot — exceeding safe operating envelope`,
          state.telemetry.depth, 80);
        break;

      case 'thruster_spike':
        state.activeFault       = { type, framesLeft: 12 }; // ~3s
        state.telemetry.thrust  = 97 + Math.random() * 2;
        this.emitFaultAlert(state, 'thrust', 'critical',
          `${state.vehicle.name}: thruster spike detected — thrust at ${state.telemetry.thrust.toFixed(0)}%`,
          state.telemetry.thrust, 95);
        break;

      case 'signal_loss': {
        const duration = 32 + Math.floor(Math.random() * 28); // 8–15 seconds (32–60 frames)
        state.activeFault     = { type, framesLeft: duration };
        state.vehicle.status  = 'offline';
        this.store.upsertVehicle({ ...state.vehicle });
        // Don't generate an Alert for signal_loss — UI handles the OFFLINE state visually
        this.emitEvent(state, 'mission_state_change', {
          message: `${state.vehicle.name}: signal lost — ${(duration / 4).toFixed(0)}s blackout`,
          status: 'offline',
        });
        break;
      }
    }
  }

  private tickActiveFault(state: SimVehicleState): void {
    if (!state.activeFault) return;
    state.activeFault.framesLeft--;

    if (state.activeFault.framesLeft <= 0) {
      switch (state.activeFault.type) {
        case 'depth_overshoot':
          // Return depth to normal mission depth
          state.targetDepth = state.config.missionDepth;
          this.emitEvent(state, 'mission_state_change', { message: 'Depth overshoot resolved' });
          break;
        case 'thruster_spike':
          // Thrust will naturally normalize in updatePhysics
          this.emitEvent(state, 'mission_state_change', { message: 'Thruster spike resolved' });
          break;
        default:
          break;
      }
      state.activeFault = null;
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  private emitFaultAlert(
    state:     SimVehicleState,
    sensor:    AlertableSensorKey,
    severity:  AlertSeverity,
    message:   string,
    value:     number,
    threshold: number,
  ): void {
    const alert: Alert = {
      id:           uuid(),
      vehicleId:    state.vehicle.id,
      sensor,
      severity,
      message,
      value,
      threshold,
      timestamp:    Date.now(),
      resolvedAt:   null,
      acknowledged: false,
    };
    this.store.upsertAlert(alert);

    // Broadcast as an event message so the Angular AlertService can catch it
    this.broadcastFn({
      type:      'event',
      vehicleId: state.vehicle.id,
      payload: {
        id:        uuid(),
        missionId: state.vehicle.activeMissionId ?? 'none',
        vehicleId: state.vehicle.id,
        type:      'alert_fired',
        timestamp: Date.now(),
        data: { alertId: alert.id, sensor, severity, message, value, threshold },
      },
      timestamp: Date.now(),
    });
  }

  private emitEvent(
    state: SimVehicleState,
    type:  'waypoint_reached' | 'mission_state_change',
    data:  Record<string, unknown>,
  ): void {
    const missionId = state.vehicle.activeMissionId;
    if (!missionId) return;

    const event = {
      id:        uuid(),
      missionId,
      vehicleId: state.vehicle.id,
      type,
      timestamp: Date.now(),
      data,
    };
    this.store.pushMissionEvent(event);

    this.broadcastFn({
      type:      'event',
      vehicleId: state.vehicle.id,
      payload:   event,
      timestamp: Date.now(),
    });
  }

  // ── Public API (called by REST route handlers) ──────────

  processCommand(vehicleId: string, command: Command): CommandAck {
    const state = this.states.get(vehicleId);

    if (!state) {
      return { commandId: command.id, vehicleId, status: 'failed',
               message: `Vehicle ${vehicleId} not found`, timestamp: Date.now() };
    }

    console.log(`[Command] ${state.vehicle.name}: ${command.type}`, command.payload ?? '');

    switch (command.type) {
      case 'start_mission': {
        const missionId = command.payload?.['missionId'] as string | undefined;
        if (missionId) {
          const mission = this.store.getMission(missionId);
          if (mission && mission.vehicleId === vehicleId) {
            const updated: Mission = { ...mission, status: 'active', startedAt: Date.now() };
            this.store.upsertMission(updated);
            state.vehicle.activeMissionId = missionId;
            state.missionPhase            = 'descending';
            state.phaseFrameCounter       = 0;
            state.targetDepth             = state.config.missionDepth;
            state.targetSpeed             = state.config.baseSpeed;
          }
        }
        break;
      }

      case 'pause':
        state.targetSpeed = 0;
        if (state.vehicle.activeMissionId) {
          const m = this.store.getMission(state.vehicle.activeMissionId);
          if (m) this.store.upsertMission({ ...m, status: 'paused' });
        }
        break;

      case 'resume':
        state.targetSpeed  = state.config.baseSpeed;
        state.missionPhase = 'cruising';
        if (state.vehicle.activeMissionId) {
          const m = this.store.getMission(state.vehicle.activeMissionId);
          if (m) this.store.upsertMission({ ...m, status: 'active' });
        }
        break;

      case 'abort': {
        if (state.vehicle.activeMissionId) {
          const m = this.store.getMission(state.vehicle.activeMissionId);
          if (m) this.store.upsertMission({ ...m, status: 'aborted', completedAt: Date.now() });
          state.vehicle.activeMissionId = null;
        }
        state.missionPhase      = 'idle';
        state.phaseFrameCounter = 0;
        state.targetSpeed       = 0;
        state.telemetry.missionProgress = null;
        break;
      }

      case 'return_to_surface':
        state.missionPhase      = 'ascending';
        state.phaseFrameCounter = 0;
        state.targetDepth       = 0;
        state.targetSpeed       = state.config.baseSpeed * 0.85;
        // Clear any depth-overshoot fault
        if (state.activeFault?.type === 'depth_overshoot') state.activeFault = null;
        break;

      case 'set_heading':
        if (typeof command.payload?.['heading'] === 'number') {
          state.targetHeading = physics.wrapHeading(command.payload['heading'] as number);
        }
        break;

      case 'set_speed':
        if (typeof command.payload?.['speed'] === 'number') {
          state.targetSpeed = physics.clamp(command.payload['speed'] as number, 0, 12);
        }
        break;
    }

    return {
      commandId: command.id,
      vehicleId,
      status:    'acknowledged',
      message:   `Command '${command.type}' executed on ${state.vehicle.name}`,
      timestamp: Date.now(),
    };
  }

  /** Returns the latest telemetry for all vehicles (used by REST /api/vehicles on connect). */
  getAllCurrentTelemetry(): Map<string, TelemetryFrame> {
    const result = new Map<string, TelemetryFrame>();
    for (const [id, state] of this.states) {
      result.set(id, { ...state.telemetry });
    }
    return result;
  }
}
