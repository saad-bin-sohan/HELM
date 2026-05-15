import {
  Component, ChangeDetectionStrategy, OnDestroy, inject,
  signal, computed, effect, PLATFORM_ID, afterNextRender, DestroyRef,
} from '@angular/core';
import { isPlatformBrowser, DecimalPipe, AsyncPipe } from '@angular/common';
import {
  FormBuilder, FormArray, FormGroup, Validators, ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

// Angular Material
import { MatButtonModule }    from '@angular/material/button';
import { MatInputModule }     from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule }    from '@angular/material/select';
import { MatTooltipModule }   from '@angular/material/tooltip';
import { MatSnackBar }        from '@angular/material/snack-bar';
import { MatIconModule }      from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Angular CDK
import {
  DragDropModule, CdkDragDrop, moveItemInArray,
} from '@angular/cdk/drag-drop';

// Lucide icons
import {
  LucideAngularModule, Trash2, GripVertical, Send, Save, X,
  LUCIDE_ICONS, LucideIconProvider,
} from 'lucide-angular';

// Services
import { FleetService }   from '../../core/services/fleet.service';
import { MissionService } from '../../core/services/mission.service';
import { CommandService } from '../../core/services/command.service';

// Shared
import { DepthProfileChartComponent } from '../../shared/components/depth-profile-chart/depth-profile-chart.component';

// Models
import type { Mission, Waypoint } from '@helm/models';

// Leaflet — type-only at module level; runtime import happens inside afterNextRender
import type * as LeafletType from 'leaflet';

/** Shape of each entry in the waypoints FormArray */
interface WaypointFormValue {
  lat:           number;
  lng:           number;
  targetDepth:   number;
  hoverDuration: number;
}

@Component({
  selector: 'helm-mission-planner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    AsyncPipe,
    DragDropModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
    MatIconModule,
    MatProgressSpinnerModule,
    LucideAngularModule,
    DepthProfileChartComponent,
  ],
  providers: [
    {
      provide:  LUCIDE_ICONS,
      multi:    true,
      useValue: new LucideIconProvider({
        Trash2, GripVertical, Send, Save, X,
      }),
    },
  ],
  templateUrl: './mission-planner.component.html',
  styleUrl:    './mission-planner.component.scss',
})
export class MissionPlannerComponent implements OnDestroy {

  // ── Dependency injection ──────────────────────────────
  private readonly fb             = inject(FormBuilder);
  private readonly router         = inject(Router);
  private readonly snackBar       = inject(MatSnackBar);
  private readonly fleetService   = inject(FleetService);
  private readonly missionService = inject(MissionService);
  private readonly commandService = inject(CommandService);
  private readonly platformId     = inject(PLATFORM_ID);
  private readonly destroyRef     = inject(DestroyRef);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ── Public signals (guard-accessible) ────────────────
  /** Whether the form has unsaved changes — read by unsavedChangesGuard */
  readonly isDirty = signal(false);

  // ── Internal signals ──────────────────────────────────
  protected readonly isSaving           = signal(false);
  protected readonly isDispatching      = this.commandService.isDispatching;
  protected readonly selectedMissionId  = signal<string | null>(null);
  protected readonly vehicleId          = this.fleetService.selectedVehicleId;

  /** All missions as a signal */
  protected readonly allMissions = toSignal(this.missionService.missions$, {
    initialValue: [] as Mission[],
  });

  protected readonly vehicleMissions = computed(() =>
    this.allMissions().filter((m) => m.vehicleId === this.vehicleId()),
  );

  protected readonly plannedMissions = computed(() =>
    this.vehicleMissions().filter((m) => m.status === 'planned'),
  );

  // ── Reactive form ──────────────────────────────────────
  readonly missionForm = this.fb.group({
    name:        ['', [Validators.required, Validators.maxLength(80)]],
    targetSpeed: [3,  [Validators.required, Validators.min(0.5), Validators.max(10)]],
    maxDepth:    [50, [Validators.required, Validators.min(1),   Validators.max(300)]],
    timeout:     [120,[Validators.required, Validators.min(5),   Validators.max(480)]],
    waypoints:   this.fb.array<FormGroup>([], [Validators.minLength(2)]),
  });

  get waypointsArray(): FormArray {
    return this.missionForm.get('waypoints') as FormArray;
  }

  /** Signal that tracks form value changes — bridges reactive forms into the signal graph */
  private readonly formValueSignal = toSignal(this.missionForm.valueChanges, {
    initialValue: this.missionForm.value,
  });

