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
      // Normalize API errors so callers receive a predictable shape.
      return throwError(() => normalized);
    }),
  );
};
