import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts a mission startedAt timestamp to elapsed time HH:MM:SS.
 * pure: false — updates automatically as time passes.
 * Usage: {{ mission.startedAt | missionDuration }}
 */
@Pipe({
  name:       'missionDuration',
  standalone: true,
  pure:       false,
})
export class MissionDurationPipe implements PipeTransform {
  transform(startedAt: number | null | undefined): string {
    if (startedAt == null) return '--:--:--';

    const diffMs = Math.max(0, Date.now() - startedAt);
    const h      = Math.floor(diffMs / 3_600_000);
    const m      = Math.floor((diffMs % 3_600_000) / 60_000);
    const s      = Math.floor((diffMs % 60_000) / 1_000);

    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }
}
