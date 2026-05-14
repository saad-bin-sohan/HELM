import { HttpInterceptorFn, HttpEventType } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const start = performance.now();

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const ms = (performance.now() - start).toFixed(0);
          console.debug(
            `[HTTP] ${req.method} ${req.urlWithParams} → ${event.status} (${ms}ms)`,
          );
        }
      },
      error: (err) => {
        const ms = (performance.now() - start).toFixed(0);
        console.error(
          `[HTTP] ${req.method} ${req.urlWithParams} → ERROR (${ms}ms)`,
          err,
        );
      },
    }),
  );
};
