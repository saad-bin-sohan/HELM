import {
  Directive, ElementRef, HostListener, inject, Input, OnChanges,
} from '@angular/core';

/**
 * Auto-scrolls a scrollable container to the bottom whenever content changes.
 * Respects user scroll position — if the user has scrolled up, auto-scroll pauses.
 * When user scrolls back to bottom, auto-scroll resumes.
 *
 * Usage:
 *   <div helmAutoScroll [scrollTrigger]="events.length">...</div>
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

  private userScrolledUp = false;

  @HostListener('scroll')
  onScroll(): void {
    const el = this.el.nativeElement;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    this.userScrolledUp = distanceFromBottom > this.scrollThreshold;
  }

  ngOnChanges(): void {
    if (!this.userScrolledUp) {
      // Run after the DOM update in the next microtask
      Promise.resolve().then(() => this.scrollToBottom());
    }
  }

  scrollToBottom(): void {
    const el = this.el.nativeElement;
    el.scrollTop = el.scrollHeight;
  }
}
