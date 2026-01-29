// HTMLWidgets binding for graphTool visual editor
// Connects R Shiny/RMarkdown to the React widget

HTMLWidgets.widget('graphTool', {
  
  initialize: function(el, width, height) {
    // Create container for React app
    $(el).append('<div id="app" style="width:100%;height:100%;margin:0;padding:0;"></div>');
    return {};
  },

  renderValue: function(el, data, instance) {
    // Expose initial model to widget via global config
    // The Vite-bundled React app (widget.js) will read this on mount
    window.graphToolConfig = {
      initialModel: data.model,
      timestamp: Date.now()
    };
    
    // The widget JS bundle (widget.js) is automatically loaded by htmlwidgets
    // and will detect window.Shiny if running in Shiny context
  },

  resize: function(el, width, height) {
    // React handles sizing via CSS, but htmlwidgets requires this method
  }
});
