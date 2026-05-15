import { Pipe, PipeTransform } from '@angular/core';
import type { Vehicle, VehicleStatus } from '@helm/models';

/** PRD sort order: Critical → Warning → Active → Idle → Offline */
const STATUS_ORDER: Record<VehicleStatus, number> = {
  critical: 0,
  warning:  1,
  active:   2,
  idle:     3,
  offline:  4,
};

/**
 * Pure sort pipe — returns a new array sorted by vehicle status severity.
 * Applied in the fleet page and dashboard mini panel via:
 *   @for (v of (vehicles$ | async) ?? [] | fleetStatusSort; track v.id)
 */
@Pipe({ name: 'fleetStatusSort', standalone: true, pure: true })
export class FleetStatusSortPipe implements PipeTransform {
  transform(vehicles: Vehicle[] | null | undefined): Vehicle[] {
    if (!vehicles || vehicles.length === 0) return [];
    // Spread to avoid mutating the original array from the BehaviorSubject
    return [...vehicles].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
    );
  }
}
