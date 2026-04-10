# Default target: prepare R package (schema artifact)
all: inst/extdata/graph.schema.json

# Node.js dependency - installs npm packages
drawsem-web/node_modules:
	cd drawsem-web && npm install

# Schema preparation (required for R package)
inst/extdata/graph.schema.json: drawsem-web/schema/graph.schema.json
	mkdir -p inst/extdata
	cp drawsem-web/schema/graph.schema.json inst/extdata/

# ============================================================================
# NODE TARGETS - for drawsem-web development
# ============================================================================

node-build: drawsem-web/node_modules
	cd drawsem-web && npm run build

node-test: drawsem-web/node_modules
	cd drawsem-web && npm test

node-lint: drawsem-web/node_modules
	cd drawsem-web && npm run lint

node: node-build node-test

# ============================================================================
# R TARGETS - for drawSEM R package (independent of Node)
# ============================================================================

r-test: all
	Rscript -e "devtools::load_all('.'); testthat::test_dir('tests/testthat')"

r-check: all
	Rscript -e "devtools::check()"

# ============================================================================
# COMBINED TARGETS - for full project workflows
# ============================================================================

build-all: node-build all

test-all: node-test r-test

check-all: test-all r-check

# ============================================================================
# PHONY TARGETS
# ============================================================================

.PHONY: all node-build node-test node-lint node r-test r-check build-all test-all check-all
