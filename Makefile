# =============================================================================
# HELM — Makefile
# Convenience shortcuts for Docker Compose operations
# =============================================================================

.PHONY: dev prod build stop logs clean ps health

# ── Development ───────────────────────────────────────────────────────────────

## Start development stack (Angular SSR on :4000, Node API on :3000)
dev:
	docker compose up

## Start development stack in background
dev-d:
	docker compose up -d

## Rebuild development images and start
dev-build:
	docker compose up --build

## Stop development stack
stop:
	docker compose down

# ── Production ────────────────────────────────────────────────────────────────

## Start production stack (nginx on :80)
prod:
	docker compose -f docker-compose.prod.yml up

## Start production stack in background
prod-d:
	docker compose -f docker-compose.prod.yml up -d

## Rebuild production images and start
prod-build:
	docker compose -f docker-compose.prod.yml up --build

## Stop production stack
prod-stop:
	docker compose -f docker-compose.prod.yml down

# ── Build only ────────────────────────────────────────────────────────────────

## Build all Docker images (dev configuration)
build:
	docker compose build

## Build all Docker images (prod configuration)
build-prod:
	docker compose -f docker-compose.prod.yml build

## Build a specific service: make build-service SERVICE=helm-ui
build-service:
	docker compose build $(SERVICE)

# ── Observability ─────────────────────────────────────────────────────────────

## Tail logs for all services
logs:
	docker compose logs -f

## Tail logs for a specific service: make logs-service SERVICE=helm-server
logs-service:
	docker compose logs -f $(SERVICE)

## Show running containers
ps:
	docker compose ps

## Check health status of all containers
health:
	docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# ── Cleanup ───────────────────────────────────────────────────────────────────

## Remove stopped containers and unused images
clean:
	docker compose down --remove-orphans
	docker image prune -f

## Nuclear option: remove ALL Docker resources for this project
nuke:
	docker compose down --volumes --remove-orphans --rmi all
	docker compose -f docker-compose.prod.yml down --volumes --remove-orphans --rmi all

# ── NX (non-Docker) ───────────────────────────────────────────────────────────

## Run both apps in development mode (no Docker)
nx-dev:
	npx nx run-many --target=serve --projects=helm-server,helm-ui --parallel

## Build both apps for production
nx-build:
	npx nx run-many --target=build --projects=helm-server,helm-ui --configuration=production

## Run tests
nx-test:
	npx nx run-many --target=test --projects=helm-ui,helm-server
