// HTMLWidgets binding for drawSEM visual editor
// Modern factory pattern (htmlwidgets best practice)

console.log('[drawSEM.js] Loading');

HTMLWidgets.widget({
  name: 'drawSEM',
  type: 'output',
  
  factory: function(el, width, height) {
    console.log('[drawSEM factory] Initializing widget for element:', el);
    
    // Create root container
    var container = document.createElement('div');
    container.id = 'root';
    container.style.cssText = 'width:100%;height:100%;margin:0;padding:0;background:#fff;position:relative;';
    el.appendChild(container);
    
    console.log('[drawSEM factory] Created container with id="root":', container);
    
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
        console.log('[drawSEM renderValue] Called with data');
        
        if (!data) {
          console.error('[drawSEM renderValue] No data provided');
          return;
        }
        
        console.log('[drawSEM renderValue] Data contents:', {
          initialModel: data.initialModel ? 'present' : 'missing',
          config: data.config ? 'present' : 'missing',
          data: data.data ? 'present' : 'missing'
        });
        
        // Store config globally for React widget to access
        window.drawSEMConfig = {
          initialModel: data.initialModel,
          config: data.config,
          data: data.data,
          timestamp: Date.now()
        };
        
        console.log('[drawSEM renderValue] Stored window.drawSEMConfig');
        
        // Check if React initialization function is available
        console.log('[drawSEM renderValue] Checking for window.drawSEMInitialize:', typeof window.drawSEMInitialize);
        
        if (window.drawSEMInitialize && typeof window.drawSEMInitialize === 'function') {
          console.log('[drawSEM renderValue] Found window.drawSEMInitialize! Calling it now...');
          try {
            window.drawSEMInitialize(container);
            console.log('[drawSEM renderValue] React initialization successful');
            instance.initialized = true;
          } catch (err) {
            console.error('[drawSEM renderValue] Error calling drawSEMInitialize:', err);
          }
        } else {
          console.warn('[drawSEM renderValue] window.drawSEMInitialize not available yet');
          console.log('[drawSEM renderValue] This might mean widget.js has not loaded. Dependencies:', {
            hasDrawSEMInitialize: typeof window.drawSEMInitialize,
            containerReady: !!container,
            configSet: !!window.drawSEMConfig
          });
        }
      },
      
      resize: function(width, height) {
        console.log('[drawSEM resize] Resizing to', width, 'x', height);
        instance.width = width;
        instance.height = height;
        // Resize handling could be added here if needed
      },
      
      export: function(width, height, format) {
        console.log('[drawSEM export] Exporting visualization');
        console.log('[drawSEM export] Export format:', format, 'dimensions:', width, 'x', height);
        
        // Find the SVG element - look within the widget container
        var svgElement = document.querySelector('svg');
        
        if (!svgElement) {
          console.warn('[drawSEM export] No SVG element found in DOM');
          return null;
        }
        
        console.log('[drawSEM export] Found SVG element, creating static export');
        console.log('[drawSEM export] SVG viewBox:', svgElement.getAttribute('viewBox'));
        console.log('[drawSEM export] SVG dimensions:', svgElement.clientWidth, 'x', svgElement.clientHeight);
        
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
          
          console.log('[drawSEM export] SVG serialized successfully, length:', svgString.length);
          console.log('[drawSEM export] Returning static SVG for export');
          
          return svgString;
        } catch (error) {
          console.error('[drawSEM export] Error during export:', error);
          // Fallback: just return the outerHTML
          return svgElement.outerHTML;
        }
      }
    };
  }
});

console.log('[drawSEM.js] Binding registered');
