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

export default function GooglePhotorealistic3D() {
	const containerRef = useRef(null)
	const viewerRef = useRef(null)
	const [error, setError] = useState('')
	const apiKey = cleanToken(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

	useEffect(() => {
		if (!containerRef.current || viewerRef.current) return

		if (!apiKey) {
			setError('Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local to load Google Photorealistic 3D.')
			return
		}

		let cancelled = false

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
		<div className="google-3d-panel">
			<div ref={containerRef} className="google-3d-container" />
			{error && <div className="map-message">{error}</div>}
		</div>
	)
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
		const existing = document.querySelector(`script[src="${src}"]`)
		if (existing) {
			existing.addEventListener('load', resolve, { once: true })
			if (window.Cesium) resolve()
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
