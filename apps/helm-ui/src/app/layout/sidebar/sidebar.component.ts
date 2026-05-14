import {
  Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass }              from '@angular/common';
import { MatTooltipModule }     from '@angular/material/tooltip';
import { MatRippleModule }      from '@angular/material/core';
import { MatBadgeModule }       from '@angular/material/badge';
import {
  LucideAngularModule,
  LUCIDE_ICONS, LucideIconProvider,
  Cpu, Radar, Compass, Map, List, Settings, Bell, ChevronRight, Anchor,
} from 'lucide-angular';
import { AlertService } from '../../core/services/alert.service';

export interface NavItem {
  label:    string;
  route:    string;
  iconName: string;
  tooltip:  string;
}

@Component({
  selector: 'helm-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgClass,
    RouterLink,
    RouterLinkActive,
    MatTooltipModule,
    MatRippleModule,
    MatBadgeModule,
    LucideAngularModule,
  ],
  providers: [
    {
      provide:  LUCIDE_ICONS,
      multi:    true,
      useValue: new LucideIconProvider({
        Cpu, Radar, Compass, Map, List, Settings, Bell, ChevronRight, Anchor,
      }),
    },
  ],
  templateUrl: './sidebar.component.html',
  styleUrl:    './sidebar.component.scss',
})
export class SidebarComponent {
  @Input() expanded = false;
  @Output() toggleExpanded = new EventEmitter<void>();

  readonly alertService = inject(AlertService);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',       route: '/dashboard',        iconName: 'cpu',      tooltip: 'Telemetry Dashboard' },
    { label: 'Fleet',           route: '/fleet',            iconName: 'radar',    tooltip: 'Fleet Overview'      },
    { label: 'Mission Planner', route: '/mission-planner',  iconName: 'map',      tooltip: 'Mission Planner'     },
    { label: 'Analytics',       route: '/sensor-analytics', iconName: 'compass',  tooltip: 'Sensor Analytics'    },
    { label: 'Mission Log',     route: '/mission-log',      iconName: 'list',     tooltip: 'Mission Log'         },
    { label: 'Settings',        route: '/settings',         iconName: 'settings', tooltip: 'Settings'            },
  ];
}

