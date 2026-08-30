import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl'
import Navbar from '../components/Navbar'
import FiltersModal from '../components/FiltersModal'
import SpotCard from '../components/SpotCard'
import { SHOP_STYLE } from '../lib/spotFields'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const FALLBACK = { longitude: -104.9903, latitude: 39.7392, zoom: 13 }

// Module-level — persists map center/zoom across unmount/remount (back navigation)
let _savedViewState = null
const STYLE_CUSTOM = 'mapbox://styles/mapbox/streets-v12'
const STYLE_LIGHT = 'mapbox://styles/mapbox/streets-v12'
const STYLE_SAT = 'mapbox://styles/mapbox/satellite-streets-v12'

const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)

const CLOSED_REPORTS = new Set(['No Longer Skateable', 'Spot Destroyed', "Spot Doesn't Exist", 'No Longer Exists', 'Skate Stopped'])

function getSpotPinColors(spot) {
  const report = spot.most_recent_report
  const active = report && report !== 'Skateable Again' ? report : null
  if (CLOSED_REPORTS.has(active)) return { fill: '#C8CAD4', stroke: '#6a6c7a' }
  if (active) return { fill: '#f5c518', stroke: '#000000' }
  const type = spot.type === 'Park' ? 'Skatepark' : spot.type
  if (type === 'Skate Shop') return { fill: SHOP_STYLE.bg, stroke: '#FFFFFF' }
  if (type === 'Skatepark') return { fill: '#FFFFFF', stroke: '#d4785a' }
  return { fill: '#d4785a', stroke: '#FFFFFF' }
}

function SpotPin({ fill, stroke, selected = false }) {
  const size = selected ? 36 : 28
  const strokeW = selected ? 2.5 : 1.5
  const shadow = selected
    ? 'drop-shadow(0 0 8px rgba(0,0,0,0.55)) drop-shadow(0 2px 6px rgba(0,0,0,0.45))'
    : 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))'
  return (
    <svg width={size * 0.83} height={size} viewBox="0 0 20 24" fill="none" style={{ filter: shadow, display: 'block', overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill={fill} stroke={stroke} strokeWidth={strokeW} />
      <circle cx="10" cy="10" r="4" fill={stroke} />
    </svg>
  )
}

function UserLocationDot({ heading }) {
  const hasHeading = heading !== null && heading !== undefined && !isNaN(heading)
  return (
    <div style={{ position: 'relative', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="user-loc-pulse" style={{ position: 'absolute', width: 36, height: 36, borderRadius: '50%', background: 'rgba(61,186,110,0.15)', border: '1.5px solid rgba(61,186,110,0.35)', pointerEvents: 'none' }} />
      {hasHeading && (
        <svg width="48" height="48" viewBox="0 0 48 48" style={{ position: 'absolute', transform: `rotate(${heading}deg)`, transition: 'transform 0.4s ease', pointerEvents: 'none' }}>
          <path d="M24 24 L19 4 L24 9 L29 4 Z" fill="rgba(61,186,110,0.55)" />
        </svg>
      )}
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#3dba6e', border: '2.5px solid #fff', boxShadow: '0 1px 6px rgba(0,0,0,0.35)', position: 'relative', zIndex: 2, flexShrink: 0 }} />
    </div>
  )
}

const clusterCircleLayer = {
  id: 'clusters',
  type: 'circle',
  source: 'spots',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#d4785a',
    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 26],
    'circle-stroke-width': 2.5,
    'circle-stroke-color': '#ffffff',
  },
}

const clusterCountLayer = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'spots',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 13,
  },
  paint: { 'text-color': '#ffffff' },
}

const unclusteredPointLayer = {
  id: 'unclustered-points',
  type: 'circle',
  source: 'spots',
  filter: ['!', ['has', 'point_count']],
  paint: { 'circle-radius': 0, 'circle-opacity': 0 },
}

