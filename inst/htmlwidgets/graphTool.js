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
      },
      
      export: function(width, height, format) {
        console.log('[graphTool export] Exporting visualization');
        console.log('[graphTool export] Export format:', format, 'dimensions:', width, 'x', height);
        
        // Find the SVG element - look within the widget container
        var svgElement = document.querySelector('svg');
        
        if (!svgElement) {
          console.warn('[graphTool export] No SVG element found in DOM');
          return null;
        }
        
        console.log('[graphTool export] Found SVG element, creating static export');
        console.log('[graphTool export] SVG viewBox:', svgElement.getAttribute('viewBox'));
        console.log('[graphTool export] SVG dimensions:', svgElement.clientWidth, 'x', svgElement.clientHeight);
        
        try {
          // Clone the SVG to create a static snapshot
          var staticSvg = svgElement.cloneNode(true);
          
          // Remove interactive event handlers by removing onclick, style pointer-events, etc.
          // This makes it truly static
          var allElements = staticSvg.querySelectorAll('*');
          allElements.forEach(function(el) {
            // Remove event listener attributes
            Array.from(el.attributes).forEach(function(attr) {
              if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
              }
            });
          });
          
          // Set proper SVG namespace and xmlns for export
          staticSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          
          // Get the static SVG as string
          var svgString = new XMLSerializer().serializeToString(staticSvg);
          
          console.log('[graphTool export] SVG serialized successfully, length:', svgString.length);
          console.log('[graphTool export] Returning static SVG for export');
          
          return svgString;
        } catch (error) {
          console.error('[graphTool export] Error during export:', error);
          // Fallback: just return the outerHTML
          return svgElement.outerHTML;
        }
      }
    };
  }
});

console.log('[graphTool.js] Binding registered');
