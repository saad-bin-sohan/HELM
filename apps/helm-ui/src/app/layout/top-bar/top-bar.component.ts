import {
  Component, Output, EventEmitter, ChangeDetectionStrategy, inject, computed,
} from '@angular/core';
import { AsyncPipe }         from '@angular/common';
import { MatButtonModule }   from '@angular/material/button';
import { MatSelectModule }   from '@angular/material/select';
import { MatTooltipModule }  from '@angular/material/tooltip';
import { MatBadgeModule }    from '@angular/material/badge';
import {
  LucideAngularModule, Menu, Wifi, WifiOff, RefreshCw, Bell,
  LUCIDE_ICONS, LucideIconProvider,
} from 'lucide-angular';
import { WebSocketService }  from '../../core/services/websocket.service';
import { FleetService }      from '../../core/services/fleet.service';
import { AlertService }      from '../../core/services/alert.service';
import { TelemetryService }  from '../../core/services/telemetry.service';
import { TimeAgoPipe }       from '../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'helm-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    MatButtonModule,
    MatSelectModule,
    MatTooltipModule,
    MatBadgeModule,
    LucideAngularModule,
    TimeAgoPipe,
  ],
  providers: [
    {
      provide:  LUCIDE_ICONS,
      multi:    true,
      useValue: new LucideIconProvider({ Menu, Wifi, WifiOff, RefreshCw, Bell }),
    },
  ],
  templateUrl: './top-bar.component.html',
  styleUrl:    './top-bar.component.scss',
})
export class TopBarComponent {
  @Output() menuToggled      = new EventEmitter<void>();
  @Output() alertTrayToggled = new EventEmitter<void>();

  readonly wsService         = inject(WebSocketService);
  readonly fleetService      = inject(FleetService);
  readonly alertService      = inject(AlertService);
  private readonly telemetryService = inject(TelemetryService);

  // Signals exposed to template
  readonly connectionState  = this.wsService.connectionState;
  readonly selectedVehicle$ = this.fleetService.selectedVehicle$;
  readonly vehicles$        = this.fleetService.vehicles$;
  readonly alertCount       = this.alertService.unacknowledgedCount;

  private readonly latestFrames = this.telemetryService.latestFrames;

  readonly lastPing = computed((): number | null => {
    const vehicleId = this.fleetService.selectedVehicleId();
    const frame = this.latestFrames().get(vehicleId);
    return frame?.timestamp ?? null;
  });

  onVehicleChange(vehicleId: string): void {
    this.fleetService.selectVehicle(vehicleId);
  }
}
