import 'mapbox-gl/dist/mapbox-gl.css'
import './globals.css'

export const metadata = {
	title: {
		default: 'Autopsy Data Trail',
		template: '%s',
	},
	description: 'A simple Mapbox layer viewer for GeoJSON cartography.',
}

export const viewport = {
	colorScheme: 'light',
}

export default function RootLayout({ children }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body suppressHydrationWarning>{children}</body>
		</html>
	)
}
