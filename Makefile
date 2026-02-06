# Default target: prepare R package (schema artifact)
all: inst/extdata/graph.schema.json

# Node.js dependency - installs npm packages
visual-web-tool/node_modules:
	cd visual-web-tool && npm install

# Schema preparation (required for R package)
inst/extdata/graph.schema.json: visual-web-tool/schema/graph.schema.json
	mkdir -p inst/extdata
	cp visual-web-tool/schema/graph.schema.json inst/extdata/

# ============================================================================
# NODE TARGETS - for visual-web-tool development
# ============================================================================

node-build: visual-web-tool/node_modules
	cd visual-web-tool && npm run build

node-test: visual-web-tool/node_modules
	cd visual-web-tool && npm test

node-lint: visual-web-tool/node_modules
	cd visual-web-tool && npm run lint

node: node-build node-test

# ============================================================================
# R TARGETS - for OpenMxWebUI R package (independent of Node)
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
