<template>
  <div id="map" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Environment variables
const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
const mapboxBasemap = import.meta.env.VITE_MAPBOX_STANDARD_BASEMAP || 'mapbox://styles/mapbox/streets-v12'

// Reactive references
const map = ref(null)
const mapContainer = ref(null)

// Map initialization method
const initializeMap = () => {
  // Set Mapbox access token
  mapboxgl.accessToken = mapboxAccessToken

  if (!mapboxAccessToken) {
    console.error('Mapbox access token is not set. Please check your .env file.')
    return
  }

  // Create the map instance
  map.value = new mapboxgl.Map({
    container: 'map', // container ID
    style: mapboxBasemap, // style URL
    center: [-101.5731833069, 26.5346045702], // starting position [lng, lat]
    zoom: 7.5, // starting zoom
    projection: 'mercator' // map projection
  })

  // Add navigation controls
  map.value.addControl(new mapboxgl.NavigationControl(), 'top-right')

  // Add fullscreen control
  map.value.addControl(new mapboxgl.FullscreenControl(), 'top-right')

  // Map load event
  map.value.on('load', () => {
    console.log('Map loaded successfully')
  })

  // Error handling
  map.value.on('error', (e) => {
    console.error('Map error:', e)
  })
}

// Cleanup method
const cleanup = () => {
  if (map.value) {
    map.value.remove()
    map.value = null
  }
}

// Vue lifecycle hooks
onMounted(() => {
  initializeMap()
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

/* Ensure map container fills available space */
#map {
  width: 100%;
  height: 100%;
}
</style>
