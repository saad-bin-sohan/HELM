import {
  Component, Input, Output, EventEmitter, ChangeDetectionStrategy,
} from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import { TimeAgoPipe }          from '../../pipes/time-ago.pipe';
import { NauticalUnitsPipe }    from '../../pipes/nautical-units.pipe';
import type { Vehicle, TelemetryFrame, Mission } from '@helm/models';

/**
 * A single fleet vehicle card. Works in two modes:
 *  • compact=false (default): full card for the /fleet page, shows all info
 *  • compact=true: condensed card for the dashboard sidebar mini fleet panel
 *
 * Emits (select) with vehicleId when clicked — parent decides what to do
 * (select in service, navigate to dashboard, etc.)
 *
 * Angular animation [@cardSlide] fires on :enter/:leave.
 * The parent's @for + FleetStatusSortPipe drives the reorder; as items
 * move in/out of the DOM, Angular fires enter/leave automatically.
 */
@Component({
  selector:        'helm-fleet-card',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [NgClass, DecimalPipe, StatusBadgeComponent, TimeAgoPipe, NauticalUnitsPipe],
  animations: [
    trigger('cardSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('220ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'translateY(8px)' })),
      ]),
    ]),
  ],
  templateUrl: './fleet-card.component.html',
  styleUrl:    './fleet-card.component.scss',
})
export class FleetCardComponent {
  @Input({ required: true }) vehicle!:      Vehicle;
  @Input() latestFrame:  TelemetryFrame | null = null;
  @Input() activeMission: Mission | undefined;
  @Input() isSelected  = false;
  @Input() compact     = false;
  @Output() select = new EventEmitter<string>();

  get batteryPct(): number {
    return Math.round(this.latestFrame?.battery ?? 0);
  }

  get batteryBarClass(): string {
    const pct = this.batteryPct;
    if (pct < 20) return 'bat-critical';
    if (pct < 40) return 'bat-warning';
    return 'bat-healthy';
  }

  get cardStateClass(): string {
    switch (this.vehicle.status) {
      case 'warning':  return 'state-warning';
      case 'critical': return 'state-critical';
      case 'offline':  return 'state-offline';
      default:         return '';
    }
  }

  onSelect(): void {
    this.select.emit(this.vehicle.id);
  }
}
