<div align="center">

```
██╗  ██╗███████╗██╗     ███╗   ███╗
██║  ██║██╔════╝██║     ████╗ ████║
███████║█████╗  ██║     ██╔████╔██║
██╔══██║██╔══╝  ██║     ██║╚██╔╝██║
██║  ██║███████╗███████╗██║ ╚═╝ ██║
╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝
```
### Hardware Environment Live Monitor

**Production-grade operator control interface for autonomous marine vehicle fleets.**<br/>
Real-time telemetry · Mission planning · Alert management · Full-stack with SSR

[![CI](https://github.com/saad-bin-sohan/HELM_Hardware-Environment-Live-Monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/saad-bin-sohan/HELM_Hardware-Environment-Live-Monitor/actions/workflows/ci.yml)
[![Angular](https://img.shields.io/badge/Angular-21.2-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![NX](https://img.shields.io/badge/NX-22.7-143055?logo=nx&logoColor=white)](https://nx.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[🔗 **Live Demo**](https://helm.railway.app) · [📖 Architecture](#architecture) · [🚀 Quick Start](#quick-start)

</div>

## 🎬 Live Demo

> **[→ Open Live Demo](https://helm.railway.app)**
>
> The simulation server runs continuously — telemetry updates at 4 Hz.
> The first seeded fault window starts around 45–97 seconds after boot,
> then later faults inject every ~60–120 seconds. Alerts fire automatically.
> No login required.

<!-- Replace with actual GIF recorded with Kap (macOS) or LICEcap (Windows) -->
<!-- Suggested sequence: Fleet → select ROV-02 → dashboard live update →
     depth warning/critical alert fires → acknowledge → mission planner → send command -->
![HELM Demo GIF](docs/assets/helm-demo.gif)

> *15-second walkthrough: fleet overview → live telemetry → alert triage → mission planning*

## 📸 Features

<table>
  <tr>
    <td align="center">
      <img src="docs/assets/screenshot-dashboard.png" alt="Dashboard" width="400"/><br/>
      <b>Real-Time Dashboard</b><br/>
      <sub>Metric cards · Sparklines · Orientation cube · Command panel</sub>
    </td>
    <td align="center">
      <img src="docs/assets/screenshot-fleet.png" alt="Fleet" width="400"/><br/>
      <b>Fleet Overview</b><br/>
      <sub>Status-sorted cards · Health summary · Live status badges</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/assets/screenshot-mission-planner.png" alt="Mission Planner" width="400"/><br/>
      <b>Mission Planner</b><br/>
      <sub>Leaflet map · Drag-and-drop waypoints · CDK DnD reorder</sub>
    </td>
    <td align="center">
      <img src="docs/assets/screenshot-sensor-analytics.png" alt="Sensor Analytics" width="400"/><br/>
      <b>Sensor Analytics</b><br/>
      <sub>Chart.js real-time charts · Historical mode · CSV export</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/assets/screenshot-alerts.png" alt="Alert System" width="400"/><br/>
      <b>Alert System</b><br/>
      <sub>Threshold-based · Severity tray · Audio beep · Acknowledge</sub>
    </td>
    <td align="center">
      <img src="docs/assets/screenshot-mission-log.png" alt="Mission Log" width="400"/><br/>
      <b>Mission Log</b><br/>
      <sub>Event timeline · Replay scrubber · JSON export</sub>
    </td>
  </tr>
</table>

> 📷 *Screenshots taken from the live demo. Add yours in `docs/assets/` and update these paths.*

## 🧭 Overview

HELM is a full-stack, production-hardened operator control interface for
fleets of autonomous marine vehicles (AUVs, ROVs, ASVs). It demonstrates
a modern Angular 21 architecture at scale — server-side rendering, zoneless
change detection, reactive Signals, and real-time WebSocket telemetry
running inside a containerised NX monorepo.

The backend simulates three vehicles with realistic physics, fault injection,
and mission execution. Every system you'd find in a real operator interface
is represented: threshold alerting, mission planning, sensor analytics with
historical playback, command dispatch with safety confirmations, and a
camera feed architecture placeholder.

**This is a portfolio project demonstrating engineering maturity, not a toy demo.**
The code is structured the same way you would architect a system that
actually controls hardware.

## 🏗️ Architecture

```
                      ┌─────────────────────────────────────────────┐
                      │              Browser (Client)                │
                      │  Angular 21 SPA · Signals · RxJS · Leaflet  │
                      └──────────────┬───────────────┬──────────────┘
                                     │ HTTP/HTTPS     │ WebSocket
                                     ▼               ▼
                      ┌─────────────────────────────────────────────┐
                      │                nginx  (:80)                 │
                      │  reverse proxy · gzip · asset caching      │
                      │  /api/** → Node.js API                     │
                      │  /ws     → Node.js WS (Upgrade header)     │
                      │  /*      → Angular SSR                     │
                      └────────────┬─────────────────┬─────────────┘
                                   │                 │
              ┌────────────────────▼───┐  ┌──────────▼──────────────┐
              │  Angular SSR  (:4000)  │  │  Node.js API  (:3000)   │
              │  Express + Angular     │  │  Express + WebSocket    │
              │  AngularNodeAppEngine  │  │  SimulatorEngine 4 Hz   │
              │  Hydration + event     │  │  Fault injection system │
              │  replay                │  │  REST: vehicles,        │
              │  /api proxy→ Node.js   │  │  missions, alerts       │
              └────────────────────────┘  └─────────────────────────┘
```

### State Management Strategy

HELM uses **Signals for synchronous state** and **RxJS for async data streams**
— each tool used for exactly what it excels at:

| Layer | Tool | Why |
|-------|------|-----|
| WebSocket message stream | `Subject<WsMessage>` (RxJS) | Push-based, hot observable — multiple services consume the same stream |
| Per-vehicle telemetry buffer | `scan()` + `shareReplay(1)` (RxJS) | Bounded rolling window with incremental append and slice; shared across chart consumers |
| Latest frame per vehicle | `toSignal(scan(...))` (Signal) | Synchronous read inside `computed()` and `effect()` — Signal reactivity model |
| Vehicle status derivation | `computed(() => ...)` + `effect()` (Signal) | Fleet health is derived from the vehicles Signal; status updates are driven by `latestFrames` |
| Selected vehicle | `signal<string>('')` | Simple writeable state — no Observable needed |
| Alert badge count | `signal<number>(0)` | Updated imperatively by `AlertService.syncBadgeCount()` |
| Offline vehicle detection | `interval(5000)` (RxJS) | Periodic poll — natural fit for intervals |
| Threshold custom config | `signal<Partial<...>>({})` | Settings page writes; AlertService reads in `getThreshold()` |

### Monorepo Structure

```
helm/                                   ← NX 22.7 workspace (pnpm)
├── apps/
│   ├── helm-ui/                        ← Angular 21.2 SSR application
│   │   └── src/
│   │       ├── app/
│   │       │   ├── core/services/      ← WebSocketService, TelemetryService,
│   │       │   │                          FleetService, MissionService,
│   │       │   │                          AlertService, CommandService
│   │       │   ├── core/interceptors/  ← loggingInterceptor, errorInterceptor
│   │       │   ├── shared/
│   │       │   │   ├── components/     ← MetricCard, Gauge, Sparkline,
│   │       │   │   │                      OrientationDisplay, StatusBadge,
│   │       │   │   │                      AlertTray, CommandPanel, FleetCard,
│   │       │   │   │                      TelemetryChart, DepthProfileChart,
│   │       │   │   │                      ConfirmDialog
│   │       │   │   ├── directives/     ← ThresholdColor, AutoScroll
│   │       │   │   └── pipes/          ← NauticalUnits, TimeAgo,
│   │       │   │                          MissionDuration, FrameValues,
│   │       │   │                          FleetStatusSort
│   │       │   └── features/           ← 6 lazy-loaded routes
│   │       │       ├── dashboard/
│   │       │       ├── fleet/
│   │       │       ├── mission-planner/
│   │       │       ├── sensor-analytics/
│   │       │       ├── mission-log/
│   │       │       └── settings/
│   │       ├── environments/           ← dev / staging / prod placeholder injection
│   │       └── server.ts               ← Angular SSR + Express + /api proxy
│   └── helm-server/                    ← Node.js simulation backend
│       └── src/
│           ├── simulator/
│           │   ├── engine.ts           ← 4 Hz tick loop, fault injection, WS broadcast
│           │   ├── physics.ts          ← heading, GPS, pressure, thermocline math
│           │   └── config.ts           ← 3 vehicle configs, mission seeds, thresholds
│           ├── routes/                 ← /api/vehicles, /api/missions, /api/alerts
│           ├── data-store.ts           ← In-memory vehicle/mission/alert store
│           └── main.ts                 ← Express + WebSocketServer bootstrap
└── libs/
    └── shared-types/                   ← @helm/models · @helm/shared-types
        └── src/                           Single source of truth for both apps
            ├── vehicle.model.ts
            ├── telemetry.model.ts
            ├── mission.model.ts
            ├── alert.model.ts
            ├── command.model.ts
            └── websocket.model.ts
```

## ⚡ Angular 21 Techniques Showcase

This table is written for engineering interviewers and senior reviewers.
Each entry shows what the technique is, where it's used in HELM, and why
the choice matters.

| Technique | Where Used | Why It Matters |
|-----------|-----------|----------------|
| **`provideZonelessChangeDetection()`** | `app.config.ts` | Removes Zone.js entirely. No monkey-patching, no `setTimeout` overhead. SSR renders without Zone-related hydration conflicts. Combined with OnPush, CD runs on explicit Angular reactivity rather than Zone task interception. |
| **`ChangeDetectionStrategy.OnPush`** | Every component | Without Zone.js, components should re-render only when their inputs change or a Signal/Observable they read emits. |
| **`signal()` + `computed()` + `effect()`** | `FleetService`, `AlertService`, `SensorAnalyticsComponent`, `MissionLogComponent` | `latestFrames` is a `Signal<ReadonlyMap<string, TelemetryFrame>>`; `FleetService.healthSummary` is a `computed()` over vehicle state; status effects react to telemetry without manual component subscriptions. |
| **`toSignal()` / `toObservable()`** | `TelemetryService.latestFrames`, `FleetService.selectedVehicle$`, feature view models | Bridges RxJS streams (HTTP, WS, reactive forms) into synchronous Signal reads and back into Observable pipelines where templates use `async`. |
| **`takeUntilDestroyed(destroyRef)`** | Services and components with subscriptions | Declarative subscription teardown. `DestroyRef` is injected explicitly in services and components that subscribe from methods outside constructor context, such as `MissionService.loadMissions()` and mission planner save flows. |
| **`RenderMode.Server`** | `app.routes.server.ts` (root, six features, wildcard) | Angular 21 `@angular/ssr` built-in. Every application route server-renders full HTML on first load. |
| **`provideClientHydration(withEventReplay())`** | `app.config.ts` | After SSR sends HTML, the browser replays events that fired before hydration completed. Clicks and form inputs are not lost during the hydration window. |
| **`afterNextRender()`** | `MissionPlannerComponent`, `TelemetryChartComponent` | Safe browser-only initialization for Leaflet and Chart.js after the DOM is painted. Leaflet and canvas APIs never run during server render. |
| **`isPlatformBrowser(PLATFORM_ID)`** | `WebSocketService`, `AlertService`, `FleetService`, export flows | Guards `new WebSocket()`, `new AudioContext()`, `localStorage`, timers, `document`, clipboard, and blob downloads from running during SSR. |
| **`untracked()`** | `FleetService` and `SensorAnalyticsComponent` effects | Reads imperative state inside an effect without creating unintended reactive dependencies. This prevents feedback loops when telemetry drives derived state updates. |
| **Lazy-loaded routes** | `app.routes.ts` — all 6 features | Each feature is a separate dynamic `import()`. The initial route tree loads the layout and core providers first, then fetches feature code on navigation. |
| **`scan()` rolling buffer** | `TelemetryService.telemetryBuffer$()` | Maintains a bounded telemetry frame buffer per vehicle. Frames append incrementally and are sliced to the configured limit to avoid unbounded memory growth. |
| **`provideAnimationsAsync()`** | `app.config.ts` | Defers the Angular animations module until it is needed by Material/CDK-backed UI. |
| **NX Monorepo with path aliases** | `tsconfig.base.json` | `@helm/models` and `@helm/shared-types` resolve to `libs/shared-types/src/index.ts`. Server and UI share one type definition. |
| **WebSocket exponential backoff** | `WebSocketService` | Reconnect delay: `min(1000 × 2^attempt, 30000)`. First retry at 1s, capped at 30s. Heartbeat timeout (10s of silence) marks the connection as reconnecting independently of socket close events. |
| **`share()` on hot WS streams** | `TelemetryService` | `allVehicleTelemetry$` and `events$` are filtered once and shared by AlertService, FleetService, charts, logs, and dashboards. |

## 🚀 Quick Start

### Option A — Docker (one command)

```bash
# Clone
git clone https://github.com/saad-bin-sohan/HELM_Hardware-Environment-Live-Monitor.git
cd HELM_Hardware-Environment-Live-Monitor

# Development stack: Angular SSR on :4000, Node API on :3000
docker compose up

# OR production stack: nginx on :80, no exposed service ports
docker compose -f docker-compose.prod.yml up
```

Open `http://localhost:4000` (dev) or `http://localhost` (prod).

> **First run:** Docker pulls the base images and builds both apps — this takes
> 3–5 minutes. Subsequent starts are cached and take ~10 seconds.

### Option B — Manual (native Node.js)

```bash
# Prerequisites: Node.js 20 LTS, pnpm
npm install -g pnpm

git clone https://github.com/saad-bin-sohan/HELM_Hardware-Environment-Live-Monitor.git
cd HELM_Hardware-Environment-Live-Monitor

pnpm install

# Terminal 1: Start Node.js simulation backend (port 3000)
npx nx serve helm-server

# Terminal 2: Start Angular dev server (port 4200)
npx nx serve helm-ui
```

Open `http://localhost:4200`.

### Makefile Shortcuts

```bash
make dev          # docker compose up (dev stack)
make prod         # docker compose -f docker-compose.prod.yml up (prod stack)
make dev-build    # rebuild images and start dev stack
make prod-build   # rebuild images and start prod stack
make logs         # tail logs for all services
make stop         # stop dev stack
make prod-stop    # stop prod stack
make clean        # remove stopped containers and unused images
```

## 🛠️ Development Commands

```bash
# ── Serving ────────────────────────────────────────────────────────
npx nx serve helm-ui               # Angular dev server (port 4200, HMR)
npx nx serve helm-server           # Node.js server with watch (port 3000)
npx nx run-many \
  --target=serve \
  --projects=helm-server,helm-ui \
  --parallel                       # Both apps in parallel (no Docker)

# ── Building ───────────────────────────────────────────────────────
npx nx build helm-ui --configuration=production
npx nx build helm-server --configuration=production
npx nx run-many \
  --target=build \
  --projects=helm-server,helm-ui \
  --configuration=production       # Build both

# ── Testing ────────────────────────────────────────────────────────
npx nx test helm-ui                # Unit tests (jest-preset-angular, zoneless)
npx nx test helm-ui --coverage     # With coverage report
npx nx test helm-ui --watch        # Watch mode during development

# ── Linting ────────────────────────────────────────────────────────
npx nx lint helm-ui                # angular-eslint + typescript-eslint
npx nx eslint:lint helm-server     # inferred ESLint target for the Node app

# ── NX project graph ───────────────────────────────────────────────
npx nx graph                       # Interactive dependency graph in browser
npx nx show project helm-ui        # Show all targets for a project
npx nx show project helm-server    # Server targets include build, serve, eslint:lint
```

## 🌐 Deployment

### Railway (Recommended — full-stack, one platform)

Railway supports NX monorepo deployments. Create two services from the same
GitHub repo:

**Service 1: helm-server**

| Setting | Value |
|---------|-------|
| Root directory | repository root |
| Build command | `pnpm install --frozen-lockfile && npx nx build helm-server --configuration=production` |
| Start command | `node dist/apps/helm-server/main.js` |
| Environment | `PORT=3000`, `NODE_ENV=production` |

After deploy, note the Railway URL: `https://helm-server-XXXX.railway.app`

**Service 2: helm-ui**

| Setting | Value |
|---------|-------|
| Root directory | repository root |
| Build command | `pnpm install --frozen-lockfile && npx nx build helm-ui --configuration=production` |
| Start command | `node dist/apps/helm-ui/server/server.mjs` |
| Environment | `PORT=4000`, `WS_URL=wss://helm-server-XXXX.railway.app`, `API_URL=/api`, `BACKEND_URL=https://helm-server-XXXX.railway.app` |

> The Angular SSR `server.ts` reads `BACKEND_URL` to proxy `/api` requests
> server-side. `WS_URL` is injected into the built JS at container start via
> the `docker-entrypoint.sh` sed-replace pattern.

### VPS / DigitalOcean ($6/month Droplet)

```bash
# On the VPS
git clone https://github.com/saad-bin-sohan/HELM_Hardware-Environment-Live-Monitor.git
cd HELM_Hardware-Environment-Live-Monitor

# Edit docker-compose.prod.yml — set WS_URL and API_URL to your domain
docker compose -f docker-compose.prod.yml up -d

# Optional: Add Let's Encrypt SSL
apt install certbot python3-certbot-nginx
certbot --nginx -d helm.example.com
```

### Environment Variables Reference

| Variable | Used by | Description |
|----------|---------|-------------|
| `PORT` | Both | Listening port (default: 3000 server, 4000 UI) |
| `WS_URL` | helm-ui (runtime) | Browser WebSocket endpoint e.g. `wss://domain.com/ws` |
| `API_URL` | helm-ui (runtime) | Browser API base URL — use `/api` in nginx setups |
| `BACKEND_URL` | helm-ui (SSR proxy) | Internal URL the SSR Express server proxies `/api` to |
| `NODE_ENV` | helm-server | `development` or `production` |

## 🔧 Extending HELM

HELM's architecture is intentionally hardware-agnostic. The simulation layer
is the only part that would change for a real deployment:

### Real Hardware Integration

Replace `SimulatorEngine` in `apps/helm-server/src/simulator/engine.ts`
with a hardware driver adapter. The WebSocket message schema (`WsMessage`
in `libs/shared-types/src/websocket.model.ts`) is the contract between
hardware and UI — it stays unchanged. The Angular client doesn't know or
care whether frames come from a simulator or a real AUV.

### Authentication

The HTTP interceptor scaffold is already in place
(`apps/helm-ui/src/app/core/interceptors/`). To add JWT authentication:
1. Create `AuthService` with login/logout and token storage
2. Update `loggingInterceptor` → `authInterceptor` to attach `Authorization` headers
3. Add route guards to `app.routes.ts` using Angular's `CanActivateFn`
4. Add JWT middleware to the Express server in `apps/helm-server/src/main.ts`

### Live Video Feeds

The dashboard already includes a camera feed architecture placeholder
(`CAM-02 FEED OFFLINE` panel). To wire a real feed:
1. Add a `CameraService` that negotiates a WebRTC offer/answer
2. Replace the placeholder `<div>` with a `<video autoplay playsinline>` element
3. Attach the `MediaStream` to the video element's `srcObject` inside `afterNextRender()`
   (required for SSR safety — same pattern as Leaflet initialisation)

### Multi-User Collaboration

Most vehicle, mission, and alert state currently flows through client-side
`BehaviorSubject` instances in Angular services after REST/WS updates. To add
multi-user collaboration:
1. Move command acknowledgements and alert acknowledgements through a server-side relay
2. Add a room-based WebSocket topic system to `apps/helm-server/src/main.ts`
3. Broadcast state mutations to all connected operators via the existing WS infrastructure

### Additional Vehicle Types

The vehicle type system (`VehicleType = 'AUV' | 'ROV' | 'ASV'`) is
extensible. Add a new type to `libs/shared-types/src/vehicle.model.ts`,
add a config entry in `apps/helm-server/src/simulator/config.ts`,
and the UI surfaces that consume shared vehicle models can adapt with the
same fleet-card, status-badge, and dashboard patterns.

## 🎯 Lighthouse Scores

Placeholder scores until the live Railway deployment is audited with 4G
throttling and the mobile profile.

| Metric | Score |
|--------|-------|
| 🟢 Performance | **87** |
| 🟢 Accessibility | **94** |
| 🟢 Best Practices | **92** |
| 🟢 SEO | **83** |

> *Screenshot: [docs/assets/lighthouse-scores.png](docs/assets/lighthouse-scores.png)*
>
> **Performance notes to validate after deployment:**
> - SSR sends initial dashboard HTML before JS hydrates
> - Zoneless change detection removes Zone.js task interception overhead
> - Metric cards and dashboard panels use stable sizing to reduce layout shift
> - Production budgets warn at 500KB initial bundle and error at 1MB

> 📷 *Replace placeholder scores with your actual Lighthouse results after running
> the audit on the live URL. Take a screenshot and save as `docs/assets/lighthouse-scores.png`.*

## 🧱 Tech Stack

### Frontend
| Technology | Version | Role |
|-----------|---------|------|
| Angular | 21.2 | SPA framework — standalone components, Signals, zoneless CD |
| `@angular/ssr` | 21.2 | Built-in SSR via `AngularNodeAppEngine` |
| Angular Material | 21.2 | Dialog, Snackbar, form field, select, slider, badge, tooltip components |
| Angular CDK | 21.2 | DragDrop for waypoint reorder; Material dialog handles focus management |
| Tailwind CSS | v4 | Utility-first CSS with `@import "tailwindcss"` |
| Chart.js | 4.x | Raw (no wrapper) — `TelemetryChartComponent` |
| Leaflet | 1.9 | Raw (no wrapper) — SSR-safe via `afterNextRender()` |
| lucide-angular | 1.0 | Angular-native icon library |
| RxJS | 7.8 | Streams: WebSocket messages, HTTP, timer-based polling |

### Backend
| Technology | Version | Role |
|-----------|---------|------|
| Node.js | 20 LTS | Runtime for both SSR server and API server |
| Express | 4.x | HTTP server for REST API and Angular SSR |
| ws | 8.x | WebSocket server — 4 Hz telemetry broadcast |
| http-proxy-middleware | 4.x | SSR server proxies `/api` to Node.js API |

### Infrastructure
| Technology | Version | Role |
|-----------|---------|------|
| NX | 22.7 | Monorepo management — project graph, task caching, path aliases |
| pnpm | latest | Fast, disk-efficient package manager |
| Docker | 24+ | Multi-stage builds for both apps |
| nginx | alpine | Reverse proxy — WebSocket upgrade, gzip, asset caching |
| TypeScript | 5.9 | Strict mode throughout — zero `any` types |
| Jest | 30 | Unit tests with `jest-preset-angular` for the Angular app |
| GitHub Actions | — | CI: lint + build + test on push/PR |

## 📄 License

MIT © HELM Project

See [LICENSE](LICENSE) for the full text.

---

<div align="center">

Built as a full-stack portfolio project demonstrating production-grade
Angular 21 architecture, real-time systems engineering, and modern DevOps
practices.

*If you found this useful or have questions, feel free to open an issue.*

</div>
