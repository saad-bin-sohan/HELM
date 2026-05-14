import { Pipe, PipeTransform } from '@angular/core';
import type { TelemetryFrame } from '@helm/models';

/**
 * Extracts a single numeric field from an array of TelemetryFrames.
 * Used by the sparkline channels in the dashboard.
 * Usage: {{ buffer | frameValues:'depth' }}  → number[]
 */
@Pipe({ name: 'frameValues', standalone: true, pure: true })
export class FrameValuesPipe implements PipeTransform {
  transform(frames: TelemetryFrame[] | null | undefined, field: keyof TelemetryFrame): number[] {
    if (!frames || frames.length === 0) return [];
    return frames
      .map((f) => f[field] as number)
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));
  }
}
