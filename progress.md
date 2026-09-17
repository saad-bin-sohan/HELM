# HELM Upgrade — Progress Tracker

**This file tracks execution against `plan.md`.** Same task IDs, same order, same stages. Read `plan.md` first if you haven't — it has the full context, rationale, and fix description for every item here; this file only tracks status.

## How to update this file (read before doing any work)

1. Find the task you just finished by its ID (e.g. `BE-03`).
2. Change its checkbox from `[ ]` to `[x]`.
3. Change its `Status:` line to `Done`.
4. Add one line under `Notes:` describing what you actually did — especially anything that differed from `plan.md`'s description (e.g. "fixed as described" is fine if true; "took a different approach because X" needs a real sentence).
5. Update the **Snapshot** section at the top (tick the count up, move the "Currently on" line if you finished a whole stage).
6. Update the **Session log** at the bottom with a new entry.
7. **Only touch the task(s) you actually worked on.** Don't re-verify or re-timestamp unrelated items. Don't reformat sections you didn't touch.
8. If a human made progress instead of you (e.g. completed a 🧑-owned task), they — or you, told about it — update the same way. This file doesn't distinguish who updated it, only what's true now.
9. If you find a new bug not in `plan.md` while working, add it to **§ Newly discovered issues** below using the next free number in the right category (e.g. if `BE-16` is the last backend item, a new one is `BE-17`) — don't renumber or edit `plan.md` itself.

---

## Snapshot

- **Tasks complete: 3 / 64**
- **Currently on: Stage 0 — Environment & tooling sanity** (in progress — 3 / 10 done)
- **Blocked on a human decision:** no — Stage 0 has no gate, start anytime.
- **Upcoming gates to remember:** Stage 6 needs a human 🤝 to confirm the auth/DB/AI-feature approach (`plan.md` §4.5) before it starts. Stage 7 needs a human 🤝 to confirm the hosting platform choice (`plan.md` §4.4) before it starts.
- **Last updated:** 2026-09-17 — `ENV-03` fixed and verified. See its Notes below, and `ENV-15` under Newly discovered issues (found while auditing for the same class of problem).

---

## Stage 0 — Environment & tooling sanity (3 / 10)

