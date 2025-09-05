<template>
  <div id="map" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { kml } from '@mapbox/togeojson'

// Environment variables
const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
const mapboxBasemap = import.meta.env.VITE_MAPBOX_STANDARD_BASEMAP || 'mapbox://styles/mapbox/streets-v12'
const poisAssetsPath = import.meta.env.VITE_POIS_ASSETS_PATH

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
    // Load POIs after map is initialized
    loadPoisLayer()
  })

  // Error handling
  map.value.on('error', (e) => {
    console.error('Map error:', e)
  })
}

// Load POIs layer from KML
const loadPoisLayer = async () => {
  if (!map.value || !poisAssetsPath) {
    console.error('Map not initialized or POIS assets path not configured')
    return
  }

  try {
    console.log('Loading POIs from:', poisAssetsPath)
    
    // Fetch KML data
    const response = await fetch(poisAssetsPath)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const kmlText = await response.text()
    const parser = new DOMParser()
    const kmlDoc = parser.parseFromString(kmlText, 'text/xml')
    
    // Convert KML to GeoJSON
    const geojson = kml(kmlDoc)
    
    console.log('Parsed GeoJSON:', geojson)
    
    // Extract unique types from the data to create dynamic styling
    const uniqueTypes = new Set()
    if (geojson.features) {
      geojson.features.forEach(feature => {
        if (feature.properties && feature.properties.type) {
          uniqueTypes.add(feature.properties.type)
        }
      })
    }
    
    console.log('Unique POI types found:', Array.from(uniqueTypes))
    
    // Generate colors for each unique type
    const colors = [
      '#e74c3c', '#3498db', '#f39c12', '#e67e22', '#9b59b6', 
      '#27ae60', '#f1c40f', '#34495e', '#16a085', '#e91e63',
      '#95a5a6', '#d35400', '#8e44ad', '#2c3e50', '#c0392b',
      '#2980b9', '#f39c12', '#d68910', '#7f8c8d', '#17a2b8'
    ]
    
    // Create dynamic color mapping based on actual types
    const typeColors = {}
    Array.from(uniqueTypes).forEach((type, index) => {
      typeColors[type] = colors[index % colors.length]
    })
    
    // Add default color for unknown types
    typeColors.default = '#95a5a6'
    
    console.log('Type color mapping:', typeColors)
    
    // Add source for POIs
    map.value.addSource('pois', {
      type: 'geojson',
      data: geojson
    })
    
    // Create expression for point colors based on actual types from data
    const colorExpression = [
      'case',
      ...Object.entries(typeColors).flatMap(([type, color]) => 
        type !== 'default' ? [['==', ['get', 'type'], type], color] : []
      ),
      typeColors.default // fallback color
    ]
    
    // Create expression for point sizes (you can customize this based on your actual types)
    const sizeExpression = [
      'case',
      // You can add specific size rules for your actual types here
      // For now, using a default size with slight variation
      ['!=', ['get', 'type'], null], 5,
      2 // default size for features without type
    ]
    
    // Add circle layer for POIs
    map.value.addLayer({
      'id': 'pois-circles',
      'type': 'circle',
      'source': 'pois',
      'paint': {
        'circle-radius': sizeExpression,
        'circle-color': colorExpression,
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.8
      }
    })
    
    // Add symbol layer for POI labels (optional)
    map.value.addLayer({
      'id': 'pois-labels',
      'type': 'symbol',
      'source': 'pois',
      'layout': {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 10,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-optional': true
      },
      'paint': {
        'text-color': '#333333',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1
      },
      'minzoom': 12 // Only show labels when zoomed in
    })
    
    // Add click event for POIs
    map.value.on('click', 'pois-circles', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice()
      const properties = e.features[0].properties
      
      // Ensure that if the map is zoomed out such that multiple
      // copies of the feature are visible, the popup appears
      // over the copy being pointed to.
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360
      }
      
      // Create popup content
      const popupContent = `
        <div style="font-family: Arial, sans-serif;">
          <h3 style="margin: 0 0 10px 0; color: #333;">${properties.name || 'Unnamed POI'}</h3>
          <p style="margin: 5px 0;"><strong>Type:</strong> ${properties.type || 'Unknown'}</p>
          ${properties.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${properties.description}</p>` : ''}
        </div>
      `
      
      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(map.value)
    })
    
    // Change the cursor to a pointer when hovering over POIs
    map.value.on('mouseenter', 'pois-circles', () => {
      map.value.getCanvas().style.cursor = 'pointer'
    })
    
    map.value.on('mouseleave', 'pois-circles', () => {
      map.value.getCanvas().style.cursor = ''
    })
    
    console.log('POIs layer loaded successfully')
    console.log('Total POIs loaded:', geojson.features ? geojson.features.length : 0)
    console.log('Color legend:')
    Object.entries(typeColors).forEach(([type, color]) => {
      if (type !== 'default') {
        console.log(`  ${type}: ${color}`)
      }
    })
    
  } catch (error) {
    console.error('Error loading POIs layer:', error)
  }
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
