import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopBarComponent } from './top-bar/top-bar.component';

@Component({
  selector: 'helm-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopBarComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly sidebarExpanded = signal(false);

  toggleSidebar(): void {
    this.sidebarExpanded.update((v) => !v);
  }
}
