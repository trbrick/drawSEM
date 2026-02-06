test_that("validateSchemaStructure passes with valid schema", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )

  expect_message(
    validateSchemaStructure(schema),
    "Schema structure is valid"
  )
})

test_that("validateSchemaStructure fails without schemaVersion", {
  schema <- list(
    models = list(model1 = list(nodes = list(), paths = list()))
  )

  expect_error(
    validateSchemaStructure(schema),
    "Schema missing required fields"
  )
})

test_that("validateSchemaStructure fails without models", {
  schema <- list(schemaVersion = 1)

  expect_error(
    validateSchemaStructure(schema),
    "Schema missing required fields"
  )
})

test_that("validateNodeIntegrity detects duplicate node IDs", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x1", type = "variable")
        ),
        paths = list()
      )
    )
  )

  expect_error(
    validateNodeIntegrity(schema),
    "Duplicate node labels"
  )
})

test_that("validateNodeIntegrity detects invalid node types", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "invalid_type")
        ),
        paths = list()
      )
    )
  )

  expect_error(
    validateNodeIntegrity(schema),
    "Invalid node type"
  )
})

test_that("validateNodeIntegrity passes with valid nodes", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable"),
          list(label = "const1", type = "constant"),
          list(label = "data1", type = "dataset")
        ),
        paths = list()
      )
    )
  )

  expect_message(
    validateNodeIntegrity(schema),
    "Node integrity is valid"
  )
})

test_that("validatePathReferences detects undefined source node", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(fromLabel = "undefined", toLabel = "x1", numberOfArrows = 1)
        )
      )
    )
  )

  expect_error(
    validatePathReferences(schema),
    "references undefined node"
  )
})

test_that("validatePathReferences detects undefined target node", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(fromLabel = "x1", toLabel = "undefined", numberOfArrows = 1)
        )
      )
    )
  )

  expect_error(
    validatePathReferences(schema),
    "references undefined node"
  )
})

test_that("validatePathReferences detects invalid numberOfArrows", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list(
          list(fromLabel = "x1", toLabel = "x2", numberOfArrows = 3)
        )
      )
    )
  )

  expect_error(
    validatePathReferences(schema),
    "numberOfArrows must be 0, 1, or 2"
  )
})

test_that("validatePathReferences passes with valid paths", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list(
          list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 1),
          list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 2),
          list(fromLabel = "x1", toLabel = "x2", numberOfArrows = 0)
        )
      )
    )
  )

  expect_message(
    validatePathReferences(schema),
    "Path references are valid"
  )
})

test_that("validateOptimizationParams detects fixed without value", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(fromLabel = "x1", toLabel = "x1", numberOfArrows = 2, free = "fixed", value = NULL)
        )
      )
    )
  )

  expect_error(
    validateOptimizationParams(schema),
    "Fixed parameters must have a value"
  )
})

test_that("validateOptimizationParams detects invalid free value", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(fromLabel = "x1", toLabel = "x1", numberOfArrows = 2, free = "maybe")
        )
      )
    )
  )

  expect_error(
    validateOptimizationParams(schema),
    "free must be 'free' or 'fixed'"
  )
})

test_that("validateOptimizationParams passes with valid params", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list(
          list(fromLabel = "x1", toLabel = "x1", numberOfArrows = 2, free = "fixed", value = 1.0),
          list(fromLabel = "x1", toLabel = "x2", numberOfArrows = 1, free = "free")
        )
      )
    )
  )

  expect_message(
    validateOptimizationParams(schema),
    "Optimization parameters are valid"
  )
})

test_that("validateSchema orchestrates all validators", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable"),
          list(label = "1", type = "constant")
        ),
        paths = list(
          list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 1, free = "free"),
          list(fromLabel = "1", toLabel = "x1", numberOfArrows = 1, free = "free", value = 0),
          list(fromLabel = "x1", toLabel = "x1", numberOfArrows = 2, free = "fixed", value = 1.0)
        )
      )
    )
  )

  expect_message(
    validateSchema(schema),
    "Schema validation passed"
  )
})

test_that("validateSchema fails on any validation error", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x1", type = "variable")  # Duplicate
        ),
        paths = list()
      )
    )
  )

  expect_error(validateSchema(schema))
})
