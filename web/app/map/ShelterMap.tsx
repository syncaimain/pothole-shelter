'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import {LngLatBounds, Map as MapLibreMap, NavigationControl, setWorkerUrl, type MapLayerMouseEvent} from 'maplibre-gl'
import {useEffect, useRef} from 'react'

// OpenFreeMap: free public tiles, no key, no request limits; attribution required. The style
// carries its own attribution (OpenFreeMap © OpenMapTiles Data from OpenStreetMap), which the
// attribution control shows; adding it again printed it twice.
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

// Served by scripts/copy-maplibre-worker.mjs; the bundler does not emit MapLibre's worker.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

export interface MapPoint {
  lat: number
  lng: number
  name: string
  slug: string
  outcome: string
}

const COLORS: Record<string, string> = {
  adopted: '#1f6b3a',
  ghost: '#5b5b78',
  transferred: '#2f5b8a',
  feral: '#8a3b12',
  shelter: '#b08000',
  unmapped: '#6b4b6b',
}

/**
 * Supplementary map. Every pet on it is also reachable from the gallery list, and
 * locations are already rounded to 3 decimals (about 100 m) before they reach the browser.
 */
export function ShelterMap({points, height = 420, zoom}: {points: MapPoint[]; height?: number; zoom?: number}) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!box.current || points.length === 0) return
    const map = new MapLibreMap({
      container: box.current,
      style: STYLE,
      center: [points[0]!.lng, points[0]!.lat],
      zoom: zoom ?? 13,
      attributionControl: {compact: false},
    })
    map.addControl(new NavigationControl({showCompass: false}))

    map.on('load', () => {
      map.addSource('pets', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: points.map((p) => ({
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [p.lng, p.lat]},
            properties: {name: p.name, slug: p.slug, color: COLORS[p.outcome] ?? '#444'},
          })),
        },
      })
      map.addLayer({
        id: 'pets',
        type: 'circle',
        source: 'pets',
        paint: {'circle-radius': points.length > 1 ? 5 : 9, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff'},
      })
      if (points.length > 1) {
        const b = new LngLatBounds()
        for (const p of points) b.extend([p.lng, p.lat])
        map.fitBounds(b, {padding: 30, animate: false})
        map.on('click', 'pets', (e: MapLayerMouseEvent) => {
          const slug = e.features?.[0]?.properties?.slug
          if (typeof slug === 'string') window.location.href = `/pothole/${slug}`
        })
        map.on('mouseenter', 'pets', () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', 'pets', () => (map.getCanvas().style.cursor = ''))
      }
    })
    return () => map.remove()
  }, [points, zoom])

  return <div ref={box} className="map" style={{height}} role="region" aria-label={`Map of ${points.length === 1 ? 'this pet' : `${points.length} pets`}`} />
}
