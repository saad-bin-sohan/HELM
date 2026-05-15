import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  signal, computed, OnChanges, SimpleChanges,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule }  from '@angular/material/button';
import { MatSelectModule }  from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { trigger, transition, style, animate } from '@angular/animations';
import {
  LucideAngularModule, LUCIDE_ICONS, LucideIconProvider,
  X, BellOff, CheckCheck, Filter,
} from 'lucide-angular';

import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import type { Alert, AlertSeverity } from '@helm/models';

@Component({
  selector: 'helm-alert-tray',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatSelectModule,
    MatTooltipModule,
    LucideAngularModule,
    TimeAgoPipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ X, BellOff, CheckCheck, Filter }),
    },
  ],
  animations: [
    trigger('traySlide', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('280ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('220ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ transform: 'translateX(100%)', opacity: 0 })),
      ]),
    ]),
    trigger('alertEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('180ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('140ms ease-in', style({ opacity: 0, transform: 'translateY(-4px)' })),
      ]),
    ]),
  ],
  templateUrl: './alert-tray.component.html',
  styleUrl: './alert-tray.component.scss',
})
export class AlertTrayComponent implements OnChanges {
  @Input() open    = false;
  @Input() alerts: Alert[] = [];
  @Output() acknowledge    = new EventEmitter<string>();   // alertId
  @Output() acknowledgeAll = new EventEmitter<void>();
  @Output() close          = new EventEmitter<void>();

  readonly filterSeverity = signal<AlertSeverity | 'all'>('all');
  readonly filterVehicle  = signal<string>('all');

  protected readonly severityOptions: { value: AlertSeverity | 'all'; label: string }[] = [
    { value: 'all',      label: 'ALL'      },
    { value: 'warning',  label: 'WARNING'  },
    { value: 'critical', label: 'CRITICAL' },
  ];

  // Derived list of unique vehicleIds for the vehicle filter dropdown
  readonly vehicleIds = computed(() => {
    const ids = [...new Set(this.alerts.map((a) => a.vehicleId))];
    return ids;
  });

  readonly unacknowledgedCount = computed(() =>
    this.alerts.filter((a) => !a.acknowledged && !a.resolvedAt).length,
  );

  readonly filteredAlerts = computed(() => {
    let list = [...this.alerts];
    const sev = this.filterSeverity();
    const veh = this.filterVehicle();
    if (sev !== 'all') list = list.filter((a) => a.severity === sev);
    if (veh !== 'all') list = list.filter((a) => a.vehicleId === veh);
    // Sort: unacknowledged + unresolved first, then by timestamp desc
    return list.sort((a, b) => {
      const aActive = !a.acknowledged && !a.resolvedAt ? 0 : 1;
      const bActive = !b.acknowledged && !b.resolvedAt ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return b.timestamp - a.timestamp;
    });
  });

  ngOnChanges(changes: SimpleChanges): void {
    // Reset vehicle filter if alerts list changes and selected vehicle no longer has alerts
    if (changes['alerts']) {
      const ids = new Set(this.alerts.map((a) => a.vehicleId));
      if (this.filterVehicle() !== 'all' && !ids.has(this.filterVehicle())) {
        this.filterVehicle.set('all');
      }
    }
  }

  protected severityLabel(sev: AlertSeverity | 'all'): string {
    return sev === 'all' ? 'ALL' : sev.toUpperCase();
  }

  protected severityClass(alert: Alert): string {
    if (alert.resolvedAt) return 'alert-resolved';
    return `alert-${alert.severity}`;
  }
}
