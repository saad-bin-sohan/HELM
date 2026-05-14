import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface ApiError {
  status:  number;
  message: string;
  url:     string | null;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const normalized: ApiError = {
        status:  error.status,
        message: (error.error as Record<string, unknown>)?.['error'] as string ?? error.message,
        url:     error.url,
      };
      // In Week 2, this will feed into a global toast notification service.
      // For now, just re-throw in a normalized shape.
      return throwError(() => normalized);
    }),
  );
};