- [x] **ENV-01** — `pnpm-workspace.yaml` placeholder values break fresh `pnpm install` — `Status: Done`
  - Notes: Root cause as `plan.md` described it doesn't match the actual repo — verified via `git log --all -- pnpm-workspace.yaml` and `git show HEAD:pnpm-workspace.yaml` that the committed file has only ever contained `autoInstallPeers: true`; no `allowBuilds` placeholder block was ever committed. But the *impact* is completely real and reproduces exactly as written: a genuinely fresh `pnpm install --frozen-lockfile` (current pnpm v12.4.1 — what both Dockerfiles' unpinned `npm install -g pnpm` pulls today) fails with `ERR_PNPM_IGNORED_BUILDS` for precisely the 8 packages named (`@parcel/watcher`, `@swc/core`, `esbuild`, `less`, `lmdb`, `msgpackr-extract`, `nx`, `unrs-resolver`), because pnpm ≥10 blocks install/postinstall scripts by default until approved, and nothing in this repo ever approved them. Confirmed pnpm itself auto-writes the *exact* placeholder scaffold `plan.md` describes into `pnpm-workspace.yaml` as a side effect of that failed install — almost certainly the real origin of the ticket (a local run, never actually committed). Fix applied: ran `pnpm approve-builds --all` (pnpm's own supported remediation, named directly in its error output) after checking `pnpm why <pkg>` on all 8 to confirm each is a legitimate, expected build tool pulled in by the Angular build pipeline, Nx, or Jest — nothing unexpected or suspicious. Added explanatory comments on top of the tool-generated result documenting why each package is approved and how to safely extend the list later. Reproduced the failure first (exit 1, unfixed file), then verified the fix with two further independent fresh installs of the corrected file — one reusing pnpm's local store, one against a completely empty `--store-dir` (zero cache reuse, closest simulation of a brand-new machine/CI runner) — both exit 0, no prompts, all 8 build scripts report `Done`. Broader audit: grepped the whole tracked repo for this and other placeholder/scaffold patterns — found nothing else of this class. Confirmed the fix doesn't regress anything downstream: `helm-server` build and lint stay clean, `helm-ui`'s test suite still passes (1/1). `helm-ui`'s production build still fails, but only on the separately-tracked `ENV-08` (Google Fonts reachability) — confirmed unrelated to this change. While validating, incidentally found and logged (not fixed) an unrelated pre-existing issue as `ENV-11`: the documented `npx nx lint helm-server` command doesn't actually work in this workspace. Did not edit `plan.md`, per its own closing note (§7) to record discrepancies here instead of treating them as blockers.
- [x] **ENV-02** — Unpinned pnpm version in both Dockerfiles — `Status: Done`
  - Notes: Root cause confirmed exactly as described, plus one extra call site `plan.md` didn't mention: `apps/helm-server/Dockerfile` has 1 instance (builder stage, line 13), but `apps/helm-ui/Dockerfile` has 2 (builder **and** runner stages, since helm-ui's runner also installs prod deps via pnpm) — 3 unpinned `npm install -g pnpm` calls total across the two files. Independently confirmed by running `hadolint` (industry-standard Dockerfile linter) before any changes: it flagged all three lines with `DL3016 "Pin versions in npm"`. No `packageManager` field existed in root `package.json` to anchor a pin against. Fixed via Corepack, per `plan.md`'s suggested direction, with the version declared exactly once: added `"packageManager": "pnpm@12.4.1+sha512.<64-hex>"` to root `package.json` — the hash wasn't hand-typed, it was generated by actually running `corepack use pnpm@12.4.1` and independently cross-checked byte-for-byte against npm registry's own published `dist.integrity` for that tarball (both matched exactly). Both Dockerfiles now run `RUN corepack enable` (early, cache-stable, no file dependency) followed by `RUN corepack install` positioned *after* `COPY package.json...`, with no version literal in the Dockerfile itself — Corepack derives the exact version from the already-copied `package.json`, so Docker/CI/local dev truly share one source of truth instead of two that could drift apart. Also updated `README.md` (Quick Start + tech-stack table) and `CONTRIBUTING.md` (prerequisites table + Getting Started), which both documented/prescribed the identical `npm install -g pnpm` anti-pattern in prose — same class of problem, fixed to say `corepack enable` instead. Version choice was researched, not assumed: pnpm 11.x actually requires Node ≥22.13 and would silently fail to run at all on this project's `node:20-alpine` base image, so that entire major line is disqualified regardless of pinning; pnpm 12.x (a from-scratch Rust rewrite, GA'd 2026-08-26) relaxed the requirement back to Node ≥18, and 12.4.1 (current `latest`) was checked against every documented pnpm-11→12 behavior difference relevant to this repo's exact flags (`--frozen-lockfile`, `--prod`, `--ignore-scripts`, no git-protocol deps, no `engineStrict`) — none apply. Also confirmed via npm registry package metadata that pnpm 12.4.1 ships dedicated `linux-x64-musl`/`linux-arm64-musl` optionalDependency binaries, so the Rust rewrite runs correctly on the Alpine base images these Dockerfiles actually use, not just glibc. Validated hands-on, repeatedly, with the Corepack cache fully cleared each time to simulate a genuinely fresh machine: both the builder-stage full install (`pnpm install --frozen-lockfile`) and the runner-stage prod-only install (`pnpm install --prod --frozen-lockfile --ignore-scripts`) succeeded (exit 0) in isolation, with `ENV-01`'s `allowBuilds` approvals still honored — zero prompts, zero `ERR_PNPM_IGNORED_BUILDS` — under the new pinned version. One important side effect, investigated thoroughly rather than glossed over: introducing the `packageManager` field causes pnpm 12 to rewrite `pnpm-lock.yaml` into a two-document YAML stream (a small leading document recording pnpm's own version + platform binaries under `packageManagerDependencies`, then the original project lockfile as the second document) the first time a frozen install runs against it. Confirmed this is official, documented pnpm 12 behavior (not corruption): the change is purely additive (0 deletions), byte-for-byte deterministic across three independent test runs, and idempotent (a second frozen install against the updated file makes zero further changes). Rather than leave that one-time rewrite to happen silently inside someone's first CI run or local checkout, the regenerated `pnpm-lock.yaml` is committed as part of this fix. This two-document format has a real, documented history of breaking tools that only read the first YAML document (older Nx versions, Dependabot, at least one SBOM/vulnerability scanner) — checked this specifically rather than assuming it away: Nx added support starting `22.7.0-beta.14`, safely before this workspace's `nx@22.7.1`, and the one remaining known Nx gap (pruned lockfiles dropping the env document, nx#36947) doesn't apply here because neither Dockerfile has Nx prune a lockfile — helm-server's runner stage uses a lockfile-less `npm install` against a generated `package.json`, and helm-ui's runner stage installs against the full, unpruned root lockfile directly. This repo doesn't currently run Dependabot or any SBOM/vulnerability scanner, so there's nothing to break today; flagged as `ENV-14` below in case that changes. Broader audit for the same class of problem (unpinned/floating tool versions), as requested: found the **deleted** `.github/workflows/ci.yml` (visible only via `git show 793a688`, gone from the working tree today) used `pnpm/action-setup@v4` with `version: latest` — the identical anti-pattern, logged as `ENV-13` for whoever picks up `CI-01`, since restoring that workflow verbatim would reintroduce this exact bug on day one; checked `docker-compose.yml`/`docker-compose.prod.yml` (only reference the two Dockerfiles' build context, nothing to change) and `nginx/Dockerfile` (pinned to `nginx:1.27-alpine`, already a deliberate major.minor pin, different failure mode, left untouched); grepped the repo for `npm install -g`, `curl | sh`, `@latest`, and wildcard dependency ranges — found nothing else of this class. Also found, but deliberately did **not** fold into this diff (real issue, different category, own ticket): both Dockerfiles' `node:20-alpine` base image is past Node 20's 2026-04-30 end-of-life. A pnpm version pin is a same-place, same-behavior, zero-risk change; a Node major-version bump changes the OS/libc baseline and needs its own dedicated regression pass — logged as `ENV-12` rather than bundled in here. Regression-tested after the fix, command by command, against the documented Stage 0 baseline: `pnpm install --frozen-lockfile` exit 0 (all 8 approved build scripts still `Done`); `npx nx build helm-server --configuration=production` exit 0; `npx nx eslint:lint helm-server` exit 0 (per `ENV-11`'s documented correct target — the undocumented `nx lint helm-server` still fails exactly the same pre-existing way, confirming `ENV-11` is untouched); `npx nx eslint:lint shared-types` exit 0; `npx nx test helm-ui` exit 0, 1/1 passing; `npx nx lint helm-ui` exit 1, 38 errors/3 warnings — identical count to the documented pre-existing baseline from `ENV-03`–`ENV-07`; `npx nx build helm-ui --configuration=production` exit 1, failing on exactly the pre-existing `ENV-08` (Google Fonts 403) and nothing else. Ran `hadolint` on both Dockerfiles before and after: the `DL3016` finding is gone from both; no new warning-or-higher-severity finding appeared. `hadolint` did surface one new info-level `DL3059` ("multiple consecutive RUN, consider consolidating") as a direct consequence of splitting `corepack enable`/`corepack install` into separate steps — left as-is deliberately (matches this repo's existing one-step-per-`RUN` convention, and the clarity of a dedicated, separately-logged activation step outweighs saving one Docker layer); noted here rather than silently overridden. Did not edit `plan.md`, consistent with `ENV-01`'s precedent of recording discrepancies/discoveries here instead.
- [x] **ENV-03** — ESLint selector prefix misconfigured (`app` vs actual `helm-` convention) — `Status: Done`
  - Notes: Root cause confirmed exactly as described — `apps/helm-ui/eslint.config.mjs` had `prefix: 'app'` hardcoded in both the `@angular-eslint/directive-selector` (line 15) and `@angular-eslint/component-selector` (line 23) rule configs, the unedited `@nx/angular:application` scaffold default. The *quantified* impact was undercounted, though: `plan.md` estimated "roughly 15 of the 38 errors" and named 15 components + 2 directives; reproducing the unfixed baseline first (`npx nx lint helm-ui` → exit 1, 41 problems: 38 errors/3 warnings — identical to the documented figure), stripping ANSI codes, and counting every error by rule name shows **23** errors actually trace to this one rule (21 `component-selector` + 2 `directive-selector`), not 15 — `plan.md`'s list omitted the root `App` component (`app.ts` → selector `helm-root`) and 5 further feature components (`dashboard`, `fleet`, `mission-log`, `mission-planner`, `sensor-analytics`). Exhaustively verified every selector in the app before touching anything, two independent ways: grepped by filename convention (`*.component.ts`/`*.directive.ts` → 22 files) and separately by decorator (`@Component(`/`@Directive(` → 21+2 = 23 matches); both agree on exactly 23 selectors, all already consistently `helm-`/`helmXxx`, including the root (`index.html`'s `<helm-root>` already matches `app.ts`'s `selector: 'helm-root'`) — so fixing the rule introduces zero new violations anywhere. Fix applied: both `prefix: 'app'` → `prefix: 'helm'` in `apps/helm-ui/eslint.config.mjs`. Confirmed the root `eslint.config.mjs` and `libs/shared-types/eslint.config.mjs` carry no Angular selector rules at all (neither is an Angular project) — `apps/helm-ui/eslint.config.mjs` really is the only file in the repo with this rule. Broader audit for the same class of problem (as requested) found one more real, in-scope instance: `apps/helm-ui/project.json` line 5 also had `"prefix": "app"` — the Nx/Angular-CLI *generator* default (read by `nx g @nx/angular:component`/`directive` schematics when scaffolding new files), a different mechanism from the ESLint rule but the identical unedited-scaffold-default root cause. It causes zero current lint/build/test failures (not consumed by ESLint or the build), but left alone it would silently regenerate this exact bug the moment anyone scaffolds a new component without manually passing `--prefix=helm` — fixed it alongside the ESLint rule in this same diff since it's a one-line, zero-behavioral-risk metadata change (confirmed: production build output is byte-for-byte identical before/after, see validation below). Also grepped for `app-` as a CSS/HTML type-selector across every `.scss`/`.html` file in `apps/helm-ui/src`, and both `README.md` and `CONTRIBUTING.md` for any documented `ng generate`/`nx generate` example or naming-convention prose — found nothing else of this class. Did find, but deliberately did **not** fold into this diff (a different kind of issue — dead code, not a prefix misconfiguration): `apps/helm-ui/src/app/app.html` (plus the empty, sibling `app.scss`) is a fully orphaned, unreferenced Nx-scaffold leftover — `app.ts` uses an inline `template` with no `templateUrl`/`styleUrl`, so this file is never compiled or meaningfully linted and has zero effect on anything today, but it still contains the default `<app-nx-welcome></app-nx-welcome>` placeholder tag from the original scaffold (confirmed it's the *only* remaining `app-`-tagged markup anywhere in `apps/helm-ui/src`). Logged as `ENV-15` below rather than deleted here, keeping this diff to exactly the prefix configuration itself. Validated thoroughly rather than assumed: after the fix, `npx nx lint helm-ui` → exit 1 still (Stage 0's separately-ticketed `ENV-04`/`ENV-06`/`ENV-07` and Stage 3's `A11Y-01` errors remain untouched by design), but now **18 problems (15 errors, 3 warnings)** — exactly 23 fewer. Proved this precisely rather than eyeballing terminal output: rule-by-rule counts for every *other* rule (`enforce-module-boundaries` 7, `label-has-associated-control` 3, `no-output-native` 2, `no-inferrable-types` 3, `no-unused-vars` warnings 3) are identical to the digit before and after; whitespace-normalizing and set-comparing both full outputs shows every single line in the post-fix run already existed verbatim pre-fix, apart from the summary count itself — mathematically confirming zero new findings and nothing unrelated silently changed. `npx nx show projects --affected --uncommitted` confirms only `helm-ui` is touched. `npx nx test helm-ui` unchanged, 1/1 passing. For the production build, went further than a single before/after run: used `git stash`/`git stash pop` to capture a genuinely clean pre-fix build and a genuinely fresh post-fix build (`npx nx reset` + `--skip-nx-cache` both times, so neither could be served from cache), then diffed them — identical apart from one cosmetic terminal line-wrap and build duration: same 6 `NG8113` unused-import warnings (`ENV-05`'s subject), same Sass `@import` deprecation (`ENV-10`'s subject), same single blocking `ENV-08` Google-Fonts-403 error, same line numbers throughout. Confirms zero build-pipeline effect, as expected, since neither an ESLint rule nor `project.json`'s `prefix` metadata is consumed by the Angular/Nx build executor. Spot-checked the rest of the workspace for cross-project impact too: `npx nx build helm-server` clean, `npx nx run helm-server:eslint:lint` clean, `npx nx run shared-types:eslint:lint` clean — all three unaffected, consistent with `--affected` reporting only `helm-ui`. Final `git status`/`git diff` confirms the entire change is exactly 2 files, 3 lines — nothing else touched. Did not edit `plan.md`, consistent with `ENV-01`/`ENV-02`'s precedent of recording discrepancies here instead.
- [ ] **ENV-04** — `@nx/enforce-module-boundaries` violation on `@helm/env` import — `Status: Not started`
  - Notes:
- [ ] **ENV-05** — 6 unused-import lint errors across various components — `Status: Not started`
  - Notes:
- [ ] **ENV-06** — `@Output()` names (`close`, `select`) collide with native DOM events — `Status: Not started`
  - Notes:
- [ ] **ENV-07** — 3× `no-inferrable-types` + 1 unused var (sparkline, depth-profile-chart) — `Status: Not started`
  - Notes:
- [ ] **ENV-08** — Production build hard-depends on reaching Google Fonts at build time — `Status: Not started`
  - Notes:
- [ ] **ENV-09** — Dead, broken `environment.staging.ts` (uses `process.env` in browser code) — `Status: Not started`
  - Notes:
- [ ] **ENV-10** — Deprecated Sass `@import` syntax — `Status: Not started`
  - Notes:

**Stage 0 exit check (fill in once all boxes above are ticked):**
- [ ] `pnpm install --frozen-lockfile` succeeds from a clean `node_modules` with no prompts
- [ ] `npx nx lint helm-server` clean
- [ ] `npx nx lint helm-ui` clean
- [ ] `npx nx build helm-server` succeeds
- [ ] `npx nx build helm-ui --configuration=production` succeeds

---

## Stage 1 — Backend logic bugs (0 / 16)

- [ ] **BE-01** — Command acknowledgment lies about success (`processCommand` always returns `acknowledged`) — `Status: Not started`
  - Notes:
- [ ] **BE-02** — No validation of command type before dispatch — `Status: Not started`
  - Notes:
- [ ] **BE-03** — Battery never recharges (fleet reaches permanent 0%/critical in 1–4 days) — `Status: Not started`
  - Notes:
- [ ] **BE-04** — Mission status never reaches `'completed'` — `Status: Not started`
  - Notes:
- [ ] **BE-05** — Duplicated alert-threshold logic between `physics.ts` and `shared-types` — `Status: Not started`
  - Notes:
- [ ] **BE-06** — `missionLogs` grows unbounded — `Status: Not started`
  - Notes:
- [ ] **BE-07** — `alerts` store grows unbounded — `Status: Not started`
  - Notes:
- [ ] **BE-08** — Deleting a mission orphans its log — `Status: Not started`
  - Notes:
- [ ] **BE-09** — `PUT /api/missions/:id` accepts unvalidated field overwrites — `Status: Not started`
  - Notes:
- [ ] **BE-10** — CORS wide open (`origin: '*'`) — `Status: Not started`
  - Notes:
- [ ] **BE-11** — No global Express error-handling middleware — `Status: Not started`
  - Notes:
- [ ] **BE-12** — Graceful shutdown doesn't close WebSocket connections — `Status: Not started`
  - Notes:
- [ ] **BE-13** — Store getters return live internal references inconsistently — `Status: Not started`
  - Notes:
- [ ] **BE-14** — Commands accepted for vehicles that should be unreachable (`signal_loss`) — `Status: Not started`
  - Notes:
- [ ] **BE-15** — Depth-overshoot alert reports a value that doesn't match its claimed severity yet — `Status: Not started`
  - Notes:
- [ ] **BE-16** — Startup banner hardcodes fleet/mission counts — `Status: Not started`
  - Notes:

**Stage 1 exit check:**
- [ ] `npx nx build helm-server` succeeds
- [ ] `npx nx lint helm-server` clean
- [ ] Manually sent a bogus command type against a running local server and confirmed a real `failed` response (not `acknowledged`)

---

## Stage 2 — Frontend logic bugs (0 / 12)

- [ ] **FE-01** — Heartbeat timeout detects a dead connection but never reconnects — `Status: Not started`
  - Notes:
- [ ] **FE-02** — Fleet status ignores the server's own authoritative offline/restore signal — `Status: Not started`
  - Notes:
- [ ] **FE-03** — Duplicate/uncoordinated alerting between server and client — `Status: Not started`
  - Notes:
- [ ] **FE-04** — "Acknowledge all" doesn't persist to the server — `Status: Not started`
  - Notes:
- [ ] **FE-05** — Critical alert sound can be silently blocked by browser autoplay policy — `Status: Not started`
  - Notes:
- [ ] **FE-06** — `isDispatching` is a single global flag, not per-command — `Status: Not started`
  - Notes:
- [ ] **FE-07** — Failed command dispatches vanish from command history — `Status: Not started`
  - Notes:
- [ ] **FE-08** — `loggingInterceptor` doesn't log anything — `Status: Not started`
  - Notes:
- [ ] **FE-09** — `telemetry$()`/`telemetryBuffer$()` aren't actually shared across call sites — `Status: Not started`
  - Notes:
- [ ] **FE-10** — Inconsistent SSR-safety pattern in `mission.service.ts` — `Status: Not started`
  - Notes:
- [ ] **FE-11** — Query strings built via raw concatenation instead of `HttpParams` — `Status: Not started`
  - Notes:
- [ ] **FE-12** — Missing error handling on several service-layer HTTP calls — `Status: Not started`
  - Notes:

**Stage 2 exit check:**
- [ ] `npx nx build helm-ui --configuration=production` succeeds
- [ ] `npx nx lint helm-ui` clean
- [ ] `npx nx test helm-ui` passes

---

## Stage 3 — Accessibility, performance, security polish (0 / 6)

- [ ] **A11Y-01** — Real accessibility violations in the command panel (label association) — `Status: Not started`
  - Notes:
- [ ] **PERF-01** — Initial bundle 55% over its own configured budget — `Status: Not started`
  - Notes:
- [ ] **PERF-02** — Several component style budgets exceeded — `Status: Not started`
  - Notes:
- [ ] **SEC-01** — No Content-Security-Policy header — `Status: Not started`
  - Notes:
- [ ] **SEC-02** — Deprecated `X-XSS-Protection` header — `Status: Not started`
  - Notes:
- [ ] **SEC-03** — SSR `allowedHosts: ['*']` disables Host-header protection entirely — `Status: Not started`
  - Notes:

**Stage 3 exit check:**
- [ ] `npx nx lint helm-ui` clean (should already be, confirming nothing regressed)
- [ ] Production build's bundle budget warnings gone (or materially reduced with a documented reason for what's left)

---

## Stage 4 — Testing (0 / 6)

- [ ] **TEST-01** — `SimulatorEngine` unit tests — `Status: Not started`
  - Notes:
- [ ] **TEST-02** — `WebSocketService` unit tests — `Status: Not started`
  - Notes:
- [ ] **TEST-03** — `AlertService` unit tests — `Status: Not started`
  - Notes:
- [ ] **TEST-04** — Backend route/API tests — `Status: Not started`
  - Notes:
- [ ] **TEST-05** — One small end-to-end smoke test (Playwright) — `Status: Not started`
  - Notes:
- [ ] **TEST-06** — Coverage reporting wired up — `Status: Not started`
  - Notes:

**Stage 4 exit check:**
- [ ] `npx nx test helm-ui` passes with materially more than 1 test
- [ ] `npx nx test helm-server` passes (new — didn't exist before this stage)
- [ ] e2e smoke test passes locally

---

## Stage 5 — CI/CD restoration (0 / 2)

- [ ] **CI-01** — Restore the deleted CI workflow (`.github/workflows/ci.yml`) — `Status: Not started`
  - Notes:
- [ ] **CI-02** — Add a dependency-audit step — `Status: Not started`
  - Notes:

**Stage 5 exit check:**
- [ ] A real PR/push actually triggers the workflow and it goes green
- [ ] README's CI badge reflects the real workflow (full fix tracked as `DOC-03`, but sanity-check the link works now)

---

## Stage 6 — New features (0 / 3)

**🤝 Gate: do not start until a human has confirmed the approach in `plan.md` §4.5.**
- [ ] Human confirmation received — `Date/note: __________`

- [ ] **FEAT-01** — Lightweight auth (JWT, seeded demo operator, gates write actions only) — `Status: Not started`
  - Notes:
- [ ] **FEAT-02** — Persisted command audit log (Postgres via Neon, Drizzle/Prisma) — `Status: Not started`
  - Notes:
- [ ] **FEAT-03** — (Optional, non-zero cost — requires separate explicit opt-in even after the Stage 6 gate) AI-touch feature — `Status: Not started / Not opted in`
  - Notes:

**Stage 6 exit check:**
- [ ] Auth demonstrably works locally: logged out = read-only, logged in as demo operator = can dispatch commands/edit thresholds
- [ ] Command audit log populates correctly and is viewable in the UI
- [ ] If `FEAT-03` was opted into: API key is never exposed client-side (verify in browser network tab / bundle)

---

## Stage 7 — Deployment (0 / 5) — mostly human-executed

**🤝 Gate: do not start until a human has confirmed the hosting decision in `plan.md` §4.4.**
- [ ] Human confirmation received — `Decision: __________  Date/note: __________`

- [ ] **DEPLOY-01** — 🧑 Hosting platform chosen and account/service set up — `Status: Not started`
  - Notes:
- [ ] **DEPLOY-02** — 🧑 Neon Postgres provisioned (only if `FEAT-02` was built) — `Status: Not started`
  - Notes:
- [ ] **DEPLOY-03** — 🧑 Environment variables/secrets configured on the host — `Status: Not started`
  - Notes:
- [ ] **DEPLOY-04** — 🧑 Deployed and verified live end-to-end — `Status: Not started`
  - Notes:
- [ ] **DEPLOY-05** — 🧑 Battery/mission-loop equilibrium validated over real elapsed time — `Status: Not started`
  - Notes: `(check back a few days after DEPLOY-04, not immediately)`

---

## Stage 8 — Documentation (0 / 4)

- [ ] **DOC-01** — 🧑/🤖 Real screenshots/GIF replacing placeholders — `Status: Not started`
  - Notes:
- [ ] **DOC-02** — 🧑/🤖 Real Lighthouse scores replacing placeholders — `Status: Not started`
  - Notes:
- [ ] **DOC-03** — 🤖 CI badge fixed to point at the restored workflow — `Status: Not started`
  - Notes:
- [ ] **DOC-04** — 🤖 General README accuracy pass — `Status: Not started`
  - Notes:

---

## Newly discovered issues

*(Empty at plan creation time. Add new items here as they're found during execution — use the next free number in the relevant category, e.g. `BE-17`, `FE-13`. Include the same fields plan.md uses: file, severity, current vs. correct behavior, fix, owner. Don't edit `plan.md` itself to add these.)*

#### ENV-11 — `nx lint <project>` doesn't work as documented for `helm-server` / `shared-types`
**Severity:** Low (tooling/documentation correctness, not a functional bug) · **Owner:** 🤖 AI Agent
**Found while working on:** `ENV-01` validation.
**File:** `nx.json` (root — the `@nx/eslint/plugin` entry sets `"targetName": "eslint:lint"`, so ESLint is only auto-inferred under a target literally named `eslint:lint`); `apps/helm-server/project.json`; `libs/shared-types/project.json`. Contrast with `apps/helm-ui/project.json`, which separately hand-declares its own explicit `"lint": { "executor": "@nx/eslint:lint" }` target.
**Current behavior:** `npx nx lint helm-server` → `NX Cannot find configuration for task helm-server:lint` (exit code 1). Same for `shared-types`. Because only `helm-ui` has an explicit `lint` target, `npx nx lint helm-ui` happens to work while the other two don't — this is exactly the command both `plan.md` §7 (Appendix) and this file's Stage 0 and Stage 1 exit checks tell you to run for `helm-server`.
**Verified working command today:** `npx nx eslint:lint helm-server` and `npx nx eslint:lint shared-types` — both exit 0, clean, confirming `plan.md`'s claim that backend lint is clean is accurate, just under a different target name than documented.
**Fix (not applied — outside `ENV-01`'s file scope):** pick one convention and apply it to all three projects in a single small commit: either (a) add an explicit `lint` target to `helm-server`'s and `shared-types`'s `project.json`, matching `helm-ui`'s pattern (recommended — keeps the shorter, more conventional command working everywhere and requires no doc changes), or (b) standardize the other direction and update every `nx lint <project>` reference in `plan.md` §7 and this file's exit checks to `nx eslint:lint <project>`. Whoever picks up the next `ENV-xx` task should decide and apply it consistently.

#### ENV-12 — `node:20-alpine` base image is past its official end-of-life
**Severity:** Medium (no immediate breakage, but zero further upstream security patches) · **Owner:** 🤖 AI Agent
**Found while working on:** `ENV-02` audit.
**File:** `apps/helm-server/Dockerfile`, `apps/helm-ui/Dockerfile` — both `FROM node:20-alpine` (builder and runner stages).
**Current behavior:** Node.js 20 ("Iron") reached official end-of-life on 2026-04-30. Every build today still pulls a Node 20 base image; it still works and still builds cleanly (confirmed as part of `ENV-02`'s validation), but it no longer receives security patches from upstream, and this is a *stale pin*, not an *unpinned* one — a materially different problem from `ENV-02`, since `node:20-alpine` doesn't silently drift to a different major version the way bare `npm install -g pnpm` did.
**Fix (not applied — deliberately out of scope for `ENV-02`):** bump both Dockerfiles to a current Node LTS (verify the exact target against Nx 22.7's and Angular 21's supported-engines ranges first) and re-run the full Stage 0 validation suite afterward, since a Node major bump changes the musl/Alpine baseline and can affect native addons (`@swc/core`, `esbuild`, `@parcel/watcher`, `lmdb`, `unrs-resolver` all ship platform-specific prebuilds). Worth doing in the same pass: add an `"engines": { "node": "..." }` field to root `package.json` alongside the `packageManager` field `ENV-02` just added, so the Node contract is declared as explicitly as the pnpm one. Recommend its own ticket rather than folding it into a future `ENV-xx` silently.

#### ENV-13 — Deleted CI workflow used the same unpinned-pnpm pattern as ENV-02
**Severity:** Low today (file doesn't exist in the working tree), but High-relevance for whoever executes `CI-01` · **Owner:** 🤖 AI Agent
**Found while working on:** `ENV-02` broader audit (`git show 793a688`, the commit that deleted `.github/workflows/ci.yml`).
**File:** `.github/workflows/ci.yml` (deleted; relevant again once `CI-01` restores it).
**Current behavior:** The deleted workflow used `pnpm/action-setup@v4` with `version: latest` — the identical "whatever's newest today" failure mode `ENV-02` just fixed in both Dockerfiles, just expressed as a GitHub Action input instead of a shell command. There is nothing to edit today since the file isn't in the working tree, so this is **not** part of `ENV-02`'s diff.
**Fix (for `CI-01`, not applied now):** when restoring the workflow, use `pnpm/action-setup@v4` (or newer) **without** a hardcoded `version:` input — recent versions of the action auto-detect the version from `package.json`'s `packageManager` field (which `ENV-02` now provides), keeping CI in agreement with Docker and local dev automatically. Also confirm whatever `pnpm/action-setup` version is used at that time actually supports pnpm 12 (a Rust rewrite; older `action-setup` releases predate it and only understand the old Node-based pnpm distribution) — verify against the action's own release notes rather than assuming.

#### ENV-14 — Two-document `pnpm-lock.yaml` format needs re-checking if Dependabot or an SBOM/vulnerability scanner is ever added
**Severity:** Low today (no such tooling currently in this repo) · **Owner:** 🤖 AI Agent
**Found while working on:** `ENV-02` validation (investigating why a `--frozen-lockfile` install rewrote `pnpm-lock.yaml`).
**File:** `pnpm-lock.yaml` (repo root).
**Current behavior:** Now that root `package.json` pins pnpm via `packageManager` (added in `ENV-02`), pnpm 12 keeps `pnpm-lock.yaml` as a two-document YAML stream — a small leading document recording pnpm's own version/platform binaries, then the real project lockfile as the second document. This is official pnpm 12 behavior (confirmed via pnpm's own docs) and this workspace's tooling already handles it correctly (`nx@22.7.1` added support for this format starting `22.7.0-beta.14`, and every `nx build`/`lint`/`test` command was re-verified against it as part of `ENV-02`). It is **not** currently a problem here. It has, however, been a real source of breakage elsewhere in the ecosystem for tools that naively read only the first YAML document — documented issues exist against Dependabot and at least one SBOM/vulnerability scanner, and against older Nx versions.
**Fix (no action needed today):** if `CI-02` (dependency-audit step) or any future tooling addition reads `pnpm-lock.yaml` directly rather than shelling out to `pnpm`, explicitly confirm it understands the two-document format before relying on its output — a naive parser can silently report zero dependencies rather than erroring loudly.

#### ENV-15 — Orphaned, unreferenced Nx-scaffold leftover files still using the old `app-` naming
**Severity:** Low (dead code — zero runtime/build/lint effect today) · **Owner:** 🤖 AI Agent
**Found while working on:** `ENV-03` (grepping the whole app for any remaining `app-`-prefixed selector or tag usage, to confirm the ESLint prefix fix wouldn't introduce new violations).
**File:** `apps/helm-ui/src/app/app.html`; `apps/helm-ui/src/app/app.scss` (0 bytes).
**Current behavior:** Both are the original, unedited output of `nx g @nx/angular:application` and are completely orphaned — `apps/helm-ui/src/app/app.ts` defines its root component with an inline `template: \`<router-outlet />\`` and no `styleUrl`/`styleUrls`, so neither file is referenced by `templateUrl`, `styleUrl`, any import, or any test (confirmed via a repo-wide grep for both filenames). `app.html` still contains the default scaffold placeholder markup — `<app-nx-welcome></app-nx-welcome>` followed by `<router-outlet></router-outlet>` — from before the real UI was built. Confirmed neither file appears anywhere in `npx nx build helm-ui --configuration=production` or `npx nx lint helm-ui` output: Angular's compiler only resolves templates/styles that are actually referenced, so this is inert dead weight, not a functional bug, and unrelated to `ENV-03`'s ESLint-rule/generator-default fix (a build-time/lint-time config concern) even though it happens to contain the same stale `app-` string.
**Fix (not applied — a different kind of change than `ENV-03`'s config fix, deserves its own small diff):** delete both files. Zero behavior change expected (confirmed unreferenced anywhere in `apps/helm-ui/src`); re-run `npx nx build helm-ui` and `npx nx test helm-ui` after deleting as a formality — deleting dead files is about as low-risk as a change gets, but should still be verified rather than assumed.

---

## Session log

*(Append one entry per work session — don't edit previous entries.)*

- **[Plan created]** — Full repo audit completed (all source files read; dependencies actually installed and the real build/lint/test/commands run to verify findings empirically, not just inferred from reading code); `plan.md` and this file produced; 64 tasks catalogued across 9 stages. No execution has started yet.
- **[2026-09-14] `ENV-01` fixed.** Extracted the repo fresh from `HELM.zip`, read `plan.md` in full, and reproduced the reported failure empirically before changing anything, per `plan.md`'s own §7 closing instruction. Found the committed `pnpm-workspace.yaml` did not actually contain the placeholder block `plan.md` describes (confirmed via `git log`/`git show` — it has only ever held `autoInstallPeers: true`), but confirmed the described *impact* is completely real: a fresh `pnpm install --frozen-lockfile` with today's pnpm (v12.4.1 — what both Dockerfiles' unpinned `npm install -g pnpm` currently resolves to) fails with `ERR_PNPM_IGNORED_BUILDS` for exactly the 8 packages named, and pnpm itself auto-writes the exact described placeholder scaffold into `pnpm-workspace.yaml` as a side effect of that failure — almost certainly the real origin of the original ticket. Fixed via `pnpm approve-builds --all` after auditing each package's dependency chain (`pnpm why <pkg>`) and declared install/postinstall scripts to confirm legitimacy; added explanatory comments to the file for future maintainers. Reproduced the failure first against the unfixed file (exit 1, as expected), then verified the fix with two further fresh-install runs of the corrected file, one against a fully isolated `--store-dir` (zero cache reuse) — both exit 0, no prompts, all 8 build scripts report `Done`, lockfile untouched. Ran a broader repo-wide grep for the same placeholder pattern and related scaffold artifacts — found none elsewhere; confirmed `pnpm-workspace.yaml` isn't excluded by either `.dockerignore`. Spot-checked for regressions: `helm-server` build and lint clean, `helm-ui` test suite passes (1/1); `helm-ui` production build still fails, but only on the separately-tracked `ENV-08` (Google Fonts reachability) — confirmed unrelated to this fix. Logged one incidental discovery as `ENV-11` (nx `lint` target-naming inconsistency between `helm-ui` and the other two projects) rather than fixing it, since it's outside `ENV-01`'s file scope. Did not touch `plan.md`, per its own instruction to record discrepancies here instead of treating them as blockers. No other `ENV-xx`/`BE-xx`/etc. tasks were touched.
- **[2026-09-16] `ENV-02` fixed.** Confirmed the root cause first: 3 unpinned `npm install -g pnpm` call sites, not 2 — `apps/helm-server/Dockerfile` (builder stage only) and `apps/helm-ui/Dockerfile` (both builder and runner stages) — independently corroborated by running `hadolint` before touching anything, which flagged all three with `DL3016`. Chose the pnpm version deliberately rather than defaulting to "whatever's newest": confirmed pnpm 11.x requires Node ≥22.13 and is not viable at all on this project's `node:20-alpine` base, while pnpm 12.4.1 (a from-scratch Rust rewrite, GA'd 2026-08-26) relaxed that back to Node ≥18, ships musl/Alpine-compatible binaries, and has no documented behavior difference affecting the exact flags (`--frozen-lockfile`, `--prod`, `--ignore-scripts`) these Dockerfiles use. Added `"packageManager": "pnpm@12.4.1+sha512:<hash>"` to root `package.json` — the hash was generated by Corepack itself (`corepack use pnpm@12.4.1`) and independently cross-checked against npm's own published package integrity, not hand-typed. Replaced all three `npm install -g pnpm` lines with `corepack enable` + `corepack install`, positioned so Corepack always derives the version from the already-copied `package.json` rather than a second hardcoded literal in the Dockerfile. Validated hands-on with the Corepack cache fully cleared each time (simulating a genuinely fresh machine): both the builder-stage full install and the runner-stage prod-only install succeeded cleanly, with `ENV-01`'s build-script approvals still honored. While validating, found that adding the `packageManager` field causes pnpm 12 to rewrite `pnpm-lock.yaml` into a two-document YAML stream on first frozen install; investigated this thoroughly rather than dismissing or panicking over it — confirmed it's official pnpm 12 behavior, purely additive, deterministic, and idempotent across three independent test runs, then specifically checked this workspace's `nx@22.7.1` against a real, dated GitHub issue about older Nx versions choking on this exact format and confirmed Nx added support well before this version — so committed the regenerated lockfile as part of this fix rather than leaving a surprise for the next frozen install. Extended the same fix to `README.md` and `CONTRIBUTING.md`, which both prescribed the identical `npm install -g pnpm` anti-pattern in prose. Broader audit for the same class of problem found the deleted `.github/workflows/ci.yml` used the identical pattern via `pnpm/action-setup@v4` + `version: latest` (logged as `ENV-13` for `CI-01`, since the file doesn't exist to edit today) and confirmed `docker-compose*.yml`/`nginx/Dockerfile` are unaffected. Logged two further incidental discoveries without fixing them, consistent with `ENV-01`'s precedent: `ENV-12` (both Dockerfiles' `node:20-alpine` base is past its 2026-04-30 end-of-life — a different, larger, separately-ticketed concern) and `ENV-14` (a forward-looking note about the two-document lockfile format, relevant only if Dependabot or an SBOM/vulnerability scanner is added later). Regression-tested the full documented Stage 0 baseline command-by-command afterward — `helm-server` build/lint clean, `shared-types` lint clean, `helm-ui` test 1/1 passing, `helm-ui` lint still exactly 38 errors/3 warnings (pre-existing, unchanged), `helm-ui` production build still failing only on the pre-existing `ENV-08` — and re-ran `hadolint` on both Dockerfiles to confirm `DL3016` is resolved with no new warning-or-higher-severity finding introduced. Did not touch `plan.md`, consistent with `ENV-01`'s precedent. No other `ENV-xx`/`BE-xx`/etc. tasks were touched.
- **[2026-09-17] `ENV-03` fixed.** Extracted the repo fresh, read `plan.md` and this file in full, then reproduced the documented baseline before touching anything: `npx nx lint helm-ui` → exit 1, 41 problems (38 errors/3 warnings), matching the recorded figure exactly. Confirmed the root cause exactly as `plan.md` describes — `prefix: 'app'` hardcoded in both Angular selector rules in `apps/helm-ui/eslint.config.mjs` — but found the stated impact ("roughly 15 of the 38 errors") undercounts the real number: a clean, rule-by-rule count of the actual lint output puts it at 23 (21 `component-selector` + 2 `directive-selector`), across 6 more files than `plan.md` named (the root `App` component plus `dashboard`, `fleet`, `mission-log`, `mission-planner`, `sensor-analytics`). Verified exhaustively, two independent ways, that every one of the 23 real `@Component`/`@Directive` selectors in the app already uses `helm-`/`helmXxx` with zero exceptions, so the fix could not introduce any new violation. Fixed both `prefix: 'app'` occurrences to `prefix: 'helm'`. Broader audit for the same class of problem (as requested) found a second real instance: `apps/helm-ui/project.json`'s own `"prefix": "app"` field — the Nx/Angular-CLI code-generation default, a different mechanism from the ESLint rule but the same root cause — and fixed it in the same diff, since it's a one-line, zero-behavioral-risk metadata change that directly protects `ENV-03`'s fix from being silently undone the next time someone scaffolds a new component. Grepped the rest of the repo (CSS/HTML type-selectors, README/CONTRIBUTING prose) for the same pattern and found nothing else real; did find one adjacent-but-different issue — `apps/helm-ui/src/app/app.html`/`app.scss`, orphaned Nx-scaffold leftovers still carrying the old `<app-nx-welcome>` placeholder tag but completely unreferenced and inert — and logged it as `ENV-15` rather than folding it into this diff, since deleting dead files is a different kind of change than fixing a prefix config. Validated rigorously: after the fix, `npx nx lint helm-ui` drops to exactly 18 problems (15 errors/3 warnings) — 23 fewer, with every other rule's count unchanged to the digit, and a whitespace-normalized, line-by-line set comparison proving every remaining line already existed pre-fix (i.e., zero new findings introduced). `npx nx show projects --affected --uncommitted` confirms only `helm-ui` is touched. `npx nx test helm-ui` unchanged at 1/1 passing. For the production build, used `git stash`/`git stash pop` plus `npx nx reset`/`--skip-nx-cache` to capture genuinely fresh, non-cached pre-fix and post-fix builds and diffed them directly rather than trusting memory of an earlier run — identical in every respect (same `ENV-05` unused-import warnings, same `ENV-10` Sass deprecation warning, same single blocking `ENV-08` Google-Fonts-403 error) apart from one cosmetic terminal line-wrap and build duration, proving zero build-pipeline impact from either change, as expected. Spot-checked the rest of the workspace too: `helm-server` build and lint clean, `shared-types` lint clean — nothing outside `helm-ui` affected, consistent with the `--affected` result. Final `git diff` is exactly 2 files, 3 lines. Did not touch `plan.md`, consistent with `ENV-01`/`ENV-02`'s precedent. No other `ENV-xx`/`BE-xx`/etc. tasks were touched.
