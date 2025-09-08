import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  
  // Optimize dependencies for Mapbox GL JS
  optimizeDeps: {
    include: [
      'mapbox-gl'
    ],
    exclude: []
  },
  
  // Build configuration
  build: {
    rollupOptions: {
      output: {
        // Separate Mapbox into its own chunk for better caching
        manualChunks: {
          mapbox: ['mapbox-gl'],
          vendor: ['vue']
        }
      }
    },
    // Increase chunk size warning limit for Mapbox (it's a large library)
    chunkSizeWarningLimit: 1000,
    // Enable source maps for better debugging
    sourcemap: false
  },
  
  // CSS configuration to handle Mapbox styles properly
  css: {
    preprocessorOptions: {
      css: {
        charset: false
      }
    }
  },
  
  // Define global constants
  define: {
    // Ensure proper environment variable handling
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false
  },
  
  // Server configuration for development
  server: {
    fs: {
      strict: false
    },
    cors: true,
    // Headers for external resource loading
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  
  // Worker configuration for Mapbox GL JS
  worker: {
    format: 'es'
  },
  
  // Asset handling
  assetsInclude: ['**/*.geojson', '**/*.kml']
})
