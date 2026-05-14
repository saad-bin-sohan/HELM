import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopBarComponent }  from './top-bar/top-bar.component';
import { FleetService }     from '../core/services/fleet.service';
import { AlertService }     from '../core/services/alert.service';
import { MissionService }   from '../core/services/mission.service';

@Component({
  selector: 'helm-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopBarComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  // Injecting these services here ensures they instantiate (and start their
  // WS connection + HTTP loads) when the layout mounts — before any feature
  // route renders. All three are providedIn: 'root' singletons.
  private readonly _fleet    = inject(FleetService);
  private readonly _alerts   = inject(AlertService);
  private readonly _missions = inject(MissionService);

  readonly sidebarExpanded = signal(false);

  toggleSidebar(): void {
    this.sidebarExpanded.update((v) => !v);
  }
}

