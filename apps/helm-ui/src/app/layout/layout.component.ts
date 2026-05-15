import {
  Component, signal, inject, DestroyRef, PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, AsyncPipe } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { pairwise, startWith } from 'rxjs/operators';

import { SidebarComponent }   from './sidebar/sidebar.component';
import { TopBarComponent }    from './top-bar/top-bar.component';
import { AlertTrayComponent } from '../shared/components/alert-tray/alert-tray.component';
import { FleetService }       from '../core/services/fleet.service';
import { AlertService }       from '../core/services/alert.service';
import { MissionService }     from '../core/services/mission.service';
import type { Alert } from '@helm/models';

@Component({
  selector: 'helm-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    AsyncPipe,
    SidebarComponent,
    TopBarComponent,
    AlertTrayComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  // Injecting these services here ensures they instantiate (and start their
  // WS connection + HTTP loads) when the layout mounts — before any feature
  // route renders. All three are providedIn: 'root' singletons.
  private readonly _fleet      = inject(FleetService);
  protected readonly alertService = inject(AlertService);
  private readonly _missions   = inject(MissionService);
  private readonly snackBar    = inject(MatSnackBar);
  private readonly destroyRef  = inject(DestroyRef);
  private readonly isBrowser   = isPlatformBrowser(inject(PLATFORM_ID));

  readonly sidebarExpanded = signal(false);
  readonly alertTrayOpen   = signal(false);

  constructor() {
    // Subscribe to alerts$ and show MatSnackBar for NEW critical unacknowledged alerts.
    // We compare the previous alert list to the new one and detect newly-added critical alerts.
    this.alertService.alerts$.pipe(
      startWith([] as Alert[]),
      pairwise(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(([prev, curr]) => {
      const prevIds = new Set(prev.map((a) => a.id));
      const newCritical = curr.filter(
        (a) => !prevIds.has(a.id) && a.severity === 'critical' && !a.acknowledged,
      );
      // Cap at 3 toasts queued simultaneously
      const toShow = newCritical.slice(0, 3);
      for (const alert of toShow) {
        this.snackBar.open(
          `⚠ CRITICAL: ${alert.message}`,
          'View',
          {
            duration: 6000,
            panelClass: ['snack-critical'],
          },
        );
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarExpanded.update((v) => !v);
  }

  toggleAlertTray(): void {
    this.alertTrayOpen.update((v) => !v);
  }

  protected onAcknowledge(alertId: string): void {
    this.alertService.acknowledgeAlert(alertId);
  }

  protected onAcknowledgeAll(): void {
    this.alertService.acknowledgeAll();
  }
}
