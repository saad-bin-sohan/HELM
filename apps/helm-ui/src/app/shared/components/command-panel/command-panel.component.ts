import {
  Component, ChangeDetectionStrategy, Input, OnChanges, SimpleChanges,
  inject, signal, computed,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule }   from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar }       from '@angular/material/snack-bar';
import { MatTooltipModule }  from '@angular/material/tooltip';
import { MatInputModule }    from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { take } from 'rxjs';
import {
  LucideAngularModule, LUCIDE_ICONS, LucideIconProvider,
  Play, Pause, Square, RotateCcw, ArrowUp, Compass, Gauge,
  ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Loader,
} from 'lucide-angular';

import { CommandService } from '../../../core/services/command.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import type { Mission, CommandType, Command } from '@helm/models';

interface CommandDef {
  type:               CommandType;
  label:              string;
  icon:               string;
  needsConfirm:       boolean;
  dangerLevel:        'normal' | 'danger' | 'critical';
  requireTypedConfirm?: boolean;
  confirmTitle?:      string;
  confirmMessage?:    string;
  needsMissionSelect?: boolean;
  needsHeadingInput?: boolean;
  needsSpeedInput?:   boolean;
  disabledWhen?:      'no-mission' | 'mission-active' | 'never';
  fullWidth?:         boolean;
}

const COMMAND_DEFS: CommandDef[] = [
  {
    type: 'start_mission',
    label: 'Start Mission',
    icon: 'play',
    needsConfirm: true,
    dangerLevel: 'normal',
    confirmTitle: 'Start Mission',
    confirmMessage: 'Dispatch the selected mission to the vehicle. The vehicle will begin executing waypoints.',
    needsMissionSelect: true,
    disabledWhen: 'mission-active',
  },
  {
    type: 'pause',
    label: 'Pause',
    icon: 'pause',
    needsConfirm: false,
    dangerLevel: 'normal',
    disabledWhen: 'no-mission',
  },
  {
    type: 'resume',
    label: 'Resume',
    icon: 'rotate-ccw',
    needsConfirm: false,
    dangerLevel: 'normal',
    disabledWhen: 'no-mission',
  },
  {
    type: 'abort',
    label: 'Abort Mission',
    icon: 'square',
    needsConfirm: true,
    dangerLevel: 'danger',
    confirmTitle: 'Abort Mission',
    confirmMessage: 'This will immediately halt the current mission. The vehicle will hold position.',
    disabledWhen: 'no-mission',
  },
  {
    type: 'return_to_surface',
    label: 'Return to Surface',
    icon: 'arrow-up',
    needsConfirm: true,
    dangerLevel: 'critical',
    requireTypedConfirm: true,
    confirmTitle: 'Emergency: Return to Surface',
    confirmMessage: 'The vehicle will immediately abort all operations and ascend to the surface at maximum safe speed. This cannot be undone.',
    disabledWhen: 'never',
    fullWidth: true,
  },
  {
    type: 'set_heading',
    label: 'Set Heading',
    icon: 'compass',
    needsConfirm: false,
    dangerLevel: 'normal',
    needsHeadingInput: true,
    disabledWhen: 'never',
  },
  {
    type: 'set_speed',
    label: 'Adjust Speed',
    icon: 'gauge',
    needsConfirm: false,
    dangerLevel: 'normal',
    needsSpeedInput: true,
    disabledWhen: 'never',
  },
];

@Component({
  selector: 'helm-command-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SlicePipe,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule,
    LucideAngularModule,
    TimeAgoPipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        Play, Pause, Square, RotateCcw, ArrowUp, Compass, Gauge,
        ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Loader,
      }),
    },
  ],
  templateUrl: './command-panel.component.html',
  styleUrl: './command-panel.component.scss',
})
export class CommandPanelComponent implements OnChanges {
  @Input({ required: true }) vehicleId!: string;
  @Input() activeMission: Mission | undefined;
  @Input() plannedMissions: Mission[] = [];

  protected readonly commandService = inject(CommandService);
  protected readonly dialog         = inject(MatDialog);
  protected readonly snackBar       = inject(MatSnackBar);

  protected readonly isDispatching = this.commandService.isDispatching;
  protected readonly history       = this.commandService.commandHistory;
  protected readonly showHistory   = signal(false);

  // For start_mission: which planned mission is selected
  protected readonly selectedMissionId = signal<string | null>(null);

  // For set_heading: input value
  protected headingInput = signal<number>(0);

  // For set_speed: input value
  protected speedInput = signal<number>(3);

  // Inline input visibility toggles (for set_heading / set_speed)
  protected readonly activeInlineInput = signal<'heading' | 'speed' | null>(null);

