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
// Use environment variables for GeoJSON URLs
const poisAssetsPath = import.meta.env.VITE_POIS_ASSETS_PATH
const routesAssetsPath = import.meta.env.VITE_ROUTES_ASSETS_PATH

// Reactive references
const map = ref(null)
const mapContainer = ref(null)
const animationControllers = ref(new Map()) // Store animation controllers for each route

// Animation configuration
const animationDuration = ref(2000) // 2 seconds per route animation (reasonable default)

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
    // Load routes after map is initialized
    loadRoutesLayer()
  })

  // Error handling
  map.value.on('error', (e) => {
    console.error('Map error:', e)
  })
}

// Load POIs layer from GeoJSON
const loadPoisLayer = async () => {
  if (!map.value || !poisAssetsPath) {
    console.error('Map not initialized or POIS assets path not configured')
    return
  }

  try {
    console.log('Loading POIs from:', poisAssetsPath)
    
    // Fetch GeoJSON data directly
    const response = await fetch(poisAssetsPath)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const geojson = await response.json()
    
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

// Load Routes layer from GeoJSON
const loadRoutesLayer = async () => {
  if (!map.value || !routesAssetsPath) {
    console.error('Map not initialized or Routes assets path not configured')
    return
  }

  try {
    console.log('Loading Routes from:', routesAssetsPath)
    
    // Fetch GeoJSON data directly
    const response = await fetch(routesAssetsPath)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const geojson = await response.json()
    
    console.log('Parsed Routes GeoJSON:', geojson)
    
    // Extract unique types from the routes data to create dynamic styling
    const uniqueTypes = new Set()
    if (geojson.features) {
      geojson.features.forEach(feature => {
        if (feature.properties && feature.properties.type) {
          uniqueTypes.add(feature.properties.type)
        }
      })
    }
    
    console.log('Unique Route types found:', Array.from(uniqueTypes))
    
    // Generate colors for each unique route type
    const routeColors = [
      '#e74c3c', '#3498db', '#f39c12', '#e67e22', '#9b59b6', 
      '#27ae60', '#f1c40f', '#34495e', '#16a085', '#e91e63',
      '#95a5a6', '#d35400', '#8e44ad', '#2c3e50', '#c0392b',
      '#2980b9', '#ff6b35', '#d68910', '#7f8c8d', '#17a2b8'
    ]
    
    // Create dynamic color mapping based on actual route types
    const routeTypeColors = {}
    Array.from(uniqueTypes).forEach((type, index) => {
      routeTypeColors[type] = routeColors[index % routeColors.length]
    })
    
    // Add default color for unknown types
    routeTypeColors.default = '#3498db'
    
    console.log('Route type color mapping:', routeTypeColors)
    
    // Add source for Routes
    map.value.addSource('routes', {
      type: 'geojson',
      data: geojson
    })
    
    // Create expression for route width based on type or other properties
    const widthExpression = [
      'case',
      ['!=', ['get', 'type'], null], 3,
      2 // default width for routes without type
    ]
    
    // Add line layer for Routes with subtle gray color (will be covered by animations)
    map.value.addLayer({
      'id': 'routes-lines',
      'type': 'line',
      'source': 'routes',
      'layout': {
        'line-join': 'round',
        'line-cap': 'round'
      },
      'paint': {
        'line-color': '#cccccc', // Light gray color so animations are visible
        'line-width': 2,
        'line-opacity': 0.3 // Very subtle
      }
    })
    
    // Add click event for Routes
    map.value.on('click', 'routes-lines', (e) => {
      const coordinates = e.lngLat
      const properties = e.features[0].properties
      
      // Create popup content for routes
      const popupContent = `
        <div style="font-family: Arial, sans-serif;">
          <h3 style="margin: 0 0 10px 0; color: #333;">${properties.name || 'Unnamed Route'}</h3>
          <p style="margin: 5px 0;"><strong>Type:</strong> ${properties.type || 'Unknown'}</p>
          ${properties.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${properties.description}</p>` : ''}
          ${properties.distance ? `<p style="margin: 5px 0;"><strong>Distance:</strong> ${properties.distance}</p>` : ''}
        </div>
      `
      
      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(map.value)
    })
    
    // Change the cursor to a pointer when hovering over Routes
    map.value.on('mouseenter', 'routes-lines', () => {
      map.value.getCanvas().style.cursor = 'pointer'
    })
    
    map.value.on('mouseleave', 'routes-lines', () => {
      map.value.getCanvas().style.cursor = ''
    })
    
    console.log('Routes layer loaded successfully')
    console.log('Total Routes loaded:', geojson.features ? geojson.features.length : 0)
    console.log('Route Color legend:')
    Object.entries(routeTypeColors).forEach(([type, color]) => {
      if (type !== 'default') {
        console.log(`  ${type}: ${color}`)
      }
    })
    
    // Start route animations after loading
    startRouteAnimations(geojson)
    
    // Fit map to routes bounding box
    if (geojson.features && geojson.features.length > 0) {
      // Calculate bounding box from all route features
      let bounds = new mapboxgl.LngLatBounds()
      
      geojson.features.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach(coord => {
            bounds.extend(coord)
          })
        } else if (feature.geometry.type === 'MultiLineString') {
          feature.geometry.coordinates.forEach(line => {
            line.forEach(coord => {
              bounds.extend(coord)
            })
          })
        }
      })
      
      // Fit the map to the bounds with some padding
      map.value.fitBounds(bounds, {
        padding: 50, // Add 50px padding around the bounds
        duration: 1500 // Animation duration in milliseconds
      })
      
      console.log('Map fitted to routes bounds:', bounds)
    }
    
  } catch (error) {
    console.error('Error loading Routes layer:', error)
  }
}

// Route animation functions
const startRouteAnimations = (geojson) => {
  if (!geojson || !geojson.features || !Array.isArray(geojson.features) || !map.value) {
    console.error('Invalid GeoJSON data or map not initialized for animations')
    return
  }
  
  const totalRoutes = geojson.features.length
  const totalAnimationTime = 1500000 // 25 minutes (1,500 seconds) total window
  const routeDuration = 15000 // Each route takes 15 seconds to animate (very leisurely pace)
  const staggerDelay = Math.max(200, (totalAnimationTime - routeDuration) / totalRoutes) // Stagger start times
  
  console.log(`Starting route animations for ${totalRoutes} routes...`)
  console.log(`Animation window: ${totalAnimationTime / 1000} seconds (${totalAnimationTime / 60000} minutes)`)
  console.log(`Duration per route: ${routeDuration / 1000} seconds`)
  console.log(`Stagger delay: ${(staggerDelay / 1000).toFixed(1)}s between routes`)
  
  // Hide the base routes layer during animations to make animated routes visible
  if (map.value.getLayer('routes-lines')) {
    map.value.setLayoutProperty('routes-lines', 'visibility', 'none')
  }
  
  // Add animated route sources and layers for each feature
  geojson.features.forEach((feature, index) => {
    // Validate that this feature has the expected geometry
    if (!feature.geometry || 
        !feature.geometry.coordinates || 
        !Array.isArray(feature.geometry.coordinates) ||
        feature.geometry.coordinates.length === 0) {
      console.warn(`Skipping invalid route feature at index ${index}:`, feature)
      return
    }
    
    // Check if it's a LineString or MultiLineString
    const isValidGeometry = feature.geometry.type === 'LineString' || 
                           feature.geometry.type === 'MultiLineString'
    
    if (!isValidGeometry) {
      console.warn(`Skipping route feature with unsupported geometry type at index ${index}:`, feature.geometry.type)
      return
    }
    
    const routeId = `route-${index}`
    const animatedRouteId = `animated-${routeId}`
    const vehicleId = `vehicle-${routeId}`
    
    try {
      // Create empty animated route initially
      map.value.addSource(animatedRouteId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: []
            },
            properties: feature.properties || {}
          }]
        }
      })
      
      // Add animated route layer (this will be revealed progressively)
      map.value.addLayer({
        id: `${animatedRouteId}-line`,
        type: 'line',
        source: animatedRouteId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#e74c3c', // Solid red for animated routes
          'line-width': 6, // Thicker than base layer
          'line-opacity': 0.9
        }
      })
      
      // Start animation for this route with stagger delay
      setTimeout(() => {
        animateRoute(feature, routeId, animatedRouteId, vehicleId, index, routeDuration)
      }, index * staggerDelay)
      
    } catch (error) {
      console.error(`Error setting up animation for route ${index}:`, error)
    }
  })
}

const animateRoute = (feature, routeId, animatedRouteId, vehicleId, routeIndex, routeDuration) => {
  // Handle both LineString and MultiLineString geometries
  let coordinates = []
  
  if (feature.geometry.type === 'LineString') {
    coordinates = feature.geometry.coordinates
  } else if (feature.geometry.type === 'MultiLineString') {
    // For MultiLineString, flatten all coordinates from all line segments to create one continuous path
    coordinates = feature.geometry.coordinates.reduce((acc, lineString) => {
      return acc.concat(lineString)
    }, [])
  } else {
    console.error(`Unsupported geometry type for animation: ${feature.geometry.type}`)
    return
  }
  
  if (!coordinates || coordinates.length === 0) {
    console.error(`No valid coordinates found for route ${routeIndex}`)
    return
  }
  
  console.log(`Route ${routeIndex}: ${coordinates.length} coordinates, duration: ${routeDuration}ms`)
  
  const totalSteps = coordinates.length
  let currentStep = 0
  let animatedCoordinates = []
  let isAnimationActive = true
  let startTime = null
  
  const animate = (timestamp) => {
    // Check if map still exists and animation is active
    if (!map.value || !isAnimationActive) {
      return
    }
    
    if (!startTime) startTime = timestamp
    const elapsed = timestamp - startTime
    
    // Calculate progress as percentage of total duration
    const progress = Math.min(elapsed / routeDuration, 1)
    currentStep = Math.floor(progress * totalSteps)
    
    if (progress >= 1 || currentStep >= totalSteps) {
      // Animation completed - show full route
      animatedCoordinates = [...coordinates]
      
      try {
        const animatedSource = map.value.getSource(animatedRouteId)
        if (animatedSource) {
          animatedSource.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: animatedCoordinates
              },
              properties: feature.properties
            }]
          })
        }
      } catch (error) {
        console.warn(`Final animation update error for route ${routeId}:`, error)
      }
      
      console.log(`Route ${routeIndex + 1} animation completed in ${elapsed.toFixed(0)}ms`)
      animationControllers.value.delete(routeId)
      return
    }
    
    // Get coordinates up to current step
    animatedCoordinates = coordinates.slice(0, Math.max(1, currentStep + 1))
    
    try {
      // Check if sources still exist before updating
      const animatedSource = map.value.getSource(animatedRouteId)
      
      if (animatedSource) {
        // Update animated route
        animatedSource.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [...animatedCoordinates]
            },
            properties: feature.properties
          }]
        })
      }
    } catch (error) {
      console.warn(`Animation error for route ${routeId}:`, error)
      isAnimationActive = false
      return
    }
    
    // Continue animation using requestAnimationFrame for smooth performance
    if (isAnimationActive) {
      requestAnimationFrame(animate)
    }
  }
  
  // Store animation control function
  const stopAnimation = () => {
    isAnimationActive = false
  }
  
  // Store stop function for external control
  animationControllers.value.set(`${routeId}-stop`, stopAnimation)
  
  // Start animation immediately using requestAnimationFrame
  requestAnimationFrame(animate)
}

const stopAllAnimations = () => {
  console.log('Stopping all animations...')
  
  // Show the base routes layer again
  if (map.value && map.value.getLayer('routes-lines')) {
    map.value.setLayoutProperty('routes-lines', 'visibility', 'visible')
  }
  
  // Clear all timeouts
  animationControllers.value.forEach((value, key) => {
    if (key.endsWith('-stop')) {
      // Call stop function
      if (typeof value === 'function') {
        value()
      }
    } else if (Array.isArray(value)) {
      // Clear timeout IDs
      value.forEach(timeoutId => clearTimeout(timeoutId))
    }
  })
  animationControllers.value.clear()
  
  console.log('All route animations stopped')
}

// Function to change animation speed
const setAnimationSpeed = (durationInSeconds) => {
  const newDuration = durationInSeconds * 1000 // Convert to milliseconds
  animationDuration.value = newDuration
  console.log(`Animation speed changed to ${durationInSeconds} seconds per route`)
  
  // If animations are running, restart them with new speed
  if (animationControllers.value.size > 0) {
    console.log('Restarting animations with new speed...')
    stopAllAnimations()
    // Reload routes to restart animations
    loadRoutesLayer()
  }
}

// Cleanup method
const cleanup = () => {
  // Stop all animations first
  stopAllAnimations()
  
  if (map.value) {
    map.value.remove()
    map.value = null
  }
}

// Vue lifecycle hooks
onMounted(() => {
  initializeMap()
  
  // Expose animation control functions for debugging
  window.setAnimationSpeed = setAnimationSpeed
  window.stopAllAnimations = stopAllAnimations
  console.log('Animation controls available: setAnimationSpeed(seconds), stopAllAnimations()')
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
