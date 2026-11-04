# Shortcuts for the workspace. Every target delegates to an existing script (pnpm scripts,
# demo/bin/*, docker compose) and adds no logic of its own, so the scripts stay the single
# source of truth and remain usable without make.
#
#   make help                                   list targets
#   make up MODE=classic BACKEND=debugbar       start the stand in another mode
#
# MODE=octane|classic and BACKEND=clockwork|debugbar map to BACKEND_MODE / DEBUG_BACKEND; when
# omitted, demo/.env decides (as with plain docker compose).

SHELL := /bin/sh
.DEFAULT_GOAL := help

MODULE := pnpm -F nuxt-backend-lens
# Only the variables actually given are passed on, so demo/.env keeps its say otherwise.
STAND_ENV := $(strip $(if $(MODE),BACKEND_MODE=$(MODE)) $(if $(BACKEND),DEBUG_BACKEND=$(BACKEND)))
# docker compose run from demo/ (where docker-compose.yml and .env live), with the stand variables.
COMPOSE := cd demo && $(STAND_ENV) docker compose

.PHONY: help setup up down restart ps logs devtools-auth \
	dev prepare lint types unit module \
	backend-test pint leak e2e package stand stand-all check

help: ## List targets
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z_-]+:.*## / { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

## --- Demo stand

setup: ## Prepare a fresh clone: .env files, app key, composer + pnpm install, module stub build
	demo/bin/setup

up: ## Start the stand (MODE=, BACKEND= optional) and wait until it answers
	$(COMPOSE) up -d
	demo/bin/wait

down: ## Stop the stand
	$(COMPOSE) down

restart: ## Recreate backend + queue, e.g. to switch MODE= / BACKEND=
	$(COMPOSE) up -d --force-recreate backend queue
	demo/bin/wait

ps: ## Show stand services
	$(COMPOSE) ps

logs: ## Follow logs (s=backend for one service)
	$(COMPOSE) logs -f --tail=100 $(s)

devtools-auth: ## Print the link that authorizes this browser in Nuxt DevTools
	demo/bin/devtools-auth

## --- Module

dev: ## Playground (replays captured records, no PHP needed)
	$(MODULE) dev

prepare: ## Module stub build + types
	$(MODULE) dev:prepare

lint: ## ESLint
	$(MODULE) lint

types: ## vue-tsc (module and playground)
	$(MODULE) test:types

unit: ## Vitest unit tests
	$(MODULE) test

module: lint types unit ## All module checks

## --- Tests against the stand

backend-test: ## PHPUnit (clean environment, in the backend image)
	$(COMPOSE) run --rm backend-tests

pint: ## Laravel Pint on the demo backend
	$(COMPOSE) run --rm --no-deps backend-tests vendor/bin/pint app config tests routes database bootstrap/app.php

leak: ## Worker-isolation test against the running stand (source follows DEBUG_BACKEND)
	pnpm test:leak $(if $(BACKEND),--source=$(BACKEND))

e2e: ## Playwright suite against the running stand
	$(if $(BACKEND),DEBUG_BACKEND=$(BACKEND)) pnpm test:e2e

package: ## Packaged consumption: pack, install into a clean app, production builds on/off
	pnpm test:package

stand: ## One CI stand configuration (MODE=, BACKEND=): restart, wait, leak test, e2e
	$(STAND_ENV) demo/bin/check-stand

stand-all: ## The three CI stand configurations, one after another, then back to demo/.env
	BACKEND_MODE=octane DEBUG_BACKEND=clockwork demo/bin/check-stand
	BACKEND_MODE=octane DEBUG_BACKEND=debugbar demo/bin/check-stand
	BACKEND_MODE=classic DEBUG_BACKEND=clockwork demo/bin/check-stand
	cd demo && docker compose up -d --force-recreate backend queue

check: module backend-test package stand-all ## Everything CI runs, locally
