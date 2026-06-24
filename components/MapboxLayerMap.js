'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { mapBounds, mapLayers, mapStyle, mapView } from '../config/layers'
import GooglePhotorealistic3D from './GooglePhotorealistic3D'
import { useSpreadsheetNames, useSpreadsheetTowers } from '../hooks/useSpreadsheetNames'

const MAPS = [
	{
		id: 'overview',
		linked: true,
		initialView: {
			center: [-6.380997, 35.672468],
			zoom: 4.731,
			bearing: 72,
			pitch: 0,
		},
	},
	{
		id: 'regional',
		linked: true,
		initialView: {
			center: [ -4.816925, 36.221829],
			zoom: 7.898,
			bearing: 72,
			pitch: 0,
		},
	},
]
const SCAN_FOLLOW_ZOOM = 15
const SCAN_FOLLOW_SCREEN_OFFSET = [0, 0]
export default function MapboxLayerMap() {
	const containerRefs = useRef({})
	const baseContainerRefs = useRef({})
	const mapsRef = useRef({})
	const baseMapsRef = useRef({})
	const coastRouteRef = useRef([])
	const coastScrubberRef = useRef(null)
	const draggingCoastRef = useRef(false)
	const draggingPointRef = useRef(false)
	const userOffsetXRef = useRef(0)
	const scanStartedRef = useRef(false)
	const scanFollowingRef = useRef(false)
	const lastScanFollowAtRef = useRef(0)
	const syncingRef = useRef(false)
	const initialSyncDoneRef = useRef(false)
	const loadedMapIdsRef = useRef(new Set())
	const loadedMapPartsRef = useRef(new Set())
	const [loadedMaps, setLoadedMaps] = useState({})
	const [error, setError] = useState('')
	const [activePanel, setActivePanel] = useState('layers')
	const [focus3D, setFocus3D] = useState(null)
	const [focusCoord, setFocusCoord] = useState(null)
	const [coastPosition, setCoastPosition] = useState(0)
	const [coastPositionX, setCoastPositionX] = useState(50)
	const [visibleLayers, setVisibleLayers] = useState(() => {
		return Object.fromEntries(
			Object.entries(mapLayers)
				.filter(([, layer]) => !layer.system)
				.map(([id, layer]) => [id, getDefaultLayerVisibility(layer)])
		)
	})
	const [expandedLayers, setExpandedLayers] = useState({})
	const layerSignature = JSON.stringify(mapLayers)
	const extraNames = useSpreadsheetNames()
	const towers = useSpreadsheetTowers()
	const [towersVisible, setTowersVisible] = useState(false)
	const [towersExpanded, setTowersExpanded] = useState(false)
	const [highlightedTower, setHighlightedTower] = useState(null)
	const towersMarkersRef = useRef([])

	useEffect(() => {
		const accessToken = cleanMapboxToken(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)

		if (!accessToken) {
			setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local.')
			return
		}

		mapboxgl.accessToken = accessToken

		MAPS.forEach((mapConfig) => {
			const overlayContainer = containerRefs.current[mapConfig.id]
			const baseContainer = baseContainerRefs.current[mapConfig.id]
			if (!overlayContainer || !baseContainer || mapsRef.current[mapConfig.id]) return

			const camera = mapConfig.initialView ? {
				center: mapConfig.initialView.center,
				zoom: mapConfig.initialView.zoom,
				bearing: mapConfig.initialView.bearing,
				pitch: mapConfig.initialView.pitch,
			} : {
				bounds: mapBounds,
				bearing: mapView.bearing,
				pitch: mapView.pitch,
			}

			const baseMap = new mapboxgl.Map({
				container: baseContainer,
				style: mapStyle,
				...camera,
				preserveDrawingBuffer: true,
				attributionControl: false,
				interactive: false,
			})

			const map = new mapboxgl.Map({
				container: overlayContainer,
				style: mapStyle,
				...camera,
				preserveDrawingBuffer: true,
				attributionControl: false,
			})

			mapsRef.current[mapConfig.id] = map
			baseMapsRef.current[mapConfig.id] = baseMap

			baseMap.on('load', () => {
				Object.entries(mapLayers)
					.filter(([, layer]) => isRasterLayer(layer))
					.forEach(([id, layer]) => addLayer(baseMap, id, layer))

				if (!mapConfig.initialView) {
					baseMap.fitBounds(mapBounds, {
						bearing: mapView.bearing,
						pitch: mapView.pitch,
						padding: mapView.padding,
						duration: 0,
					})
					baseMap.zoomTo(baseMap.getZoom() + mapConfig.zoomOffset, { duration: 0 })
				}

				baseMap.resize()
				markMapPartLoaded(mapConfig.id, 'base')
			})

			map.on('load', () => {
				Object.entries(mapLayers)
					.filter(([, layer]) => !isRasterLayer(layer))
					.forEach(([id, layer]) => addLayer(map, id, layer))

				if (!mapConfig.initialView) {
					map.fitBounds(mapBounds, {
						bearing: mapView.bearing,
						pitch: mapView.pitch,
						padding: mapView.padding,
						duration: 0,
					})
					map.zoomTo(map.getZoom() + mapConfig.zoomOffset, { duration: 0 })
				}

				map.resize()
				markMapPartLoaded(mapConfig.id, 'overlay')
			})

			map.on('move', () => {
				syncBaseMap(mapConfig.id)
				if (Date.now() - lastScanFollowAtRef.current < 1200) return
				if (scanFollowingRef.current) return
				if (scanStartedRef.current && mapConfig.id === 'regional') return
				if (!mapConfig.linked) return
				syncLinkedMaps(mapConfig.id)
			})

			map.on('click', event => {
				if (mapConfig.id === 'regional') {
					setFocus3D({
						longitude: event.lngLat.lng,
						latitude: event.lngLat.lat,
					})
				}
			})

			map.on('contextmenu', event => {
				event.preventDefault()
				copyMapView(mapConfig.id)
			})

			map.on('error', event => {
				if (event?.error?.message) setError(event.error.message)
			})
		})

		return () => {
			Object.values(mapsRef.current).forEach(map => map.remove())
			Object.values(baseMapsRef.current).forEach(map => map.remove())
			mapsRef.current = {}
			baseMapsRef.current = {}
		}
	}, [])

	useEffect(() => {
		fetch('/data/geojson/scan.geojson')
			.then(response => {
				if (!response.ok) throw new Error('Could not load /data/geojson/scan.geojson.')
				return response.json()
			})
			.then(data => {
				coastRouteRef.current = getLongestLineRoute(data)
			})
			.catch(loadError => {
				console.warn(loadError)
			})
	}, [])

	useEffect(() => {
		setVisibleLayers(current => ({
			...Object.fromEntries(
				Object.entries(mapLayers)
					.filter(([, layer]) => !layer.system)
					.map(([id, layer]) => [id, current[id] ?? getDefaultLayerVisibility(layer)])
			),
		}))
	}, [layerSignature])

	useEffect(() => {
		Object.entries(mapLayers).forEach(([id, layer]) => {
			const targetMaps = isRasterLayer(layer)
				? Object.values(baseMapsRef.current)
				: Object.values(mapsRef.current)

			targetMaps.forEach(map => {
				if (!map.loaded()) return
				if (!map.getLayer(id)) addLayer(map, id, layer)
				if (!map.getLayer(id)) return
				applyLayerStyles(map, id, layer)
				map.setLayoutProperty(id, 'visibility', visibleLayers[id] ? 'visible' : 'none')
			})
		})
	}, [loadedMaps, visibleLayers, layerSignature])

	function syncLinkedMaps(sourceId) {
		if (!initialSyncDoneRef.current) return
		if (syncingRef.current) return

		const source = mapsRef.current[sourceId]
		const targetId = sourceId === 'overview' ? 'regional' : 'overview'
		const target = mapsRef.current[targetId]
		if (!source || !target) return

		syncingRef.current = true

		const zoomDelta = getLinkedZoomDelta(sourceId, targetId)
		const center = getLinkedCenter(sourceId, targetId)

		target.jumpTo({
			center,
			zoom: source.getZoom() + zoomDelta,
			bearing: source.getBearing(),
			pitch: source.getPitch(),
		})
		syncBaseMap(targetId)

		syncingRef.current = false
	}

	function handleBarScrubStart(event) {
		event.preventDefault()
		event.stopPropagation()
		scanStartedRef.current = true
		draggingCoastRef.current = true
		draggingPointRef.current = false
		userOffsetXRef.current = 0
		event.currentTarget.setPointerCapture(event.pointerId)
		updateCoastFromPointer(event)
	}

	function handlePointScrubStart(event) {
		event.preventDefault()
		event.stopPropagation()
		scanStartedRef.current = true
		draggingCoastRef.current = true
		draggingPointRef.current = true
		event.currentTarget.setPointerCapture(event.pointerId)
		updateCoastFromPointer(event)
	}

	function handleCoastScrubMove(event) {
		if (!draggingCoastRef.current) return
		event.preventDefault()
		event.stopPropagation()
		updateCoastFromPointer(event)
	}

	function handleCoastScrubEnd(event) {
		event?.preventDefault()
		event?.stopPropagation()
		draggingCoastRef.current = false
		draggingPointRef.current = false
	}

	function updateCoastFromPointer(event) {
		const scrubber = coastScrubberRef.current
		const overviewMap = mapsRef.current.overview
		if (!scrubber || !overviewMap) return

		const scrubberRect = scrubber.getBoundingClientRect()
		const mapContainer = overviewMap.getContainer()
		const mapRect = mapContainer.getBoundingClientRect()
		
		const valueY = clamp(((event.clientY - scrubberRect.top) / scrubberRect.height) * 100, 0, 100)
		setCoastPosition(valueY)

		const route = coastRouteRef.current
		let coastCoordinate
		if (route.length >= 2) {
			coastCoordinate = interpolateRoute(route, valueY / 100).coordinate
		} else {
			coastCoordinate = overviewMap.getCenter().toArray()
		}

		const coastPixelX = overviewMap.project(coastCoordinate).x

		if (draggingPointRef.current) {
			const mousePixelX = event.clientX - mapRect.left
			userOffsetXRef.current = mousePixelX - coastPixelX
		}

		const finalPixelX = coastPixelX + userOffsetXRef.current
		const finalPixelY = scrubberRect.top - mapRect.top + (valueY / 100) * scrubberRect.height

		const focusCoordinate = overviewMap.unproject([finalPixelX, finalPixelY]).toArray()

		const valueX = clamp(((finalPixelX - (scrubberRect.left - mapRect.left)) / scrubberRect.width) * 100, 0, 100)
		setCoastPositionX(valueX)

		updateCoastFocusWithCoordinate(focusCoordinate)
	}

	function updateCoastFocusWithCoordinate(focusCoordinate) {
		const regionalMap = mapsRef.current.regional
		const overviewMap = mapsRef.current.overview
		if (!regionalMap || !overviewMap) return

		setFocusCoord({ longitude: focusCoordinate[0], latitude: focusCoordinate[1] })

		const center = getOffsetCenter(regionalMap, focusCoordinate, SCAN_FOLLOW_SCREEN_OFFSET)
		const overviewCamera = overviewMap ? getMapCamera(overviewMap) : null

		lastScanFollowAtRef.current = Date.now()
		scanFollowingRef.current = true
		syncingRef.current = true
		regionalMap.jumpTo({
			center,
			zoom: SCAN_FOLLOW_ZOOM,
			bearing: MAPS.find(map => map.id === 'regional')?.initialView.bearing ?? 72,
			pitch: 0,
		})
		syncBaseMap('regional')
		if (overviewCamera) {
			overviewMap.jumpTo(overviewCamera)
			syncBaseMap('overview')
		}
		window.setTimeout(() => {
			lastScanFollowAtRef.current = Date.now()
			if (overviewCamera) {
				overviewMap.jumpTo(overviewCamera)
				syncBaseMap('overview')
			}
			syncingRef.current = false
			scanFollowingRef.current = false
		}, 80)
	}

	function getLinkedZoomDelta(sourceId, targetId) {
		const sourceConfig = MAPS.find(item => item.id === sourceId)
		const targetConfig = MAPS.find(item => item.id === targetId)

		if (sourceConfig.initialView && targetConfig.initialView) {
			return targetConfig.initialView.zoom - sourceConfig.initialView.zoom
		}

		return (targetConfig.zoomOffset || 0) - (sourceConfig.zoomOffset || 0)
	}

	function getLinkedCenter(sourceId, targetId) {
		const source = mapsRef.current[sourceId]
		const sourceConfig = MAPS.find(item => item.id === sourceId)
		const targetConfig = MAPS.find(item => item.id === targetId)

		if (!sourceConfig.initialView || !targetConfig.initialView) {
			return source.getCenter()
		}

		const sourceInitial = mapboxgl.MercatorCoordinate.fromLngLat(sourceConfig.initialView.center)
		const sourceCurrent = mapboxgl.MercatorCoordinate.fromLngLat(source.getCenter())
		const targetInitial = mapboxgl.MercatorCoordinate.fromLngLat(targetConfig.initialView.center)

		const linkedCenter = new mapboxgl.MercatorCoordinate(
			targetInitial.x + (sourceCurrent.x - sourceInitial.x),
			targetInitial.y + (sourceCurrent.y - sourceInitial.y),
			targetInitial.z
		)

		return linkedCenter.toLngLat()
	}

	function applyInitialLinkedView() {
		if (initialSyncDoneRef.current) return
		if (!MAPS.every(map => loadedMapIdsRef.current.has(map.id))) return

		initialSyncDoneRef.current = true
	}

	function markMapPartLoaded(mapId, part) {
		loadedMapPartsRef.current.add(`${mapId}:${part}`)
		if (!loadedMapPartsRef.current.has(`${mapId}:base`)) return
		if (!loadedMapPartsRef.current.has(`${mapId}:overlay`)) return

		loadedMapIdsRef.current.add(mapId)
		syncBaseMap(mapId)
		applyInitialLinkedView()
		setLoadedMaps(current => ({ ...current, [mapId]: true }))
	}

	function syncBaseMap(mapId) {
		const source = mapsRef.current[mapId]
		const base = baseMapsRef.current[mapId]
		if (!source || !base) return

		base.jumpTo({
			center: source.getCenter(),
			zoom: source.getZoom(),
			bearing: source.getBearing(),
			pitch: source.getPitch(),
		})
	}

	function setLayerVisibility(layerId, visible) {
		applyLayerVisibility(layerId, visible)

		setVisibleLayers(current => ({
			...current,
			[layerId]: visible,
		}))

		if (!visible) {
			setExpandedLayers(current => ({
				...current,
				[layerId]: false,
			}))
		}
	}

	function applyLayerVisibility(layerId, visible) {
		const layer = mapLayers[layerId]
		if (!layer) return

		const targetMaps = isRasterLayer(layer)
			? Object.values(baseMapsRef.current)
			: Object.values(mapsRef.current)

		targetMaps.forEach(map => {
			if (!map?.loaded() || !map.getLayer(layerId)) return
			map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
		})
	}

	function toggleLayerExpansion(layerId) {
		if (!visibleLayers[layerId]) return

		setExpandedLayers(current => ({
			...current,
			[layerId]: !current[layerId],
		}))
	}
	function handleSearchLocation(coord) {
		const overviewMap = mapsRef.current.overview
		const scrubber = coastScrubberRef.current
		if (!overviewMap || !scrubber) return

		const mapContainer = overviewMap.getContainer()
		const mapRect = mapContainer.getBoundingClientRect()
		const scrubberRect = scrubber.getBoundingClientRect()

		const pixel = overviewMap.project(coord)

		const pixelYRelativeToScrubber = pixel.y + mapRect.top - scrubberRect.top
		const valueY = clamp((pixelYRelativeToScrubber / scrubberRect.height) * 100, 0, 100)
		setCoastPosition(valueY)

		const route = coastRouteRef.current
		let coastCoordinate
		if (route.length >= 2) {
			coastCoordinate = interpolateRoute(route, valueY / 100).coordinate
		} else {
			coastCoordinate = overviewMap.getCenter().toArray()
		}
		const coastPixelX = overviewMap.project(coastCoordinate).x

		userOffsetXRef.current = pixel.x - coastPixelX

		const finalPixelX = coastPixelX + userOffsetXRef.current
		const valueX = clamp(((finalPixelX - (scrubberRect.left - mapRect.left)) / scrubberRect.width) * 100, 0, 100)
		setCoastPositionX(valueX)

		setFocusCoord({ longitude: coord[0], latitude: coord[1] })
		updateCoastFocusWithCoordinate(coord)
	}

	function copyMapView(mapId) {
		const map = mapsRef.current[mapId]
		if (!map) return

		const bounds = map.getBounds()
		const view = {
			map: mapId,
			center: map.getCenter().toArray().map(roundCoordinate),
			zoom: roundNumber(map.getZoom()),
			bearing: roundNumber(map.getBearing()),
			pitch: roundNumber(map.getPitch()),
			bounds: [
				bounds.getWest(),
				bounds.getSouth(),
				bounds.getEast(),
				bounds.getNorth(),
			].map(roundCoordinate),
		}

		const text = JSON.stringify(view, null, 2)
		console.log('Map view', view)
		navigator.clipboard?.writeText(text).catch(() => {})
	}

	const allLoaded = MAPS.every(map => loadedMaps[map.id])

	// ─── Towers markers ───────────────────────────────────────────────────────
	useEffect(() => {
		// Remove any existing markers
		towersMarkersRef.current.forEach(m => m.remove())
		towersMarkersRef.current = []

		if (!towersVisible || towers.length === 0) return

		const maps = [mapsRef.current.overview, mapsRef.current.regional].filter(Boolean)
		if (maps.length === 0) return

		towers.forEach(tower => {
			maps.forEach(map => {
				const el = document.createElement('div')
				el.className = 'tower-marker'
				el.title = tower.name
				el.dataset.towerName = tower.name
				const marker = new mapboxgl.Marker({ element: el })
					.setLngLat([tower.lng, tower.lat])
					.setPopup(new mapboxgl.Popup({ offset: 10, closeButton: false })
						.setHTML(`<span style="font-size:0.85rem">${tower.name}</span>`))
					.addTo(map)
				towersMarkersRef.current.push(marker)
			})
		})
	}, [towers, towersVisible, loadedMaps])

	// ─── Highlight a tower on the overview map ────────────────────────────────
	function highlightTower(tower) {
		setHighlightedTower(tower.name)

		// Apply visual highlight to markers
		requestAnimationFrame(() => {
			towersMarkersRef.current.forEach(m => {
				const el = m.getElement()
				const isTarget = el.dataset.towerName === tower.name
				el.classList.toggle('tower-marker--highlighted', isTarget)
				if (isTarget && !m.getPopup()?.isOpen()) m.togglePopup()
			})
		})

		setFocus3D({ longitude: tower.lng, latitude: tower.lat })
	}

	// Re-apply highlight when markers are recreated
	useEffect(() => {
		if (!highlightedTower || towersMarkersRef.current.length === 0) return
		towersMarkersRef.current.forEach(m => {
			const el = m.getElement()
			el.classList.toggle('tower-marker--highlighted', el.dataset.towerName === highlightedTower)
		})
	}, [towers, towersVisible, loadedMaps, highlightedTower])

	return (
		<main className="map-page">
			<header className="map-header">
				<h1>
					Autopsy of a Data Trail - LAB 5: The Mechanics of Truth - Julia Nueno &amp; Lucia Rebolino with Bani Brusadin
					{extraNames.length > 0 && `, ${extraNames.join(', ')}`}
				</h1>
			</header>

			<section className="triptych">
				{MAPS.map(mapConfig => (
					<div key={mapConfig.id} className="map-column">
						{mapConfig.id === 'overview' && (
							<div
								ref={coastScrubberRef}
								className="coast-scrubber"
								role="slider"
								aria-label="Move along Spain coastline"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={roundNumber(coastPosition)}
								onPointerDown={handleBarScrubStart}
								onPointerMove={handleCoastScrubMove}
								onPointerUp={handleCoastScrubEnd}
								onPointerCancel={handleCoastScrubEnd}
							>
								<div
									className="coast-scrubber-line"
									style={{ top: `${coastPosition}%`, '--scrubber-x': `${coastPositionX}%` }}
								>
									<div
										className="coast-scrubber-point"
										onPointerDown={handlePointScrubStart}
									/>
								</div>
							</div>
						)}
						{mapConfig.id === 'regional' && (
							<div
								className="regional-crosshair"
								title="Left-click: copy coords · Right-click: go here in 3D"
								onClick={() => {
									if (!focusCoord) return
									const text = `${focusCoord.latitude.toFixed(6)}, ${focusCoord.longitude.toFixed(6)}`
									navigator.clipboard?.writeText(text).catch(() => {})
								}}
								onContextMenu={e => {
									e.preventDefault()
									if (focusCoord) setFocus3D(focusCoord)
								}}
							/>
						)}
						<div
							ref={element => {
								baseContainerRefs.current[mapConfig.id] = element
							}}
							className="map-container base-map-container"
						/>
						<div
							ref={element => {
								containerRefs.current[mapConfig.id] = element
							}}
							className="map-container overlay-map-container"
						/>
					</div>
				))}

				<div className="map-column">
					<GooglePhotorealistic3D focus={focus3D} />
					<SearchBar onLocationSelect={handleSearchLocation} />
				</div>

				<aside className="layers-column">
					<div className="panel-tabs" role="tablist" aria-label="Right panel">
						<button
							type="button"
							className={activePanel === 'layers' ? 'active' : ''}
							onClick={() => setActivePanel('layers')}
						>
							Layers
						</button>
						<button
							type="button"
							className={activePanel === 'arena' ? 'active' : ''}
							onClick={() => setActivePanel('arena')}
						>
							<img src="/data/geojson/arena.png" alt="Are.na" />
						</button>
					</div>

					{activePanel === 'layers' ? (
						<>
							<div className="layer-list">
								{Object.entries(mapLayers).filter(([, layer]) => !layer.system).map(([id, layer]) => {
									const isVisible = Boolean(visibleLayers[id])
									const isExpanded = Boolean(expandedLayers[id] && isVisible)

									return (
										<div
											key={id}
											className={`layer-row${isVisible ? ' active' : ''}${isExpanded ? ' expanded' : ''}`}
											style={{ '--layer-color': getLayerColor(id, layer) }}
										>
											<div className="layer-summary">
												<button
													type="button"
													className="layer-arrow"
													aria-expanded={isExpanded}
													aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${layer.name || id}`}
													disabled={!isVisible}
													onClick={() => toggleLayerExpansion(id)}
												>
													{isExpanded ? '▼' : '▶'}
												</button>
												<button
													type="button"
													className="layer-name"
													aria-pressed={isVisible}
													onClick={() => setLayerVisibility(id, !isVisible)}
												>
													{layer.name || id}
												</button>
											</div>
											{isExpanded && (
												<div className="layer-details">
													<div>{layer.type}</div>
													<div>{layer.data || layer.source?.tiles?.[0] || layer.source?.url || 'style source'}</div>
												</div>
											)}
										</div>
									)
								})}

								{/* Towers (spreadsheet layer) */}
								<div
									className={`layer-row${towersVisible ? ' active' : ''}${towersExpanded && towersVisible ? ' expanded' : ''}`}
									style={{ '--layer-color': '#0015ff' }}
								>
									<div className="layer-summary">
										<button
											type="button"
											className="layer-arrow"
											disabled={!towersVisible}
											aria-expanded={towersExpanded}
											onClick={() => setTowersExpanded(v => !v)}
										>
											{towersExpanded && towersVisible ? '▼' : '▶'}
										</button>
										<button
											type="button"
											className="layer-name"
											aria-pressed={towersVisible}
											onClick={() => {
												setTowersVisible(v => !v)
												if (towersVisible) setTowersExpanded(false)
											}}
										>
											Towers {towers.length > 0 && `(${towers.length})`}
										</button>
									</div>
									{towersExpanded && towersVisible && towers.length > 0 && (
										<div className="layer-details tower-list">
											{towers.map(tower => (
												<button
													key={tower.name}
													type="button"
													className={`tower-list-item${highlightedTower === tower.name ? ' highlighted' : ''}`}
													onClick={() => highlightTower(tower)}
												>
													<span className="tower-list-dot" />
													{tower.name}
												</button>
											))}
										</div>
									)}
								</div>
							</div>

						</>
					) : (
						<div className="arena-panel">
							<p>Space for Are.na channel content.</p>
						</div>
					)}
				</aside>
			</section>

			{!allLoaded && !error && <div className="map-message">Loading maps...</div>}
			{error && <div className="map-message">{error}</div>}
		</main>
	)
}

function addLayer(map, id, layer) {
	if (map.getLayer(id)) return

	if (!map.getSource(id)) {
		map.addSource(id, layer.source || {
			type: 'geojson',
			data: layer.data,
		})
	}

	const mapLayer = {
		id,
		type: layer.type,
		source: id,
		layout: {
			visibility: layer.visible === false ? 'none' : 'visible',
			...(layer.layout || {}),
		},
		paint: layer.paint || {},
	}

	if (layer.filter) mapLayer.filter = layer.filter
	if (layer.sourceLayer) mapLayer['source-layer'] = layer.sourceLayer

	const firstSymbolLayer = map.getStyle().layers?.find(styleLayer => styleLayer.type === 'symbol')
	map.addLayer(mapLayer, firstSymbolLayer?.id)
}

function applyLayerStyles(map, id, layer) {
	Object.entries(layer.paint || {}).forEach(([property, value]) => {
		map.setPaintProperty(id, property, value)
	})

	Object.entries(layer.layout || {}).forEach(([property, value]) => {
		if (property === 'visibility') return
		map.setLayoutProperty(id, property, value)
	})
}

function cleanMapboxToken(token) {
	return token?.trim().replace(/^['"]|['"]$/g, '') || ''
}

function isRasterLayer(layer) {
	return layer.type === 'raster'
}

function getDefaultLayerVisibility(layer) {
	if (typeof layer.visible === 'boolean') return layer.visible
	return isRasterLayer(layer)
}

function getLayerColor(id, layer) {
	if (id === 'bw_satellite') return '#c0c0c0'
	if (id === 'landsat_pan') return '#696969'
	return layer.paint?.['circle-stroke-color']
		|| layer.paint?.['circle-color']
		|| layer.paint?.['line-color']
		|| layer.paint?.['fill-color']
		|| '#f5deb3'
}

function getLongestLineRoute(geojson) {
	const lines = []

	geojson.features?.forEach(feature => {
		const geometry = feature.geometry
		if (!geometry) return

		if (geometry.type === 'LineString') {
			lines.push(geometry.coordinates)
		}

		if (geometry.type === 'MultiLineString') {
			geometry.coordinates?.forEach(line => {
				lines.push(line)
			})
		}
	})

	return lines
		.map(line => ({
			line,
			length: getRouteLength(line),
		}))
		.sort((a, b) => b.length - a.length)[0]?.line || []
}

function interpolateRoute(route, progress) {
	const targetDistance = getRouteLength(route) * clamp(progress, 0, 1)
	let walkedDistance = 0

	for (let index = 0; index < route.length - 1; index += 1) {
		const start = route[index]
		const end = route[index + 1]
		const segmentDistance = getCoordinateDistance(start, end)

		if (walkedDistance + segmentDistance >= targetDistance) {
			const segmentProgress = segmentDistance === 0
				? 0
				: (targetDistance - walkedDistance) / segmentDistance

			return {
				index,
				coordinate: [
					start[0] + (end[0] - start[0]) * segmentProgress,
					start[1] + (end[1] - start[1]) * segmentProgress,
				],
			}
		}

		walkedDistance += segmentDistance
	}

	return {
		index: route.length - 2,
		coordinate: route[route.length - 1],
	}
}

function getRouteLength(route) {
	return route.reduce((length, coordinate, index) => {
		if (index === 0) return 0
		return length + getCoordinateDistance(route[index - 1], coordinate)
	}, 0)
}

function getCoordinateDistance(start, end) {
	const x = end[0] - start[0]
	const y = end[1] - start[1]
	return Math.sqrt(x * x + y * y)
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value))
}

function getOffsetCenter(map, coordinate, offset) {
	const point = map.project(coordinate)
	return map.unproject([
		point.x - offset[0],
		point.y - offset[1],
	])
}

function getMapCamera(map) {
	return {
		center: map.getCenter(),
		zoom: map.getZoom(),
		bearing: map.getBearing(),
		pitch: map.getPitch(),
	}
}

function roundCoordinate(value) {
	return Number(value.toFixed(6))
}

function roundNumber(num) {
	return Math.round(num * 1000) / 1000
}

function SearchBar({ onLocationSelect }) {
	const inputRef = useRef(null)
	const autocompleteRef = useRef(null)

	useEffect(() => {
		if (!inputRef.current) return

		let interval = setInterval(() => {
			if (window.google && window.google.maps && window.google.maps.places) {
				clearInterval(interval)
				autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
					fields: ['geometry', 'name'],
				})

				autocompleteRef.current.addListener('place_changed', () => {
					const place = autocompleteRef.current.getPlace()
					if (place.geometry && place.geometry.location) {
						onLocationSelect([place.geometry.location.lng(), place.geometry.location.lat()])
					}
				})
			}
		}, 100)

		return () => clearInterval(interval)
	}, [onLocationSelect])

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			const query = inputRef.current.value
			if (!query) return

			if (window.google && window.google.maps && window.google.maps.Geocoder) {
				const geocoder = new window.google.maps.Geocoder()
				geocoder.geocode({ address: query }, (results, status) => {
					if (status === 'OK' && results[0]) {
						const loc = results[0].geometry.location
						onLocationSelect([loc.lng(), loc.lat()])
					}
				})
			}
		}
	}

	return (
		<div className="search-bar-container">
			<input 
				ref={inputRef}
				type="text" 
				placeholder="Search places or coordinates..." 
				className="search-bar-input"
				onKeyDown={handleKeyDown}
			/>
		</div>
	)
}
