import { Pipe, PipeTransform } from '@angular/core';
import type { AlertableSensorKey } from '@helm/models';

type SensorKey = AlertableSensorKey | 'heading' | 'yaw' | 'missionProgress';

interface SensorFormat {
  unit:     string;
  decimals: number;
}

const FORMATS: Record<SensorKey, SensorFormat> = {
  depth:           { unit: 'm',   decimals: 1 },
  speed:           { unit: 'kn',  decimals: 1 },
  battery:         { unit: '%',   decimals: 0 },
  thrust:          { unit: '%',   decimals: 0 },
  waterTemp:       { unit: '°C',  decimals: 1 },
  pressure:        { unit: 'bar', decimals: 2 },
  roll:            { unit: '°',   decimals: 1 },
  pitch:           { unit: '°',   decimals: 1 },
  heading:         { unit: '°',   decimals: 0 },
  yaw:             { unit: '°',   decimals: 0 },
  missionProgress: { unit: '%',   decimals: 0 },
};

/**
 * Formats a raw sensor value with its appropriate unit label.
 * Usage: {{ frame.depth | nauticalUnits:'depth' }}      → "43.2 m"
 *        {{ frame.battery | nauticalUnits:'battery' }}  → "82%"
 */
@Pipe({ name: 'nauticalUnits', standalone: true })
export class NauticalUnitsPipe implements PipeTransform {
  transform(
    value:            number | null | undefined,
    sensor:           SensorKey,
    decimalsOverride?: number,
  ): string {
    if (value == null || isNaN(value)) return '—';

    const fmt      = FORMATS[sensor] ?? { unit: '', decimals: 1 };
    const decimals = decimalsOverride ?? fmt.decimals;
    const formatted = value.toFixed(decimals);

    // Percentage/degree sensors: no space before unit
    if (fmt.unit === '%' || fmt.unit === '°') {
      return `${formatted}${fmt.unit}`;
    }
    return `${formatted} ${fmt.unit}`;
  }
}
