import {
  Component, ChangeDetectionStrategy, inject, signal,
  PLATFORM_ID, DestroyRef, OnInit,
} from '@angular/core';
import { isPlatformBrowser, AsyncPipe, DecimalPipe, JsonPipe, UpperCasePipe } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder, Validators,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { debounceTime, filter, take } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule }      from '@angular/material/button';
import { MatInputModule }       from '@angular/material/input';
import { MatFormFieldModule }   from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule }     from '@angular/material/tooltip';
import {
  LucideAngularModule, LUCIDE_ICONS, LucideIconProvider,
  RotateCcw, Volume2, VolumeX, Wifi, WifiOff,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-angular';
import { AlertService }    from '../../core/services/alert.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { environment }     from '@helm/env';
import {
  DEFAULT_THRESHOLDS, type AlertableSensorKey,
} from '@helm/models';

@Component({
  selector: 'helm-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AsyncPipe,
    DecimalPipe,
    JsonPipe,
    UpperCasePipe,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatTooltipModule,
    LucideAngularModule,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        RotateCcw, Volume2, VolumeX, Wifi, WifiOff,
        RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
      }),
    },
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly fb             = inject(FormBuilder);
  private readonly alertService   = inject(AlertService);
  private readonly wsService      = inject(WebSocketService);
  private readonly http           = inject(HttpClient);
  private readonly destroyRef     = inject(DestroyRef);
  private readonly platformId     = inject(PLATFORM_ID);
  private readonly isBrowser      = isPlatformBrowser(this.platformId);
  protected readonly apiUrl       = environment.apiUrl;
  protected readonly wsUrl        = environment.wsUrl;

  // ── State signals ──────────────────────────────────────
  readonly soundMuted       = this.alertService.soundMuted;
  readonly connectionState  = this.wsService.connectionState;
  readonly serverHealth     = signal<unknown>(null);
  readonly healthLoading    = signal(false);
  readonly healthError      = signal<string | null>(null);
  readonly saveIndicator    = signal(false);
  readonly expandedSections = signal<Set<string>>(
    new Set(['thresholds', 'audio', 'display']),
  );

  // ── Reactive Form ──────────────────────────────────────
  readonly thresholdForm = this.fb.group({
    depth:     this.fb.group({ warning: [50,  [Validators.required, Validators.min(0), Validators.max(300)]], critical: [80,  [Validators.required, Validators.min(0), Validators.max(300)]] }),
    speed:     this.fb.group({ warning: [5,   [Validators.required, Validators.min(0), Validators.max(20)]],  critical: [7,   [Validators.required, Validators.min(0), Validators.max(20)]]  }),
    battery:   this.fb.group({ warning: [40,  [Validators.required, Validators.min(0), Validators.max(100)]], critical: [20,  [Validators.required, Validators.min(0), Validators.max(100)]] }),
    thrust:    this.fb.group({ warning: [80,  [Validators.required, Validators.min(0), Validators.max(100)]], critical: [95,  [Validators.required, Validators.min(0), Validators.max(100)]] }),
    waterTemp: this.fb.group({ warning: [30,  [Validators.required, Validators.min(-5), Validators.max(60)]], critical: [40,  [Validators.required, Validators.min(-5), Validators.max(60)]] }),
    pressure:  this.fb.group({ warning: [5,   [Validators.required, Validators.min(0), Validators.max(100)]], critical: [8,   [Validators.required, Validators.min(0), Validators.max(100)]] }),
    roll:      this.fb.group({ warning: [15,  [Validators.required, Validators.min(0), Validators.max(90)]],  critical: [30,  [Validators.required, Validators.min(0), Validators.max(90)]]  }),
    pitch:     this.fb.group({ warning: [15,  [Validators.required, Validators.min(0), Validators.max(90)]],  critical: [30,  [Validators.required, Validators.min(0), Validators.max(90)]]  }),
  });

  // ── Sensor metadata (for template rendering) ──────────
  readonly sensorRows: Array<{
    key: AlertableSensorKey;
    label: string;
    unit: string;
    operator: string;
    warningMin: number;
    warningMax: number;
    criticalMin: number;
    criticalMax: number;
    step: number;
  }> = [
    { key: 'depth',     label: 'Depth',      unit: 'm',    operator: 'gt',      warningMin: 0,  warningMax: 300, criticalMin: 0,  criticalMax: 300, step: 1   },
    { key: 'speed',     label: 'Speed',       unit: 'kn',   operator: 'gt',      warningMin: 0,  warningMax: 20,  criticalMin: 0,  criticalMax: 20,  step: 0.5 },
    { key: 'battery',   label: 'Battery',     unit: '%',    operator: 'lt',      warningMin: 0,  warningMax: 100, criticalMin: 0,  criticalMax: 100, step: 1   },
    { key: 'thrust',    label: 'Thrust',      unit: '%',    operator: 'gt',      warningMin: 0,  warningMax: 100, criticalMin: 0,  criticalMax: 100, step: 1   },
    { key: 'waterTemp', label: 'Water Temp',  unit: '°C',   operator: 'gt',      warningMin: -5, warningMax: 60,  criticalMin: -5, criticalMax: 60,  step: 0.5 },
    { key: 'pressure',  label: 'Pressure',    unit: 'bar',  operator: 'gt',      warningMin: 0,  warningMax: 100, criticalMin: 0,  criticalMax: 100, step: 0.5 },
    { key: 'roll',      label: 'Roll',        unit: '°',    operator: '|abs|gt', warningMin: 0,  warningMax: 90,  criticalMin: 0,  criticalMax: 90,  step: 1   },
    { key: 'pitch',     label: 'Pitch',       unit: '°',    operator: '|abs|gt', warningMin: 0,  warningMax: 90,  criticalMin: 0,  criticalMax: 90,  step: 1   },
  ];

  // ── Lifecycle ──────────────────────────────────────────

  ngOnInit(): void {
    // 1. Load persisted thresholds from localStorage (SSR-safe)
    if (this.isBrowser) {
      const stored = localStorage.getItem('helm.thresholds');
      if (stored) {
        try {
          this.thresholdForm.patchValue(JSON.parse(stored), { emitEvent: false });
        } catch { /* ignore corrupt data */ }
      }
    }

    // 2. Wire auto-save: debounce 500ms → localStorage + AlertService
    this.thresholdForm.valueChanges.pipe(
      debounceTime(500),
      filter(() => this.thresholdForm.valid),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((value) => {
      if (this.isBrowser) {
        localStorage.setItem('helm.thresholds', JSON.stringify(value));
      }
      this.alertService.updateThresholds(
        value as Record<string, { warning: number; critical: number }>,
      );
      // Show brief "Saved" indicator
      this.saveIndicator.set(true);
      setTimeout(() => this.saveIndicator.set(false), 1500);
    });
  }

  // ── Per-sensor reset ───────────────────────────────────

  resetSensor(sensorKey: string): void {
    const defaults = DEFAULT_THRESHOLDS[sensorKey as AlertableSensorKey];
    if (!defaults) return;
    const group = this.thresholdForm.get(sensorKey);
    if (group) {
      group.patchValue({ warning: defaults.warning, critical: defaults.critical });
    }
  }

  // ── Reset all ──────────────────────────────────────────

  resetAll(): void {
    const defaultValues: Record<string, { warning: number; critical: number }> = {};
    for (const [key, thresh] of Object.entries(DEFAULT_THRESHOLDS)) {
      defaultValues[key] = { warning: thresh.warning, critical: thresh.critical };
    }
    this.thresholdForm.patchValue(defaultValues);
    if (this.isBrowser) {
      localStorage.removeItem('helm.thresholds');
    }
    this.alertService.updateThresholds(defaultValues);
  }

  // ── Audio toggle ───────────────────────────────────────

  toggleMute(): void {
    this.alertService.toggleMute();
  }

  // ── Server health refresh ──────────────────────────────

  refreshHealth(): void {
    this.healthLoading.set(true);
    this.healthError.set(null);
    this.http.get(`${this.apiUrl}/health`).pipe(
      take(1),
    ).subscribe({
      next: (data) => {
        this.serverHealth.set(data);
        this.healthLoading.set(false);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Request failed';
        this.healthError.set(msg);
        this.healthLoading.set(false);
      },
    });
  }

  // ── Section collapse toggle ────────────────────────────

  toggleSection(section: string): void {
    this.expandedSections.update((s) => {
      const next = new Set(s);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  isSectionExpanded(section: string): boolean {
    return this.expandedSections().has(section);
  }
}
