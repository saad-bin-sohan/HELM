import { CanDeactivateFn } from '@angular/router';
import { MissionPlannerComponent } from './mission-planner.component';

/**
 * Prevents navigation away from MissionPlannerComponent when the form is dirty.
 * Uses browser's native confirm() dialog — adequate for this portfolio context.
 * The component exposes a public `isDirty` signal that this guard reads.
 */
export const unsavedChangesGuard: CanDeactivateFn<MissionPlannerComponent> = (
  component: MissionPlannerComponent,
): boolean => {
  if (!component.isDirty()) {
    return true;
  }
  return confirm('You have unsaved changes in the Mission Planner. Leave anyway?');
};
