# Standard SDLC entrypoints — the SAME commands run locally and in CI.
# The central pipeline (ManaksAI/sdlc-templates) calls these targets.
#
# PROJECT_TYPE is auto-detected, or set it explicitly:  make lint PROJECT_TYPE=python
# Targets that don't apply to a project are harmless no-ops, never errors.

PROJECT_TYPE ?= $(shell \
	if [ -f monkey.jungle ]; then echo garmin; \
	elif [ -f wscript ] || [ -f appinfo.json ]; then echo pebble; \
	elif [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then echo python; \
	elif [ -f package.json ]; then echo node; \
	else echo unknown; fi)

.PHONY: help info lint format-check typecheck test-unit test-integration build ci clean

help:
	@echo "Detected PROJECT_TYPE = $(PROJECT_TYPE)"
	@echo "Targets: lint format-check typecheck test-unit test-integration build ci"

info:
	@echo "PROJECT_TYPE=$(PROJECT_TYPE)"

# ───────────────────────── lint ─────────────────────────
lint:
ifeq ($(PROJECT_TYPE),python)
	pip install -q ruff && ruff check .
else ifeq ($(PROJECT_TYPE),node)
	npx --yes eslint . || echo "no eslint config — skipping"
else
	@echo "[lint] no linter configured for '$(PROJECT_TYPE)' — skipping"
endif

# ───────────────────────── format-check ─────────────────────────
format-check:
ifeq ($(PROJECT_TYPE),python)
	pip install -q ruff && ruff format --check .
else ifeq ($(PROJECT_TYPE),node)
	npx --yes prettier --check . || echo "no prettier config — skipping"
else
	@echo "[format-check] none for '$(PROJECT_TYPE)' — skipping"
endif

# ───────────────────────── typecheck ─────────────────────────
typecheck:
ifeq ($(PROJECT_TYPE),python)
	pip install -q mypy && (mypy . || echo "mypy reported issues")
else ifeq ($(PROJECT_TYPE),node)
	npx --yes tsc --noEmit || echo "no tsconfig — skipping"
else
	@echo "[typecheck] none for '$(PROJECT_TYPE)' — skipping"
endif

# ───────────────────────── unit tests ─────────────────────────
test-unit:
ifeq ($(PROJECT_TYPE),python)
	pip install -q pytest && pytest -q || echo "no tests yet — add some under tests/"
else ifeq ($(PROJECT_TYPE),node)
	npm test --if-present
else
	@echo "[test-unit] none for '$(PROJECT_TYPE)' — skipping"
endif

# ───────────────────────── integration tests ─────────────────────────
test-integration:
	@echo "[test-integration] add integration tests here — skipping for now"

# ───────────────────────── build ─────────────────────────
build:
ifeq ($(PROJECT_TYPE),python)
	pip install -q build && python -m build || echo "no build target — skipping"
else ifeq ($(PROJECT_TYPE),node)
	npm run build --if-present
else ifeq ($(PROJECT_TYPE),pebble)
	pebble build
else ifeq ($(PROJECT_TYPE),garmin)
	@echo "[build] run via Connect IQ SDK (monkeyc) — wire up your jungle here"
else
	@echo "[build] nothing to build for '$(PROJECT_TYPE)' — skipping"
endif

# Run the whole pipeline locally, exactly like CI
ci: lint format-check typecheck test-unit test-integration build

clean:
	@rm -rf dist build *.egg-info node_modules/.cache 2>/dev/null || true