export default function MapView({ spots, saved, onSavePress, onSpotClick, onAddSpot, userLocation, showNav = true, showFilterChips = true, showSatelliteToggle = true, showPeekCard = true, externalFilters, filters: propFilters, onFiltersChange, distance: propDistance, onDistanceChange, sortMode, onSortModeChange, searchLocation, onClearSearch, highlightedSpotId, onSearch, searchOverlay, fitOnMount = false, onHidePress, isActive = true }) {
  const [localFilters, setLocalFilters] = useState(['All'])
  const [selected, setSelected] = useState(null)
  const [viewState, setViewState] = useState(_savedViewState ?? FALLBACK)
  const [satellite, setSatellite] = useState(false)
  const [baseStyle, setBaseStyle] = useState(STYLE_CUSTOM)
  const [unclusteredIds, setUnclusteredIds] = useState(() => new Set())
  const [mapReady, setMapReady] = useState(false)
  const [fitDone, setFitDone] = useState(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769)
  // Skip auto-centering on userLocation if we already have a saved position
  const initializedRef = useRef(!!_savedViewState)
  const mapRef = useRef()
  const regionFitRef = useRef(null)

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 769)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (userLocation && !initializedRef.current) {
      initializedRef.current = true
      setViewState(v => ({ ...v, longitude: userLocation.longitude, latitude: userLocation.latitude }))
    }
  }, [userLocation])

  // When the map becomes visible after display:none, the canvas has 0x0 dimensions.
  // resize() tells Mapbox to re-measure the container and repaint correctly.
  useEffect(() => {
    if (!isActive) return
    const t = setTimeout(() => { mapRef.current?.getMap()?.resize() }, 0)
    return () => clearTimeout(t)
  }, [isActive])

  useEffect(() => {
    if (!searchLocation) return
    if (searchLocation.isRegion) return // handled by fitBounds effect below
    setViewState(v => ({ ...v, longitude: searchLocation.longitude, latitude: searchLocation.latitude, zoom: 10 }))
  }, [searchLocation])

  useEffect(() => {
    if (!searchLocation?.isRegion || !mapReady) return
    // Only auto-fit once per unique region name. Manual zoom/pan after that is permanent.
    if (regionFitRef.current === searchLocation.name) return
    // Prefer the geocoder's own region bbox (the actual state/place boundary)
    // over spot coordinates — spots only ever cover part of a region, so a
    // box derived from them is always tighter than the real region, and can
    // be drastically tighter if the spots happen to cluster in one area of
    // it. Fall back to spot coordinates only when no bbox came back.
    let bounds = searchLocation.bbox
      ? [[searchLocation.bbox[0], searchLocation.bbox[1]], [searchLocation.bbox[2], searchLocation.bbox[3]]]
      : null
    if (!bounds) {
      const coords = spots.filter(s => s.latitude && s.longitude)
      if (coords.length === 0) return
      const lngs = coords.map(s => s.longitude)
      const lats = coords.map(s => s.latitude)
      bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
    }
    const map = mapRef.current?.getMap()
    if (map) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 })
    } else {
      setViewState(v => ({ ...v, longitude: (bounds[0][0] + bounds[1][0]) / 2, latitude: (bounds[0][1] + bounds[1][1]) / 2, zoom: 9 }))
    }
    regionFitRef.current = searchLocation.name
  }, [searchLocation?.isRegion, searchLocation?.name, mapReady, spots])

  useEffect(() => {
    // Clear the fitted-region guard whenever searchLocation changes so a new
    // search always triggers an auto-fit, even if the name happens to repeat.
    if (!searchLocation) regionFitRef.current = null
  }, [searchLocation])

  useEffect(() => {
    if (!fitOnMount || fitDone || !mapReady) return
    const coords = spots.filter(s => s.latitude && s.longitude)
    if (coords.length === 0) return
    if (coords.length === 1) {
      setViewState(v => ({ ...v, longitude: coords[0].longitude, latitude: coords[0].latitude, zoom: 14 }))
      setFitDone(true)
      return
    }
    const lngs = coords.map(s => s.longitude)
    const lats = coords.map(s => s.latitude)
    const bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
    const map = mapRef.current?.getMap()
    if (map) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 })
    } else {
      setViewState(v => ({ ...v, longitude: (bounds[0][0] + bounds[1][0]) / 2, latitude: (bounds[0][1] + bounds[1][1]) / 2, zoom: 11 }))
    }
    setFitDone(true)
  }, [fitOnMount, fitDone, mapReady, spots])

  const activeFilters = propFilters ?? externalFilters ?? localFilters
  const handleFiltersChange = (next) => {
    setLocalFilters(next)
    onFiltersChange?.(next)
  }
  const handleDistanceChange = (d) => { onDistanceChange?.(d) }
  const filtered = spots.filter(s => {
    if (activeFilters.includes('All') || activeFilters.length === 0) return true
    const _TYPES = new Set(['Street', 'DIY', 'Skatepark', 'Skate Shop'])
    const _BUSTS = new Set(['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only'])
    const _LIGHTING = new Set(['Lights', 'No Lights'])
    const selTypes = activeFilters.filter(f => _TYPES.has(f))
    const selBusts = activeFilters.filter(f => _BUSTS.has(f))
    const selLighting = activeFilters.filter(f => _LIGHTING.has(f))
    const selFeats = activeFilters.filter(f => !_TYPES.has(f) && !_BUSTS.has(f) && !_LIGHTING.has(f) && f !== 'All')
    if (selTypes.length > 0 && !selTypes.some(t => normalizeType(s.type) === normalizeType(t))) return false
    if (selFeats.length > 0 && !selFeats.some(f => (s.features || []).map(x => x.toLowerCase()).includes(f.toLowerCase()))) return false
    if (selBusts.length > 0 && !selBusts.includes(s.bust_rating)) return false
    if (selLighting.length > 0 && !selLighting.includes(s.lighting)) return false
    return true
  })

  // `selected` is local UI state pointing at a spot for the peek card — it has
  // no automatic link to the pins actually on the map. If the selected spot
  // drops out of `filtered` (hidden, filtered out by type/feature/bust/
  // lighting, moderation change, etc.) this closes the peek card immediately
  // instead of leaving it stuck showing a spot whose pin is already gone.
  // Reads off `filtered`, which is itself derived from the shared `spots`
  // prop plus the shared filter state — no separate refetch.
  useEffect(() => {
    if (selected && !filtered.some(s => s.id === selected.id)) {
      setSelected(null)
    }
  }, [filtered, selected])

  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: filtered
      .filter(s => s.latitude && s.longitude)
      .map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: { id: String(s.id), saved: saved.has(s.id) ? 1 : 0 },
      })),
  }), [filtered, saved])

  const updateUnclusteredIds = useCallback(() => {
    if (!mapRef.current) return
    const map = mapRef.current.getMap()
    if (!map.isStyleLoaded() || !map.getLayer('unclustered-points')) return
    // Hide POI / transit labels — keep place names and road labels only
    const style = map.getStyle()
    if (style) {
      style.layers.forEach(layer => {
        const sl = layer['source-layer']
        if (sl === 'poi_label' || sl === 'transit_stop_label') {
          try { map.setLayoutProperty(layer.id, 'visibility', 'none') } catch {}
        }
      })
    }
    const features = map.queryRenderedFeatures({ layers: ['unclustered-points'] })
    setUnclusteredIds(new Set(features.map(f => String(f.properties.id))))
    setMapReady(true)
  }, [])

  const handlePinClick = useCallback((spot) => {
    if (!showPeekCard) {
      onSpotClick(spot)
      setViewState(v => ({ ...v, longitude: spot.longitude, latitude: spot.latitude, zoom: 15 }))
      return
    }
    if (selected?.id === spot.id) { setSelected(null); return }
    setSelected(spot)
    const map = mapRef.current?.getMap()
    if (map) {
      map.flyTo({
        center: [spot.longitude, spot.latitude],
        zoom: Math.max(mapRef.current?.getMap().getZoom() || 14, 14),
        // Desktop bottom padding is 16px larger than mobile's, on top of the
        // existing offset — larger bottom padding shrinks the map's centered
        // viewport from below, pushing the selected pin up by that much so
        // it clears the peek card + LIST/MAP pill now stacked beneath it.
        padding: { top: 60, bottom: isDesktop ? 336 : 280, left: 0, right: 0 },
        duration: 400,
        essential: true,
      })
    } else {
      setViewState(v => ({ ...v, longitude: spot.longitude, latitude: spot.latitude, zoom: 15 }))
    }
  }, [selected, showPeekCard, onSpotClick])

  const handleMapClick = useCallback((e) => {
    if (e.features?.length > 0) {
      const feature = e.features[0]
      if (feature.properties?.cluster_id != null) {
        const map = mapRef.current.getMap()
        // getClusterExpansionZoom is callback-based, not Promise-based — calling
        // .then() on it throws (it returns `this`), which silently killed every
        // cluster click.
        map.getSource('spots').getClusterExpansionZoom(feature.properties.cluster_id, (err, zoom) => {
          if (err) return
          map.easeTo({
            center: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
            zoom,
            duration: 500,
          })
        })
        return
      }
    }
    setSelected(null)
  }, [])

  const handleClusterMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) map.getCanvas().style.cursor = 'pointer'
  }, [])

  const handleClusterMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) map.getCanvas().style.cursor = ''
  }, [])

  const mapStyle = satellite ? STYLE_SAT : baseStyle

  const btnStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 5,
    background: active ? '#d4785a' : '#FDF8F0',
    border: '1.5px solid #d4785a', borderRadius: 6,
    padding: '5px 10px', cursor: 'pointer',
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    color: active ? '#fff' : '#d4785a', textTransform: 'uppercase',
    fontFamily: 'Barlow, sans-serif',
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', paddingBottom: isDesktop ? 0 : 'calc(max(env(safe-area-inset-bottom), 24px) + 72px)' }}>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}

      {searchOverlay || (
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={e => { _savedViewState = e.viewState; setViewState(e.viewState) }}
          onClick={handleMapClick}
          onMouseEnter={handleClusterMouseEnter}
          onMouseLeave={handleClusterMouseLeave}
          onIdle={updateUnclusteredIds}
          onLoad={updateUnclusteredIds}
          mapStyle={mapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={['clusters']}
          onError={() => { if (!satellite) setBaseStyle(STYLE_LIGHT) }}
          minZoom={2}
        >
          <Source id="spots" type="geojson" data={geojson} cluster={true} clusterMaxZoom={9} clusterRadius={50}>
            <Layer {...clusterCircleLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
          </Source>

          {userLocation && (
            <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
              <UserLocationDot heading={userLocation.heading} />
            </Marker>
          )}

          {filtered.map(spot =>
            spot.longitude && spot.latitude && (!mapReady || unclusteredIds.has(String(spot.id))) ? (
              <Marker
                key={spot.id}
                longitude={spot.longitude}
                latitude={spot.latitude}
                anchor="bottom"
                onClick={e => { e.originalEvent.stopPropagation(); handlePinClick(spot) }}
                style={{ overflow: 'visible' }}
              >
                <SpotPin {...getSpotPinColors(spot)} selected={selected?.id === spot.id || highlightedSpotId === spot.id} />
              </Marker>
            ) : null
          )}
        </Map>

        {/* Filters row — top */}
        {showFilterChips && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
            <FiltersModal active={activeFilters} onChange={handleFiltersChange} distance={propDistance} onDistanceChange={handleDistanceChange} sortMode={sortMode} onSortModeChange={onSortModeChange} searchLocation={searchLocation} onClearSearch={onClearSearch} />
          </div>
        )}

        {/* Eye/satellite toggle — bottom-right (within container on desktop) */}
        {showSatelliteToggle && (
          <div style={{ position: 'fixed', bottom: isDesktop ? 'var(--desktop-nav-clearance)' : 'calc(max(env(safe-area-inset-bottom), 24px) + 84px)', left: 0, right: 0, zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ maxWidth: isDesktop ? 1200 : '100%', margin: '0 auto', display: 'flex', justifyContent: 'flex-end', paddingRight: 10, pointerEvents: 'auto' }}>
              <div
                onClick={() => setSatellite(s => !s)}
                title={satellite ? 'Default map' : 'Satellite view'}
                style={{
                  width: 38, height: 38,
                  background: satellite ? '#FDF8F0' : '#d4785a',
                  border: satellite ? '2px solid #d4785a' : 'none',
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  pointerEvents: 'auto',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4L20 9L12 14L4 9L12 4Z"
                    stroke={satellite ? '#d4785a' : '#fff'} strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M4 13L12 18L20 13"
                    stroke={satellite ? '#d4785a' : '#fff'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="19" cy="5" r="2" fill={satellite ? '#d4785a' : '#fff'} />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Peek card — desktop: compact floating, mobile: full-width */}
        {showPeekCard && selected && (
          isDesktop ? (
            <div className="desktop-peek-card" style={{ position: 'fixed', bottom: 'var(--desktop-peek-card-bottom)', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '0 12px', zIndex: 100 }}>
              <SpotCard
                spot={selected}
                saved={saved.has(selected.id)}
                onSavePress={onSavePress}
                onClick={onSpotClick}
                onHidePress={onHidePress}
              />
            </div>
          ) : (
            <div className="mobile-peek-card" style={{ position: 'absolute', bottom: 60, left: 0, right: 0, padding: '0 12px 8px', zIndex: 10 }}>
              <div style={{ width: 32, height: 3, background: '#C8CAD4', borderRadius: 2, margin: '8px auto 10px' }} />
              <SpotCard
                spot={selected}
                saved={saved.has(selected.id)}
                onSavePress={onSavePress}
                onClick={onSpotClick}
                onHidePress={onHidePress}
              />
            </div>
          )
        )}
      </div>
      )}
    </div>
  )
}
