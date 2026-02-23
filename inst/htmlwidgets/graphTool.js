// HTMLWidgets binding for graphTool visual editor
// Modern factory pattern (htmlwidgets best practice)

console.log('[graphTool.js] Loading');

HTMLWidgets.widget({
  name: 'graphTool',
  type: 'output',
  
  factory: function(el, width, height) {
    console.log('[graphTool factory] Initializing widget for element:', el);
    
    // Create root container
    var container = document.createElement('div');
    container.id = 'root';
    container.style.cssText = 'width:100%;height:100%;margin:0;padding:0;background:#fff;position:relative;';
    el.appendChild(container);
    
    console.log('[graphTool factory] Created container with id="root":', container);
    
    // Instance state (closure)
    var instance = {
      container: container,
      el: el,
      width: width,
      height: height,
      initialized: false
    };
    
    // Return the widget object with renderValue and resize methods
    return {
      renderValue: function(data) {
        console.log('[graphTool renderValue] Called with data');
        
        if (!data) {
          console.error('[graphTool renderValue] No data provided');
          return;
        }
        
        console.log('[graphTool renderValue] Data contents:', {
          initialModel: data.initialModel ? 'present' : 'missing',
          config: data.config ? 'present' : 'missing',
          data: data.data ? 'present' : 'missing'
        });
        
        // Store config globally for React widget to access
        window.graphToolConfig = {
          initialModel: data.initialModel,
          config: data.config,
          data: data.data,
          timestamp: Date.now()
        };
        
        console.log('[graphTool renderValue] Stored window.graphToolConfig');
        
        // Check if React initialization function is available
        console.log('[graphTool renderValue] Checking for window.graphToolInitialize:', typeof window.graphToolInitialize);
        
        if (window.graphToolInitialize && typeof window.graphToolInitialize === 'function') {
          console.log('[graphTool renderValue] Found window.graphToolInitialize! Calling it now...');
          try {
            window.graphToolInitialize(container);
            console.log('[graphTool renderValue] React initialization successful');
            instance.initialized = true;
          } catch (err) {
            console.error('[graphTool renderValue] Error calling graphToolInitialize:', err);
          }
        } else {
          console.warn('[graphTool renderValue] window.graphToolInitialize not available yet');
          console.log('[graphTool renderValue] This might mean widget.js has not loaded. Dependencies:', {
            hasGraphToolInitialize: typeof window.graphToolInitialize,
            containerReady: !!container,
            configSet: !!window.graphToolConfig
          });
        }
      },
      
      resize: function(width, height) {
        console.log('[graphTool resize] Resizing to', width, 'x', height);
        instance.width = width;
        instance.height = height;
        // Resize handling could be added here if needed
      }
    };
  }
});

console.log('[graphTool.js] Binding registered');
