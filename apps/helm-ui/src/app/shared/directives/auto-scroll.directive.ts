import {
  Directive, ElementRef, EventEmitter, HostListener,
  inject, Input, OnChanges, Output,
} from '@angular/core';

/**
 * Auto-scrolls a scrollable container to the bottom whenever content changes.
 * Respects user scroll position — if the user has scrolled up, auto-scroll pauses.
 * Emits (scrolledUp) so the host component can show a "Jump to now" button.
 * Accepts [paused] to suppress auto-scroll during replay.
 *
 * Usage:
 *   <div helmAutoScroll
 *        [scrollTrigger]="events.length"
 *        [paused]="replayActive()"
 *        (scrolledUp)="showJumpToNow.set($event)">
 *   </div>
 */
@Directive({
  selector:   '[helmAutoScroll]',
  standalone: true,
})
export class AutoScrollDirective implements OnChanges {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bind to anything that changes when new content is added (e.g., array.length). */
  @Input() scrollTrigger: unknown = null;

  /** How close to the bottom (px) counts as "at the bottom". */
  @Input() scrollThreshold = 40;

  /**
   * When true, auto-scroll is suppressed regardless of userScrolledUp state.
   * Intended for replay mode where the scrubber controls scroll position.
   */
  @Input() paused = false;

  /**
   * Emits true when the user manually scrolls up (auto-scroll paused).
   * Emits false when the user scrolls back to the bottom (auto-scroll resumed).
   * Only emits on state CHANGE, not on every scroll event.
   */
  @Output() readonly scrolledUp = new EventEmitter<boolean>();

  private userScrolledUp = false;

  @HostListener('scroll')
  onScroll(): void {
    const el = this.el.nativeElement;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const nowScrolledUp = distanceFromBottom > this.scrollThreshold;
    if (nowScrolledUp !== this.userScrolledUp) {
      this.userScrolledUp = nowScrolledUp;
      this.scrolledUp.emit(this.userScrolledUp);
    }
  }

  ngOnChanges(): void {
    if (!this.userScrolledUp && !this.paused) {
      // Run after the DOM update in the next microtask
      Promise.resolve().then(() => this.scrollToBottom());
    }
  }

  /** Programmatically scroll to bottom and reset the userScrolledUp flag. */
  resumeAutoScroll(): void {
    this.userScrolledUp = false;
    this.scrollToBottom();
    // Also notify any host listening to (scrolledUp)
    this.scrolledUp.emit(false);
  }

  scrollToBottom(): void {
    const el = this.el.nativeElement;
    el.scrollTop = el.scrollHeight;
  }
}
