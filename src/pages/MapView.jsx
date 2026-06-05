import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl'
import Navbar from '../components/Navbar'
import FiltersModal from '../components/FiltersModal'
import { BookmarkIcon, ArrowIcon } from '../components/Icons'
import TagsRow from '../components/TagsRow'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const FALLBACK = { longitude: -104.9903, latitude: 39.7392, zoom: 13 }
const STYLE_CUSTOM = 'mapbox://styles/yetiisland/standard-map'
const STYLE_LIGHT = 'mapbox://styles/mapbox/light-v11'
const STYLE_SAT = 'mapbox://styles/mapbox/satellite-streets-v12'

const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)

function bustStyle(rating) {
  if (!rating) return null
  if (rating === 'No Bust') return { background: '#4a7a3a', color: '#ffffff', border: '1px solid #3d6830' }
  if (rating === 'Bust') return { background: '#c0453a', color: '#ffffff', border: '1px solid #a83830' }
  if (rating === 'Medium Bust' || rating === 'Weekends Only' || rating === 'Weekdays Only') return { background: '#c8a020', color: '#ffffff', border: '1px solid #b08818' }
  return { background: '#3D4454', color: '#FFFFFF', border: '1px solid #2e3344' }
}

function HeartPinSVG({ active = false }) {
  const fill = active ? '#fff' : '#d4785a'
  const stroke = active ? '#d4785a' : '#fff'
  const strokeW = active ? 2 : 1.2
  const size = active ? 36 : 28
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))', display: 'block', overflow: 'visible' }}>
      <path d="M12 20.5C12 20.5 3 15 3 8.5C3 5.5 5.5 3 8.5 3C10 3 11.3 3.7 12 4.8C12.7 3.7 14 3 15.5 3C18.5 3 21 5.5 21 8.5C21 15 12 20.5 12 20.5Z" fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" />
    </svg>
  )
}

function ShopPinSVG({ active = false }) {
  const color = active ? '#fff' : '#3D4454'
  const stroke = active ? '#3D4454' : '#fff'
  const strokeW = active ? 2.5 : 1.5
  const size = active ? 36 : 28
  return (
    <svg width={size * 0.83} height={size} viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))', display: 'block', overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill={color} stroke={stroke} strokeWidth={strokeW} />
      <circle cx="10" cy="10" r="4" fill={active ? '#3D4454' : '#fff'} />
    </svg>
  )
}

function ParkPinSVG({ active = false }) {
  const color = active ? '#fff' : '#d4785a'
  const stroke = active ? '#d4785a' : '#fff'
  const strokeW = active ? 2.5 : 1.5
  const size = active ? 36 : 28
  return (
    <svg width={size * 0.83} height={size} viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))', display: 'block', overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill={color} stroke={stroke} strokeWidth={strokeW} />
      <circle cx="10" cy="10" r="4" fill={active ? '#d4785a' : '#fff'} />
    </svg>
  )
}

function PinSVG({ active = false }) {
  const color = active ? '#fff' : '#d4785a'
  const stroke = active ? '#d4785a' : '#fff'
  const strokeW = active ? 2.5 : 1.5
  const size = active ? 36 : 28
  return (
    <svg width={size * 0.83} height={size} viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))', display: 'block', overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill={color} stroke={stroke} strokeWidth={strokeW} />
      <circle cx="10" cy="10" r="4" fill={active ? '#d4785a' : '#fff'} />
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

