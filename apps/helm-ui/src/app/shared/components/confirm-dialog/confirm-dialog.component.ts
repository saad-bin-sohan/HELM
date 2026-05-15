import {
  Component, ChangeDetectionStrategy, inject, signal, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule }  from '@angular/material/button';
import { MatInputModule }   from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import {
  LucideAngularModule, LUCIDE_ICONS, LucideIconProvider,
  AlertTriangle, AlertOctagon, Info,
} from 'lucide-angular';

export interface ConfirmDialogData {
  title:               string;
  message:             string;
  confirmLabel:        string;
  cancelLabel?:        string;       // defaults to 'Cancel'
  dangerLevel:         'normal' | 'danger' | 'critical';
  requireTypedConfirm?: boolean;     // if true, user must type 'CONFIRM'
  details?:            string;       // optional secondary detail paragraph
}

@Component({
  selector: 'helm-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    LucideAngularModule,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ AlertTriangle, AlertOctagon, Info }),
    },
  ],
  template: `
    <div class="confirm-dialog" [class]="'level-' + data.dangerLevel">

      <!-- Icon + title -->
      <div class="dialog-header">
        @switch (data.dangerLevel) {
          @case ('critical') {
            <lucide-angular name="alert-octagon" [size]="20" class="dialog-icon icon-critical" />
          }
          @case ('danger') {
            <lucide-angular name="alert-triangle" [size]="20" class="dialog-icon icon-danger" />
          }
          @default {
            <lucide-angular name="info" [size]="20" class="dialog-icon icon-info" />
          }
        }
        <h2 mat-dialog-title class="dialog-title font-display">{{ data.title }}</h2>
      </div>

      <mat-dialog-content class="dialog-content">
        <p class="dialog-message">{{ data.message }}</p>
        @if (data.details) {
          <p class="dialog-details">{{ data.details }}</p>
        }

        <!-- Type-to-confirm input — only shown for critical commands -->
        @if (data.requireTypedConfirm) {
          <div class="confirm-type-section">
            <p class="confirm-instruction font-mono">
              Type <strong>CONFIRM</strong> to proceed:
            </p>
            <mat-form-field appearance="outline" class="confirm-input-field">
              <input
                matInput
                [ngModel]="confirmText()"
                (ngModelChange)="confirmText.set($event)"
                placeholder="CONFIRM"
                autocomplete="off"
                spellcheck="false"
                class="font-mono"
              />
            </mat-form-field>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions class="dialog-actions" align="end">
        <button
          mat-button
          class="cancel-btn"
          (click)="dialogRef.close(false)"
        >
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          mat-flat-button
          class="confirm-btn"
          [class.btn-danger]="data.dangerLevel === 'danger'"
          [class.btn-critical]="data.dangerLevel === 'critical'"
          [disabled]="!canConfirm()"
          (click)="dialogRef.close(true)"
        >
          {{ data.confirmLabel }}
        </button>
      </mat-dialog-actions>

    </div>
  `,
  styles: [`
    .confirm-dialog {
      background: var(--color-surface-panel);
      border-radius: var(--radius-lg);
      min-width: 380px;
      max-width: 480px;
      border: 1px solid var(--color-border);

      &.level-danger  { border-color: var(--color-warning-dim); }
      &.level-critical { border-color: var(--color-critical-dim); }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 24px 0;
    }

    .dialog-icon {
      flex-shrink: 0;
      &.icon-critical { color: var(--color-critical); }
      &.icon-danger   { color: var(--color-warning);  }
      &.icon-info     { color: var(--color-accent);   }
    }

    .dialog-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }

    .dialog-content {
      padding: 12px 24px 8px !important;
    }

    .dialog-message {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin: 0 0 8px;
    }

    .dialog-details {
      font-size: 0.8125rem;
      color: var(--color-text-disabled);
      line-height: 1.5;
      margin: 0;
    }

    .confirm-type-section {
      margin-top: 16px;
    }

    .confirm-instruction {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin: 0 0 8px;

      strong {
        color: var(--color-critical);
        font-family: var(--font-mono);
      }
    }

    .confirm-input-field {
      width: 100%;
    }

    .dialog-actions {
      padding: 8px 24px 20px !important;
      gap: 8px;
    }

    .cancel-btn {
      color: var(--color-text-secondary);
      &:hover { color: var(--color-text-primary); }
    }

    .confirm-btn {
      background: var(--color-accent);
      color: var(--color-surface-base);
      font-weight: 600;

      &.btn-danger   { background: var(--color-warning);  color: var(--color-surface-base); }
      &.btn-critical { background: var(--color-critical);  color: #fff; }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  `],
})
export class ConfirmDialogComponent {
  protected readonly data      = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);

  protected confirmText = signal('');

  protected readonly canConfirm = computed(() =>
    !this.data.requireTypedConfirm || this.confirmText() === 'CONFIRM',
  );
}