  protected readonly commandDefs = COMMAND_DEFS;

  readonly historySlice = computed(() => this.history().slice(0, 10));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['plannedMissions']) {
      // Reset selection if previously selected mission is no longer available
      const ids = new Set(this.plannedMissions.map((m) => m.id));
      if (this.selectedMissionId() && !ids.has(this.selectedMissionId()!)) { // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guarded by truthiness check
        this.selectedMissionId.set(null);
      }
      // Auto-select first planned mission if none selected
      if (!this.selectedMissionId() && this.plannedMissions.length > 0) {
        this.selectedMissionId.set(this.plannedMissions[0].id);
      }
    }
  }

  protected isCommandDisabled(def: CommandDef): boolean {
    if (this.isDispatching()) return true;
    if (def.disabledWhen === 'no-mission'     && !this.activeMission) return true;
    if (def.disabledWhen === 'mission-active' && !!this.activeMission) return true;
    if (def.type === 'start_mission' && this.plannedMissions.length === 0) return true;
    return false;
  }

  protected onCommandClick(def: CommandDef): void {
    // Handle inline input toggles
    if (def.needsHeadingInput || def.needsSpeedInput) {
      const key: 'heading' | 'speed' = def.needsHeadingInput ? 'heading' : 'speed';
      this.activeInlineInput.update((v) => (v === key ? null : key));
      return;
    }

    if (def.needsConfirm) {
      this.openConfirmDialog(def);
    } else {
      this.dispatchCommand(def.type, this.buildPayload(def));
    }
  }

  protected onDispatchInlineInput(type: 'heading' | 'speed'): void {
    const commandType: CommandType = type === 'heading' ? 'set_heading' : 'set_speed';
    const payload = type === 'heading'
      ? { heading: this.headingInput() }
      : { speed: this.speedInput() };

    // Validate ranges
    if (type === 'heading' && (this.headingInput() < 0 || this.headingInput() > 360)) {
      this.snackBar.open('Heading must be 0–360°', 'OK', { duration: 3000 });
      return;
    }
    if (type === 'speed' && (this.speedInput() < 0.5 || this.speedInput() > 10)) {
      this.snackBar.open('Speed must be 0.5–10 knots', 'OK', { duration: 3000 });
      return;
    }

    this.activeInlineInput.set(null);
    this.dispatchCommand(commandType, payload);
  }

  private openConfirmDialog(def: CommandDef): void {
    const data: ConfirmDialogData = {
      title:               def.confirmTitle  ?? def.label,
      message:             def.confirmMessage ?? `Send command: ${def.label}`,
      confirmLabel:        def.label,
      dangerLevel:         def.dangerLevel,
      requireTypedConfirm: def.requireTypedConfirm ?? false,
    };

    // For start_mission, prepend the selected mission name to the message
    if (def.needsMissionSelect && this.selectedMissionId()) {
      const mission = this.plannedMissions.find((m) => m.id === this.selectedMissionId());
      if (mission) {
        data.details = `Mission: "${mission.name}" · ${mission.waypoints.length} waypoints`;
      }
    }

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data,
      panelClass: 'helm-dialog-panel',
      disableClose: false,
    });

    ref.afterClosed().pipe(take(1)).subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.dispatchCommand(def.type, this.buildPayload(def));
      }
    });
  }

  private buildPayload(def: CommandDef): Record<string, unknown> | undefined {
    if (def.type === 'start_mission' && this.selectedMissionId()) {
      return { missionId: this.selectedMissionId() };
    }
    return undefined;
  }

  private dispatchCommand(type: CommandType, payload?: Record<string, unknown>): void {
    this.commandService
      .dispatch(this.vehicleId, type, payload)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.snackBar.open(
            `✓ ${type.replace(/_/g, ' ').toUpperCase()} acknowledged`,
            'OK',
            { duration: 3000, panelClass: 'snack-success' },
          );
        },
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          this.snackBar.open(
            `✗ Command failed: ${msg}`,
            'Dismiss',
            { duration: 6000, panelClass: 'snack-error' },
          );
        },
      });
  }

  protected statusIcon(cmd: Command): string {
    switch (cmd.status) {
      case 'acknowledged': return 'check-circle-2';
      case 'failed':       return 'x-circle';
      default:             return 'loader';
    }
  }

  protected statusClass(cmd: Command): string {
    switch (cmd.status) {
      case 'acknowledged': return 'status-ack';
      case 'failed':       return 'status-fail';
      default:             return 'status-pending';
    }
  }

  protected formatCommandType(type: string): string {
    return type.replace(/_/g, ' ').toUpperCase();
  }
}