  /** Typed snapshot of current waypoints for the depth profile chart */
  protected readonly currentWaypoints = computed((): Waypoint[] => {
    // Reading formValueSignal ensures this computed re-runs on form changes
    const _v = this.formValueSignal();
    const raw = this.waypointsArray.value as WaypointFormValue[];
    return raw.map((wp, i) => ({
      index:         i,
      lat:           wp.lat ?? 0,
      lng:           wp.lng ?? 0,
      targetDepth:   wp.targetDepth ?? 20,
      hoverDuration: wp.hoverDuration ?? 30,
    }));
  });

  // ── Leaflet state (browser-only, private) ─────────────
  // Leaflet is imported dynamically inside afterNextRender — these hold the runtime instances.
  private L:             typeof LeafletType | null = null;
  private map:           LeafletType.Map | null = null;
  private markersLayer:  LeafletType.LayerGroup | null = null;
  private routePolyline: LeafletType.Polyline | null = null;
  /** DOM element id for the map container — keep stable across renders */
  protected readonly mapContainerId = 'helm-mission-map';

  // ── Constructor & lifecycle ───────────────────────────

  constructor() {
    // Mark form dirty on any value change
    this.missionForm.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.missionForm.dirty) {
          this.isDirty.set(true);
        }
      });

    // Re-render markers and route whenever waypoints change
    effect(() => {
      const _formValue = this.formValueSignal(); // reactive dependency on form changes
      const wps = this.waypointsArray.value as WaypointFormValue[];
      const waypoints: Waypoint[] = wps.map((wp, i) => ({
        index: i, lat: wp.lat ?? 0, lng: wp.lng ?? 0,
        targetDepth: wp.targetDepth ?? 20, hoverDuration: wp.hoverDuration ?? 30,
      }));
      if (this.map && this.L) {
        this.renderMarkersAndRoute(waypoints);
      }
    });

    // Initialize Leaflet map after first render (SSR-safe)
    if (this.isBrowser) {
      afterNextRender(() => {
        this.initLeafletMap();
      });
    }
  }

  ngOnDestroy(): void {
    // Clean up Leaflet map to prevent memory leaks
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  // ── Leaflet initialization ─────────────────────────────

  private async initLeafletMap(): Promise<void> {
    // Dynamic import of Leaflet — only runs in browser, never on server
    this.L = await import('leaflet');
    const L = this.L;

    const container = document.getElementById(this.mapContainerId);
    if (!container) return;

    // Initialize map centered on North Sea (typical AUV/ROV operating area)
    this.map = L.map(container, {
      center:          [56.5, 3.0],
      zoom:            7,
      zoomControl:     true,
      attributionControl: true,
    });

    // CartoDB Dark Matter tiles — dark theme matching HELM design
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
          '&copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom:    20,
      },
    ).addTo(this.map);

    // Marker and route layers
    this.markersLayer  = L.layerGroup().addTo(this.map);
    this.routePolyline = L.polyline([], {
      color:     '#0EA5E9',  // --color-accent
      weight:    2,
      opacity:   0.7,
      dashArray: '8, 6',
    }).addTo(this.map);

    // Map click → add waypoint
    this.map.on('click', (e: LeafletType.LeafletMouseEvent) => {
      this.addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    // Render any waypoints that were loaded before map init
    if (this.waypointsArray.length > 0) {
      this.renderMarkersAndRoute(this.currentWaypoints());
    }
  }

  // ── Waypoint management ───────────────────────────────

  protected addWaypoint(lat: number, lng: number): void {
    const group = this.fb.group({
      lat:           [+lat.toFixed(6),  Validators.required],
      lng:           [+lng.toFixed(6),  Validators.required],
      targetDepth:   [20, [Validators.required, Validators.min(1), Validators.max(300)]],
      hoverDuration: [30, [Validators.required, Validators.min(0), Validators.max(3600)]],
    });
    this.waypointsArray.push(group);
    this.missionForm.markAsDirty();
    this.isDirty.set(true);
  }

  protected removeWaypoint(index: number): void {
    this.waypointsArray.removeAt(index);
    this.missionForm.markAsDirty();
    this.isDirty.set(true);
    // Re-render after removal
    this.renderMarkersAndRoute(this.currentWaypoints());
  }

  protected onWaypointDropped(event: CdkDragDrop<FormGroup[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    // Reorder the underlying FormArray controls
    const controls = this.waypointsArray.controls;
    moveItemInArray(controls, event.previousIndex, event.currentIndex);
    // Notify Angular forms about the reorder
    this.waypointsArray.updateValueAndValidity({ emitEvent: true });
    this.missionForm.markAsDirty();
    this.isDirty.set(true);
    // Re-render markers with updated indices
    this.renderMarkersAndRoute(this.currentWaypoints());
  }

  protected onDepthChange(event: { index: number; depth: number }): void {
    const ctrl = this.waypointsArray.at(event.index);
    if (ctrl) {
      ctrl.patchValue({ targetDepth: event.depth });
      this.missionForm.markAsDirty();
      this.isDirty.set(true);
    }
  }

  /** Returns the FormGroup for a given waypoint index */
  protected getWaypointGroup(index: number): FormGroup {
    return this.waypointsArray.at(index) as FormGroup;
  }

  // ── Leaflet rendering ─────────────────────────────────

  private renderMarkersAndRoute(waypoints: Waypoint[]): void {
    if (!this.map || !this.L || !this.markersLayer || !this.routePolyline) return;
    const L = this.L;

    // Clear existing markers
    this.markersLayer.clearLayers();

    const latLngs: LeafletType.LatLngExpression[] = [];

    waypoints.forEach((wp, i) => {
      const latLng = L.latLng(wp.lat, wp.lng);
      latLngs.push(latLng);

      // Custom numbered DivIcon with HELM accent color
      const icon = L.divIcon({
        className: '',  // override default leaflet-div-icon styles
        html: `
          <div style="
            width: 28px; height: 28px;
            background: #0EA5E9;
            border: 2px solid #E8F4FF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 8px rgba(14,165,233,0.5);
          ">
            <span style="
              transform: rotate(45deg);
              color: #080E1A;
              font-size: 10px;
              font-weight: 700;
              font-family: 'JetBrains Mono', monospace;
              line-height: 1;
            ">${i + 1}</span>
          </div>`,
        iconSize:   [28, 28],
        iconAnchor: [14, 28],
        popupAnchor:[0, -28],
      });

      const marker = L.marker(latLng, { icon, draggable: true });

      // Popup with waypoint details
      marker.bindPopup(`
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #0EA5E9;">
          <strong>WP${i + 1}</strong><br/>
          ${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}<br/>
          Depth: ${wp.targetDepth}m · Hover: ${wp.hoverDuration}s
        </div>
      `);

      // Drag on map → update FormArray
      marker.on('dragend', (e: LeafletType.DragEndEvent) => {
        const newLatLng = (e.target as LeafletType.Marker).getLatLng();
        const ctrl = this.waypointsArray.at(i);
        if (ctrl) {
          ctrl.patchValue({
            lat: +newLatLng.lat.toFixed(6),
            lng: +newLatLng.lng.toFixed(6),
          });
          this.missionForm.markAsDirty();
          this.isDirty.set(true);
        }
      });

      // Non-null assertion safe — we checked markersLayer is non-null at top of method
      this.markersLayer!.addLayer(marker); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    });

    // Update route polyline
    this.routePolyline.setLatLngs(latLngs);

    // Fit map to waypoints if there are any
    if (latLngs.length > 0) {
      try {
        this.map.fitBounds(L.latLngBounds(latLngs as LeafletType.LatLng[]), {
          padding: [40, 40],
          maxZoom: 12,
        });
      } catch {
        // Bounds error if single point — expected when only one waypoint exists
      }
    }
  }

  // ── Mission CRUD ──────────────────────────────────────

  protected loadMission(missionId: string): void {
    if (!missionId) return;
    const mission = this.allMissions().find((m) => m.id === missionId);
    if (!mission) return;

    this.selectedMissionId.set(missionId);

    // Patch scalar fields
    this.missionForm.patchValue({
      name:        mission.name,
      targetSpeed: mission.targetSpeed,
      maxDepth:    mission.maxDepth,
      timeout:     mission.timeout,
    });

    // Rebuild waypoints FormArray
    while (this.waypointsArray.length > 0) {
      this.waypointsArray.removeAt(0);
    }
    mission.waypoints.forEach((wp) => {
      this.waypointsArray.push(this.fb.group({
        lat:           [wp.lat,           Validators.required],
        lng:           [wp.lng,           Validators.required],
        targetDepth:   [wp.targetDepth,   [Validators.required, Validators.min(1), Validators.max(300)]],
        hoverDuration: [wp.hoverDuration, [Validators.required, Validators.min(0), Validators.max(3600)]],
      }));
    });

    this.missionForm.markAsPristine();
    this.isDirty.set(false);

    // Fit map to loaded waypoints
    if (this.map && this.L && mission.waypoints.length > 0) {
      this.renderMarkersAndRoute(mission.waypoints);
    }
  }

  protected clearMission(): void {
    while (this.waypointsArray.length > 0) {
      this.waypointsArray.removeAt(0);
    }
    this.missionForm.reset({
      name: '',
      targetSpeed: 3,
      maxDepth: 50,
      timeout: 120,
    });
    this.selectedMissionId.set(null);
    this.isDirty.set(false);

    if (this.markersLayer) this.markersLayer.clearLayers();
    if (this.routePolyline) this.routePolyline.setLatLngs([]);
  }

  protected saveMission(): void {
    if (this.missionForm.invalid || this.isSaving()) return;

    const formValue = this.missionForm.value;
    const waypoints: Waypoint[] = (formValue.waypoints as WaypointFormValue[]).map(
      (wp, i) => ({
        index:         i,
        lat:           wp.lat,
        lng:           wp.lng,
        targetDepth:   wp.targetDepth,
        hoverDuration: wp.hoverDuration,
      }),
    );

    const partial = {
      vehicleId:    this.vehicleId(),
      name:         formValue.name ?? '',
      waypoints,
      depthProfile: waypoints.map((wp) => ({ waypointIndex: wp.index, depth: wp.targetDepth })),
      maxDepth:     formValue.maxDepth ?? 50,
      targetSpeed:  formValue.targetSpeed ?? 3,
      timeout:      formValue.timeout ?? 120,
    };

    this.isSaving.set(true);

    const existingId = this.selectedMissionId();
    const save$ = existingId
      ? this.missionService.updateMission(existingId, partial)
      : this.missionService.createMission(partial);

    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.selectedMissionId.set(saved.id);
        this.missionForm.markAsPristine();
        this.isDirty.set(false);
        this.isSaving.set(false);
        this.snackBar.open('Mission saved successfully.', 'OK', { duration: 3000 });
      },
      error: () => {
        this.isSaving.set(false);
        this.snackBar.open('Failed to save mission. Please try again.', 'Dismiss', {
          duration: 5000,
        });
      },
    });
  }

  protected sendToVehicle(): void {
    if (this.missionForm.invalid || this.isDispatching()) return;

    const doDispatch = (missionId: string): void => {
      this.commandService
        .dispatch(this.vehicleId(), 'start_mission', { missionId })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.isDirty.set(false);
            this.snackBar.open('Mission sent to vehicle. Navigating to dashboard...', 'OK', { duration: 2500 });
            setTimeout(() => void this.router.navigate(['/dashboard']), 1500);
          },
          error: (err: Error) => {
            this.snackBar.open(`Dispatch failed: ${err.message}`, 'Dismiss', { duration: 5000 });
          },
        });
    };

    // If dirty, save first; then dispatch
    if (this.isDirty()) {
      const formValue = this.missionForm.value;
      const waypoints: Waypoint[] = (formValue.waypoints as WaypointFormValue[]).map((wp, i) => ({
        index: i, lat: wp.lat, lng: wp.lng,
        targetDepth: wp.targetDepth, hoverDuration: wp.hoverDuration,
      }));
      const partial = {
        vehicleId:    this.vehicleId(),
        name:         formValue.name ?? '',
        waypoints,
        depthProfile: waypoints.map((wp) => ({ waypointIndex: wp.index, depth: wp.targetDepth })),
        maxDepth:     formValue.maxDepth ?? 50,
        targetSpeed:  formValue.targetSpeed ?? 3,
        timeout:      formValue.timeout ?? 120,
      };

      this.isSaving.set(true);
      const existingId = this.selectedMissionId();
      const save$ = existingId
        ? this.missionService.updateMission(existingId, partial)
        : this.missionService.createMission(partial);

      save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (saved) => {
          this.selectedMissionId.set(saved.id);
          this.missionForm.markAsPristine();
          this.isDirty.set(false);
          this.isSaving.set(false);
          doDispatch(saved.id);
        },
        error: () => {
          this.isSaving.set(false);
          this.snackBar.open('Save failed before dispatch.', 'Dismiss', { duration: 5000 });
        },
      });
    } else if (this.selectedMissionId()) {
      // Non-null assertion safe — guarded by the if condition above
      doDispatch(this.selectedMissionId()!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    } else {
      this.snackBar.open('Save the mission first before sending to vehicle.', 'Dismiss', { duration: 3000 });
    }
  }
}
