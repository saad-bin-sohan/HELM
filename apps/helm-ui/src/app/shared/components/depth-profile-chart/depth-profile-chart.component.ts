import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef, inject, HostListener,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { Waypoint } from '@helm/models';

interface DragState {
  active:       boolean;
  barIndex:     number;
  startY:       number;
  startDepth:   number;
}

const MAX_DEPTH = 150;   // SVG maps 0..MAX_DEPTH meters to full chart height
const CHART_H   = 120;   // px — fixed SVG height
const BAR_W     = 28;    // px per bar
const BAR_GAP   = 8;     // px between bars
const LABEL_H   = 20;    // px for bottom label row

@Component({
  selector: 'helm-depth-profile-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="dpc-wrapper">
      <div class="dpc-label">Depth Profile</div>
      @if (waypoints.length === 0) {
        <div class="dpc-empty font-mono">No waypoints — click the map to add.</div>
      } @else {
        <svg
          class="dpc-svg"
          [attr.width]="svgWidth"
          [attr.height]="CHART_H + LABEL_H"
          [attr.viewBox]="'0 0 ' + svgWidth + ' ' + (CHART_H + LABEL_H)">

          <!-- Depth zone bands (background) -->
          <rect x="0" [attr.y]="0" [attr.width]="svgWidth" [attr.height]="depthToY(50)"
                fill="rgba(16,185,129,0.05)" />
          <rect x="0" [attr.y]="depthToY(50)" [attr.width]="svgWidth" [attr.height]="depthToY(80) - depthToY(50)"
                fill="rgba(245,158,11,0.05)" />
          <rect x="0" [attr.y]="depthToY(80)" [attr.width]="svgWidth" [attr.height]="CHART_H - depthToY(80)"
                fill="rgba(239,68,68,0.05)" />

          <!-- Depth guide lines -->
          <line x1="0" [attr.x2]="svgWidth" [attr.y1]="depthToY(50)" [attr.y2]="depthToY(50)"
                stroke="rgba(245,158,11,0.3)" stroke-width="1" stroke-dasharray="4,4"/>
          <line x1="0" [attr.x2]="svgWidth" [attr.y1]="depthToY(80)" [attr.y2]="depthToY(80)"
                stroke="rgba(239,68,68,0.3)" stroke-width="1" stroke-dasharray="4,4"/>

          <!-- Depth bars -->
          @for (wp of waypoints; track wp.index; let i = $index) {
            <g [attr.transform]="'translate(' + barX(i) + ',0)'"
               class="dpc-bar-group"
               [class.dpc-dragging]="drag.active && drag.barIndex === i">

              <!-- Bar body — grows from top (depth=0) downward -->
              <rect
                class="dpc-bar"
                [attr.x]="0"
                [attr.y]="0"
                [attr.width]="BAR_W"
                [attr.height]="depthToY(wp.targetDepth)"
                [attr.fill]="barColor(wp.targetDepth)"
                [attr.opacity]="drag.active && drag.barIndex === i ? 0.9 : 0.75"
                rx="2"
                (mousedown)="onBarMouseDown($event, i)"
                style="cursor: ns-resize;" />

              <!-- Depth value label on bar -->
              <text
                [attr.x]="BAR_W / 2"
                [attr.y]="depthToY(wp.targetDepth) - 4"
                text-anchor="middle"
                class="dpc-depth-label font-mono"
                [attr.fill]="barColor(wp.targetDepth)"
                font-size="9">
                {{ wp.targetDepth | number:'1.0-0' }}m
              </text>

              <!-- Waypoint index label below chart -->
              <text
                [attr.x]="BAR_W / 2"
                [attr.y]="CHART_H + 14"
                text-anchor="middle"
                class="dpc-index-label font-mono"
                fill="var(--color-text-secondary)"
                font-size="9">
                WP{{ i + 1 }}
              </text>
            </g>
          }
        </svg>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .dpc-wrapper {
      padding: 8px 0 4px;
    }
    .dpc-label {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .dpc-empty {
      font-size: 11px;
      color: var(--color-text-disabled);
      padding: 8px 0;
    }
    .dpc-svg {
      display: block;
      overflow: visible;
      user-select: none;
    }
    .dpc-bar {
      transition: height 120ms ease, y 120ms ease;
    }
    .dpc-bar-group.dpc-dragging .dpc-bar {
      transition: none;
    }
  `],
})
export class DepthProfileChartComponent implements OnChanges {
  @Input() waypoints: Waypoint[] = [];
  @Output() depthChange = new EventEmitter<{ index: number; depth: number }>();

  private readonly cdr = inject(ChangeDetectorRef);

  // Expose constants to template
  protected readonly CHART_H   = CHART_H;
  protected readonly BAR_W     = BAR_W;

  protected drag: DragState = {
    active: false, barIndex: -1, startY: 0, startDepth: 0,
  };

  protected get svgWidth(): number {
    return Math.max(1, this.waypoints.length) * (BAR_W + BAR_GAP) - BAR_GAP + 4;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.cdr.markForCheck();
  }

  protected barX(index: number): number {
    return index * (BAR_W + BAR_GAP);
  }

  /**
   * Maps a depth value (0..MAX_DEPTH meters) to a Y pixel position.
   * Y=0 is the surface (depth=0); Y=CHART_H is max depth.
   */
  protected depthToY(depth: number): number {
    const clamped = Math.max(0, Math.min(depth, MAX_DEPTH));
    return (clamped / MAX_DEPTH) * CHART_H;
  }

  protected barColor(depth: number): string {
    if (depth > 80) return 'var(--color-critical)';
    if (depth > 50) return 'var(--color-warning)';
    return 'var(--color-healthy)';
  }

  protected onBarMouseDown(event: MouseEvent, barIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    const wp = this.waypoints[barIndex];
    if (!wp) return;
    this.drag = {
      active:     true,
      barIndex,
      startY:     event.clientY,
      startDepth: wp.targetDepth,
    };
  }

  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(event: MouseEvent): void {
    if (!this.drag.active) return;
    const deltaY = event.clientY - this.drag.startY;
    // Each pixel of vertical drag = (MAX_DEPTH / CHART_H) meters
    const depthDelta = (deltaY / CHART_H) * MAX_DEPTH;
    const newDepth = Math.round(
      Math.max(1, Math.min(MAX_DEPTH, this.drag.startDepth + depthDelta)),
    );
    this.depthChange.emit({ index: this.drag.barIndex, depth: newDepth });
    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    if (this.drag.active) {
      this.drag = { active: false, barIndex: -1, startY: 0, startDepth: 0 };
      this.cdr.markForCheck();
    }
  }
}
