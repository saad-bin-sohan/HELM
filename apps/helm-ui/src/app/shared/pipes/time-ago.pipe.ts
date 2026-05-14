import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts a Unix ms timestamp to a human-readable "time ago" string.
 * pure: false — output changes over time even when input doesn't.
 * Used by: fleet cards, mission log, alert tray, top-bar connection chip.
 */
@Pipe({
  name:       'timeAgo',
  standalone: true,
  pure:       false, // Must re-evaluate every change detection cycle
})
export class TimeAgoPipe implements PipeTransform {
  transform(timestamp: number | null | undefined): string {
    if (timestamp == null || timestamp === 0) return '—';

    const diffMs = Date.now() - timestamp;
    const diffS  = Math.floor(diffMs / 1_000);

    if (diffS <  2)    return 'just now';
    if (diffS < 60)    return `${diffS}s ago`;
    if (diffS < 3_600) return `${Math.floor(diffS / 60)}m ago`;

    const h = Math.floor(diffS / 3_600);
    if (h > 12) return 'long ago';
    return `${h}h ago`;
  }
}
