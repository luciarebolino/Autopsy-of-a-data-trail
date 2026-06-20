export const mapStyle = {
	version: 8,
	sources: {},
	layers: [],
}

export const mapBounds = [-6.2, 35.2, 4.4, 42.8]

export const mapView = {
	bearing: 72,
	pitch: 0,
	padding: 28,
}

export const mapLayers = {
	bw_satellite: {
		name: 'B/W satellite',
		type: 'raster',
		source: {
			type: 'raster',
			url: 'mapbox://mapbox.satellite',
			tileSize: 256,
		},
		paint: {
			'raster-saturation': 0,
			'raster-brightness-min': 0,
			'raster-brightness-max': 1,
			'raster-contrast': 0,
			'raster-opacity': 1,
		},
	},

	landsat_pan: {
		name: 'Landsat panchromatic',
		type: 'raster',
		visible: false,
		source: {
			type: 'raster',
			tiles: [
				'https://landsat2.arcgis.com/arcgis/rest/services/Landsat/Pan/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&f=image',
			],
			tileSize: 256,
			attribution: 'Esri, USGS, NASA Landsat',
		},
		paint: {
			'raster-opacity': 1,
		},
	},

	// fa_archeology: {
	// 	name: 'FA archaeology',
	// 	type: 'circle',
	// 	data: '/data/geojson/fa-archeology.geojson',
	// 	paint: {
	// 		'circle-color': '#ffffff',
	// 		'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.3, 8, 2.5, 12, 4],
	// 		'circle-stroke-color': '#f10006',
	// 		'circle-stroke-width': 1,
	// 		'circle-opacity': 0.95,
	// 		'circle-blur': 0.06,
	// 	},
	// },

	// example_boundary: {
	// 	name: 'Example boundary',
	// 	type: 'line',
	// 	data: '/data/geojson/example-boundary.geojson',
	// 	paint: {
	// 		'line-color': '#f10006',
	// 		'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 3],
	// 		'line-opacity': 0.85,
	// 	},
	// },

	military: {
		name: 'Military',
		type: 'line',
		data: '/data/geojson/military.geojson',
		paint: {
			'line-color': '#2dff6f',
			'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1],
			'line-opacity': 0.85,
		},
	},

	economic_zones: {
		name: 'Economic Zones',
		type: 'line',
		data: '/data/geojson/economic-zones.geojson',
		paint: {
			'line-color': '#bc2dff',
			'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1],
			'line-opacity': 1,
		},
	},

	spain: {
		name: 'Spain',
		type: 'line',
		data: '/data/geojson/spain.geojson',
		paint: {
			'line-color': '#0015ff',
			'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1],
			'line-opacity': 1,
		},
	},
	scan: {
		name: 'Scan',
		type: 'line',
		system: true,
		data: '/data/geojson/scan.geojson',
		paint: {
			'line-color': '#ffffff',
			'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1],
			'line-opacity': 0,
		},
	},
}
