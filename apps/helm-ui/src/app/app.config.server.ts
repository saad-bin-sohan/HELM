import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';

// On the server, Angular resolves relative /api/* URLs against the incoming
// request hostname (e.g. https://helm-ui-rl3v.onrender.com/api/vehicles).
// That loops back through Render's public load balancer — slow and broken on
// plain HTTP. This interceptor rewrites /api/* to go straight to BACKEND_URL
// (helm-server) directly from the Node.js process, bypassing the loopback.
const ssrApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api')) {
    const backend = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    return next(req.clone({ url: `${backend}${req.url}` }));
  }
  return next(req);
};

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideHttpClient(withFetch(), withInterceptors([ssrApiInterceptor])),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);