# Test script to verify plotting fixes in RStudio
# Run this after devtools::load_all()

devtools::load_all()

cat("\n=== Testing plot(gm) visibility fix ===\n")

# Create a simple test GraphModel
schema <- list(
  schemaVersion = 1,
  models = list(
    model1 = list(
      nodes = list(
        list(id = "X", label = "X", type = "variable", tags = list("manifest"), visual=list(x=50,y=200)),
        list(id = "Y", label = "Y", type = "variable", tags = list("manifest"), visual=list(x=50,y=50))
      ),
      paths = list(
        list(
          fromLabel = "X", toLabel = "Y", numberOfArrows = 1,
          parameterType = "Loading"
        )
      )
    )
  )
)

gm <- as.GraphModel(schema)

cat("\n1. Testing plot(gm) - should display widget in viewer\n")
cat("   (Widget should appear, not stay invisible)\n")
plot(gm)

# cat("\n2. Testing explicit print(plot(gm)) - should also display\n")
# cat("   (You should see the widget, plus any jsonlite warnings)\n")
# w <- plot(gm)
# print(w)
#
# cat("\n3. Testing with editable=FALSE parameter\n")
# plot(gm, editable = FALSE)
#
# cat("\n4. Testing plot() method dispatch\n")
# cat("   (Verify that plot.GraphModel method was called)\n")
# p <- plot(gm, autoLayout="full")
#
# cat("\n✓ All tests completed. Check RStudio Viewer for widget displays.\n")
# cat("✓ Note: jsonlite warnings about keep_vec_names are expected\n")
# cat("  and do not affect functionality.\n")
