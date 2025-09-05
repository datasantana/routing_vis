import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  
  // Optimize for Mapbox GL JS performance
  optimizeDeps: {
    include: [
      'mapbox-gl',
      '@mapbox/togeojson'
    ]
  },
  
  // Build optimizations
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate Mapbox into its own chunk for better caching
          mapbox: ['mapbox-gl'],
          geojson: ['@mapbox/togeojson']
        }
      }
    },
    // Increase chunk size warning limit for Mapbox
    chunkSizeWarningLimit: 1000
  },
  
  // CSS handling to prevent conflicts with Mapbox styles
  css: {
    preprocessorOptions: {
      css: {
        charset: false
      }
    }
  },
  
  // Define global constants for better tree-shaking
  define: {
    // Disable Mapbox GL JS telemetry for better performance
    'process.env.MapboxAccessToken': JSON.stringify(process.env.VITE_MAPBOX_ACCESS_TOKEN || ''),
  },
  
  // Server configuration for better development experience
  server: {
    fs: {
      strict: false
    }
  }
})
