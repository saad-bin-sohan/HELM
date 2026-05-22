# Contributing to HELM

Thank you for your interest in HELM. This document covers the monorepo
structure, development workflow, and conventions used in the project.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20.x LTS | Required for NX, Angular, and the server |
| pnpm | latest | `npm install -g pnpm` |
| Docker | 24+ | Optional — only needed for containerised dev |

## Repository Structure

```
helm/                            ← NX workspace root
├── apps/
│   ├── helm-ui/                 ← Angular 21.2 SSR application
│   │   └── src/app/
│   │       ├── core/services/   ← WebSocket, Telemetry, Fleet, Mission,
│   │       │                       Alert, Command services (all @Injectable)
│   │       ├── shared/          ← Components, directives, pipes
│   │       └── features/        ← Six lazy-loaded feature routes
│   └── helm-server/             ← Node.js + Express + ws simulation backend
│       └── src/
│           ├── simulator/       ← Physics engine + fault injection
│           └── routes/          ← REST endpoints (vehicles, missions, alerts)
└── libs/
    └── shared-types/            ← @helm/models and @helm/shared-types
                                    Single source of truth for TypeScript
                                    interfaces shared by UI and server
```

## Getting Started (Local, no Docker)

```bash
# Clone and install
git clone https://github.com/YOUR_GITHUB_USERNAME/HELM_Hardware-Environment-Live-Monitor.git
cd HELM_Hardware-Environment-Live-Monitor
pnpm install

# Start both apps in parallel
npx nx run-many --target=serve --projects=helm-server,helm-ui --parallel
```

Open `http://localhost:4200` for the Angular dev server. The Docker
development stack serves the SSR build at `http://localhost:4000`.

## Key Conventions

### Angular patterns

HELM uses Angular 21's modern patterns throughout. Every component must:

- Declare `standalone: true` — no NgModules anywhere
- Use `ChangeDetectionStrategy.OnPush`
- Use `takeUntilDestroyed()` or `async` pipe for all subscriptions —
  never `.unsubscribe()` manually
- Guard any browser API (WebSocket, localStorage, AudioContext, canvas,
  document) behind `isPlatformBrowser(PLATFORM_ID)` or `afterNextRender()`
- Never inject or reference `NgZone` — the app uses `provideZonelessChangeDetection()`

### TypeScript

- Zero `any` types — use `unknown` and narrow properly
- No `@ts-ignore` or `@ts-expect-error` suppressions
- All shared interfaces live in `libs/shared-types/src/` and are imported
  via `@helm/models` or `@helm/shared-types` path aliases

### Commit style

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(feature-name): short description of what was added
fix(service): what was broken and what fixed it
test(alert-service): what new tests cover
docs(readme): what was updated
refactor(telemetry): what was restructured
```

### NX commands

```bash
# Serve
npx nx serve helm-ui          # Angular dev server
npx nx serve helm-server      # Node.js server with watch

# Build
npx nx build helm-ui --configuration=production
npx nx build helm-server --configuration=production

# Test
npx nx test helm-ui --coverage

# Lint
npx nx lint helm-ui
npx nx eslint:lint helm-server
```

## Adding a New Feature

1. Create the feature folder under `apps/helm-ui/src/app/features/`
2. Add a lazy-loaded route in `app.routes.ts` with a `title: 'Feature — HELM'`
3. Register the server route in `app.routes.server.ts` with `RenderMode.Server`
4. If you add new shared TypeScript interfaces, add them to `libs/shared-types/src/`
   and re-export from `libs/shared-types/src/index.ts`

## Docker

See `docker-compose.yml` for the development stack and `docker-compose.prod.yml`
for the production stack with nginx. The `Makefile` provides convenience
shortcuts such as `make dev`, `make prod`, `make logs`, and `make clean`.