function CautionChip({ report, reportCustom, small = false }) {
  const text = report === 'Other' ? (reportCustom || 'Spot Reported') : report
  if (small) {
    return (
      <div style={{ position: 'absolute', bottom: 3, left: 3, right: 3, background: '#f5c518', borderRadius: 4, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 2 }}>
        <svg width="7" height="6" viewBox="0 0 18 16" fill="none">
          <path d="M9 1L17 15H1L9 1Z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          <line x1="9" y1="5.5" x2="9" y2="10" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="9" cy="12.5" r="0.9" fill="#000" />
        </svg>
        <span style={{ fontSize: 7, fontWeight: 700, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      </div>
    )
  }
  return (
    <div style={{ position: 'absolute', bottom: 6, left: 6, zIndex: 3, background: '#f5c518', borderRadius: 5, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3, maxWidth: 'calc(100% - 12px)' }}>
      <svg width="8" height="7" viewBox="0 0 18 16" fill="none">
        <path d="M9 1L17 15H1L9 1Z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <line x1="9" y1="5.5" x2="9" y2="10" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="12.5" r="0.9" fill="#000" />
      </svg>
      <span style={{ fontSize: 8, fontWeight: 700, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  )
}

export default function MapView({ spots, saved, onSavePress, onSpotClick, onAddSpot, userLocation, showNav = true, showFilterChips = true, showPeekCard = true, externalFilters, filters: propFilters, onFiltersChange, searchLocation, highlightedSpotId, onSearch }) {
  const [localFilters, setLocalFilters] = useState(['All'])
  const [selected, setSelected] = useState(null)
  const [viewState, setViewState] = useState(FALLBACK)
  const [satellite, setSatellite] = useState(false)
  const [baseStyle, setBaseStyle] = useState(STYLE_CUSTOM)
  const [unclusteredIds, setUnclusteredIds] = useState(() => new Set())
  const [mapReady, setMapReady] = useState(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769)
  const initializedRef = useRef(false)
  const mapRef = useRef()

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

  useEffect(() => {
    if (searchLocation) {
      setViewState(v => ({ ...v, longitude: searchLocation.longitude, latitude: searchLocation.latitude, zoom: 10 }))
    }
  }, [searchLocation])

  const activeFilters = propFilters ?? externalFilters ?? localFilters
  const handleFiltersChange = (next) => {
    setLocalFilters(next)
    onFiltersChange?.(next)
  }
  const filtered = spots.filter(s => {
    if (activeFilters.includes('All') || activeFilters.length === 0) return true
    return activeFilters.some(f => normalizeType(s.type) === normalizeType(f) || s.bust_rating === f || (s.features || []).map(x => x.toLowerCase()).includes(f.toLowerCase()))
  })

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
    setViewState(v => ({ ...v, longitude: spot.longitude, latitude: spot.latitude, zoom: 15 }))
  }, [selected, showPeekCard, onSpotClick])

  const handleMapClick = useCallback((e) => {
    if (e.features?.length > 0) {
      const feature = e.features[0]
      if (feature.properties?.cluster_id != null) {
        const map = mapRef.current.getMap()
        map.getSource('spots').getClusterExpansionZoom(feature.properties.cluster_id)
          .then(zoom => {
            setViewState(v => ({
              ...v,
              longitude: feature.geometry.coordinates[0],
              latitude: feature.geometry.coordinates[1],
              zoom: zoom + 0.5,
            }))
          })
        return
      }
    }
    setSelected(null)
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}

      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={e => setViewState(e.viewState)}
          onClick={handleMapClick}
          onIdle={updateUnclusteredIds}
          onLoad={updateUnclusteredIds}
          mapStyle={mapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={['clusters']}
          onError={() => { if (!satellite) setBaseStyle(STYLE_LIGHT) }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />

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
                {spot.type === 'Skate Shop'
                  ? <ShopPinSVG active={selected?.id === spot.id || highlightedSpotId === spot.id} />
                  : (spot.type === 'Park' || spot.type === 'Skatepark')
                    ? <ParkPinSVG active={selected?.id === spot.id || highlightedSpotId === spot.id} />
                    : saved.has(spot.id)
                      ? <HeartPinSVG active={selected?.id === spot.id || highlightedSpotId === spot.id} />
                      : <PinSVG active={selected?.id === spot.id || highlightedSpotId === spot.id} />}
              </Marker>
            ) : null
          )}
        </Map>

        {/* Filters row — top left */}
        {showFilterChips && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FiltersModal active={activeFilters} onChange={handleFiltersChange} />
              </div>
            </div>
          </div>
        )}

        {/* Satellite toggle — bottom left, above tab bar / floating nav */}
        {showFilterChips && (
          <div style={{
            position: 'absolute',
            bottom: isDesktop ? 100 : 16,
            left: 16,
            zIndex: 10,
          }}>
            <div onClick={() => setSatellite(s => !s)} style={btnStyle(satellite)}>
              <svg width="14" height="10" viewBox="0 0 20 14" fill="none">
                <path d="M10 1C5.5 1 1.5 7 1.5 7C1.5 7 5.5 13 10 13C14.5 13 18.5 7 18.5 7C18.5 7 14.5 1 10 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="10" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {satellite ? 'Default' : 'Satellite'}
            </div>
          </div>
        )}

        {/* Peek card — desktop: compact floating, mobile: full-width */}
        {showPeekCard && selected && (
          isDesktop ? (
            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 360, padding: '0 12px', zIndex: 10 }}>
              <div
                style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex' }}
                onClick={() => onSpotClick(selected)}
              >
                <div style={{ width: 80, flexShrink: 0, position: 'relative', background: '#F0E8DE', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, overflow: 'hidden' }}>
                  {selected.photos?.[0] ? (
                    <img src={selected.photos[0]} alt={selected.title} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                  ) : (
                    <svg width="32" height="20" viewBox="0 0 40 24" fill="none">
                      <rect x="1" y="15" width="38" height="6" rx="1" fill="#ddd0bc" />
                      <rect x="3" y="8" width="34" height="6" rx="1" fill="#e0cebc" />
                      <rect x="6" y="2" width="28" height="5" rx="1" fill="#e8d8c8" />
                    </svg>
                  )}
                  {selected.most_recent_report && selected.most_recent_report !== 'Skateable Again' && (
                    <CautionChip report={selected.most_recent_report} reportCustom={selected.most_recent_report_custom} small />
                  )}
                </div>
                <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</div>
                    {selected.distance != null && <div className="dist-text" style={{ flexShrink: 0 }}>{selected.distance} mi</div>}
                  </div>
                  <div className="spot-badge" style={{ alignSelf: 'flex-start', marginBottom: 4 }}>{normalizeType(selected.type)}</div>
                  {selected.description ? (
                    <div style={{ fontSize: 10, color: '#9a8878', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {selected.description}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px 10px 0', flexShrink: 0 }}>
                  <div
                    style={{ width: 24, height: 24, borderRadius: 5, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); onSavePress?.(selected) }}
                  >
                    <BookmarkIcon color="#d4785a" size={12} filled={saved.has(selected.id)} />
                  </div>
                  <div className="arrow-btn" style={{ width: 24, height: 24, flexShrink: 0 }}>
                    <ArrowIcon size={10} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 12px 12px', zIndex: 10 }}>
              <div style={{ width: 32, height: 3, background: '#C8CAD4', borderRadius: 2, margin: '8px auto 10px' }} />
              <div
                style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => onSpotClick(selected)}
              >
                <div className="spot-card-img">
                  {selected.photos?.[0] ? (
                    <img src={selected.photos[0]} alt={selected.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#F0E8DE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
                        <rect x="1" y="15" width="38" height="6" rx="1" fill="#ddd0bc" />
                        <rect x="3" y="8" width="34" height="6" rx="1" fill="#e0cebc" />
                        <rect x="6" y="2" width="28" height="5" rx="1" fill="#e8d8c8" />
                      </svg>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4 }}>
                    <div className="spot-badge">{normalizeType(selected.type)}</div>
                    {bustStyle(selected.bust_rating) && (
                      <div style={{ ...bustStyle(selected.bust_rating), fontSize: 9, padding: '3px 7px', borderRadius: 6, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                        {selected.bust_rating}
                      </div>
                    )}
                  </div>
                  {selected.most_recent_report && selected.most_recent_report !== 'Skateable Again' && (
                    <CautionChip report={selected.most_recent_report} reportCustom={selected.most_recent_report_custom} />
                  )}
                  <div style={{ position: 'absolute', top: 6, right: 6 }}>
                    <div
                      style={{ width: 22, height: 22, borderRadius: 5, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); onSavePress?.(selected) }}
                    >
                      <BookmarkIcon color="#d4785a" size={12} filled={saved.has(selected.id)} />
                    </div>
                  </div>
                </div>
                <div style={{ padding: '8px 10px 10px' }}>
                  <div className="spot-title-row">
                    <div className="spot-title" style={{ fontSize: 12 }}>{selected.title}</div>
                    {selected.distance != null && <div className="dist-text">{selected.distance} mi</div>}
                  </div>
                  {selected.description ? (
                    <div style={{ fontSize: 11, color: '#9a8878', marginBottom: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {selected.description}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TagsRow features={selected.features || []} />
                    <div className="arrow-btn" style={{ width: 24, height: 24, flexShrink: 0 }}>
                      <ArrowIcon size={10} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
