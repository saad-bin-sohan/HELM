import {
  Component,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  LucideAngularModule,
  LUCIDE_ICONS,
  LucideIconProvider,
  Menu,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-angular';

@Component({
  selector: 'helm-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, MatButtonModule, LucideAngularModule],
  providers: [
    {
      provide:  LUCIDE_ICONS,
      multi:    true,
      useValue: new LucideIconProvider({ Menu, Wifi, WifiOff, RefreshCw }),
    },
  ],
  templateUrl: './top-bar.component.html',
  styleUrl:    './top-bar.component.scss',
})
export class TopBarComponent {
  @Output() menuToggled = new EventEmitter<void>();

  // Placeholder — wired to WebSocketService in Batch 3
  readonly connectionStatus: 'live' | 'reconnecting' | 'offline' = 'live';
}
