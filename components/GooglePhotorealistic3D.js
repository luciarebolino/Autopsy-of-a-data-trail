'use client'

import { useEffect, useRef, useState } from 'react'

const CESIUM_VERSION = '1.105'
const CESIUM_JS = `https://ajax.googleapis.com/ajax/libs/cesiumjs/${CESIUM_VERSION}/Build/Cesium/Cesium.js`
const CESIUM_CSS = `https://ajax.googleapis.com/ajax/libs/cesiumjs/${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`
const INITIAL_VIEW = {
	longitude: -6.139295,
	latitude: 36.296569,
	height: 135.8,
	heading: 194.426,
	pitch: -36.764,
	roll: 0.033,
}

export default function GooglePhotorealistic3D({ focus }) {
	const containerRef = useRef(null)
	const streetViewRef = useRef(null)
	const viewerRef = useRef(null)
	const panoramaRef = useRef(null)
	const elevationServiceRef = useRef(null)
	
	const [error, setError] = useState('')
	const [viewMode, setViewMode] = useState('3d') // '3d' or 'streetview'
	const apiKey = cleanToken(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

	// Focus effect: Fly to or update Street View
	useEffect(() => {
		if (!focus) return

		if (viewMode === '3d' && viewerRef.current && window.Cesium) {
			const Cesium = window.Cesium
			const viewer = viewerRef.current

			const doFly = (groundElevation) => {
				const camHeight = groundElevation + INITIAL_VIEW.height
				// Calculate horizontal offset so camera sits behind the target
				// at the same relative position as the initial view
				const pitchRad = Math.abs(INITIAL_VIEW.pitch) * (Math.PI / 180)
				const headingRad = INITIAL_VIEW.heading * (Math.PI / 180)
				const horizontalDist = INITIAL_VIEW.height / Math.tan(pitchRad) // ~181m
				// Offset camera in the opposite direction of heading
				const offsetBearing = headingRad + Math.PI // 180° from heading
				const metersPerDegreeLat = 111320
				const metersPerDegreeLng = 111320 * Math.cos(focus.latitude * Math.PI / 180)
				const dLat = (horizontalDist * Math.cos(offsetBearing)) / metersPerDegreeLat
				const dLng = (horizontalDist * Math.sin(offsetBearing)) / metersPerDegreeLng

				viewer.camera.flyTo({
					destination: Cesium.Cartesian3.fromDegrees(
						focus.longitude + dLng,
						focus.latitude + dLat,
						camHeight
					),
					orientation: {
						heading: Cesium.Math.toRadians(INITIAL_VIEW.heading),
						pitch: Cesium.Math.toRadians(INITIAL_VIEW.pitch),
						roll: Cesium.Math.toRadians(INITIAL_VIEW.roll),
					},
					duration: 1.5,
				})
			}

			if (elevationServiceRef.current) {
				elevationServiceRef.current.getElevationForLocations(
					{ locations: [{ lat: focus.latitude, lng: focus.longitude }] },
					(results, status) => {
						const groundElev = (status === 'OK' && results[0]) ? results[0].elevation : 0
						doFly(groundElev)
					}
				)
			} else {
				doFly(0)
			}
		} else if (viewMode === 'streetview' && panoramaRef.current && window.google) {
			const svService = new window.google.maps.StreetViewService()
			const location = { lat: focus.latitude, lng: focus.longitude }
			
			svService.getPanorama(
				{ 
					location, 
					radius: 2000,
					preference: window.google.maps.StreetViewPreference.NEAREST 
				}, 
				(data, status) => {
				if (status === 'OK' && data.location) {
					panoramaRef.current.setPano(data.location.pano)
				} else {
					panoramaRef.current.setPosition(location)
				}
			})
		}
	}, [focus, viewMode])

	// Initialization effect
	useEffect(() => {
		if (!apiKey) {
			setError('Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local to load Google Photorealistic 3D.')
			return
		}

		let cancelled = false

		loadGoogleMaps(apiKey)
			.then(() => {
				if (cancelled || !window.google) return
				elevationServiceRef.current = new window.google.maps.ElevationService()

				if (streetViewRef.current && !panoramaRef.current) {
					panoramaRef.current = new window.google.maps.StreetViewPanorama(streetViewRef.current, {
						position: { lat: INITIAL_VIEW.latitude, lng: INITIAL_VIEW.longitude },
						pov: { heading: INITIAL_VIEW.heading, pitch: 0 },
						zoom: 1,
						disableDefaultUI: true,
						showRoadLabels: false,
					})
				}
			})
			.catch(err => console.warn('Failed to load Google Maps JS API', err))

		if (!containerRef.current || viewerRef.current) return

		loadCesium()
			.then(() => {
				if (cancelled || !containerRef.current || !window.Cesium) return

				const Cesium = window.Cesium
				const viewer = new Cesium.Viewer(containerRef.current, {
					animation: false,
					baseLayerPicker: false,
					fullscreenButton: false,
					geocoder: false,
					homeButton: false,
					infoBox: false,
					sceneModePicker: false,
					selectionIndicator: false,
					timeline: false,
					navigationHelpButton: false,
					imageryProvider: false,
					requestRenderMode: true,
				})

				viewer.scene.globe.show = false
				viewer.scene.skyAtmosphere.show = false
				viewer.scene.skyBox.show = false
				viewer.scene.backgroundColor = Cesium.Color.WHITE

				const tileset = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({
					url: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`,
					showCreditsOnScreen: false,
				}))

				viewer.camera.setView({
					destination: Cesium.Cartesian3.fromDegrees(
						INITIAL_VIEW.longitude,
						INITIAL_VIEW.latitude,
						INITIAL_VIEW.height
					),
					orientation: {
						heading: Cesium.Math.toRadians(INITIAL_VIEW.heading),
						pitch: Cesium.Math.toRadians(INITIAL_VIEW.pitch),
						roll: Cesium.Math.toRadians(INITIAL_VIEW.roll),
					},
				})

				tileset.readyPromise.catch((tilesetError) => {
					setError(tilesetError?.message || 'Google Photorealistic 3D tiles failed to load.')
				})

				viewerRef.current = viewer
			})
			.catch(loadError => {
				setError(loadError?.message || 'Cesium failed to load.')
			})

		return () => {
			cancelled = true
			if (viewerRef.current) {
				viewerRef.current.destroy()
				viewerRef.current = null
			}
		}
	}, [apiKey])

	return (
		<div className="google-3d-panel" style={{ position: 'relative', width: '100%', height: '100%' }}>
			<div className="view-mode-toggle">
				<button 
					type="button"
					className={viewMode === '3d' ? 'active' : ''} 
					onClick={() => setViewMode('3d')}
				>
					3D View
				</button>
				<button 
					type="button"
					className={viewMode === 'streetview' ? 'active' : ''} 
					onClick={() => setViewMode('streetview')}
				>
					Street View
				</button>
			</div>

			<div 
				ref={containerRef} 
				className="google-3d-container" 
				style={{ opacity: viewMode === '3d' ? 1 : 0, pointerEvents: viewMode === '3d' ? 'auto' : 'none' }} 
			/>
			
			<div 
				ref={streetViewRef} 
				className="street-view-container" 
				style={{ 
					position: 'absolute', 
					inset: 0, 
					opacity: viewMode === 'streetview' ? 1 : 0, 
					pointerEvents: viewMode === 'streetview' ? 'auto' : 'none',
					zIndex: viewMode === 'streetview' ? 1 : -1
				}} 
			/>
			
			{error && <div className="map-message">{error}</div>}
		</div>
	)
}

function loadGoogleMaps(apiKey) {
	return loadScript(`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=elevation,places`)
}

function loadCesium() {
	if (window.Cesium) return Promise.resolve()

	return Promise.all([
		loadStylesheet(CESIUM_CSS),
		loadScript(CESIUM_JS),
	])
}

function loadScript(src) {
	return new Promise((resolve, reject) => {
		if (src.includes('maps.googleapis.com') && window.google && window.google.maps) {
			resolve()
			return
		}
		if (src.includes('cesiumjs') && window.Cesium) {
			resolve()
			return
		}

		const srcBase = src.split('?')[0]
		const existing = document.querySelector(`script[src^="${srcBase}"]`)
		if (existing) {
			existing.addEventListener('load', resolve, { once: true })
			return
		}

		const script = document.createElement('script')
		script.src = src
		script.async = true
		script.onload = resolve
		script.onerror = () => reject(new Error(`Could not load ${src}`))
		document.head.appendChild(script)
	})
}

function loadStylesheet(href) {
	return new Promise((resolve, reject) => {
		if (document.querySelector(`link[href="${href}"]`)) {
			resolve()
			return
		}

		const link = document.createElement('link')
		link.rel = 'stylesheet'
		link.href = href
		link.onload = resolve
		link.onerror = () => reject(new Error(`Could not load ${href}`))
		document.head.appendChild(link)
	})
}

function cleanToken(token) {
	return token?.trim().replace(/^['"]|['"]$/g, '') || ''
}
