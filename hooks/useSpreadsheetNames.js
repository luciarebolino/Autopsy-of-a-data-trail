'use client'

import { useEffect, useState } from 'react'

const SHEET_ID = '1H5pFVnqCyDwAIBsxODIO0yMXnPoljnqGcYqbujsAnvI'

export const SHEET_GIDS = {
	names: '346008252',
	towers: '1572157430',
	timeline: '99596270',
}

/** Fetch any tab as CSV rows (array of string arrays). */
export function useSheetRows(gid) {
	const [rows, setRows] = useState(null) // null = loading

	useEffect(() => {
		if (!gid) return
		const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`

		fetch(url)
			.then(res => {
				if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
				return res.text()
			})
			.then(csv => {
				const parsed = parseCSV(csv)
				setRows(parsed)
			})
			.catch(err => {
				console.warn('Could not load sheet data:', err)
				setRows([])
			})
	}, [gid])

	return rows
}

/**
 * Returns names from the "names" tab, skipping the first 4 rows
 * (header + Lucia, Julia, Bani). Each name is from column A.
 */
export function useSpreadsheetNames() {
	const rows = useSheetRows(SHEET_GIDS.names)

	if (!rows) return []
	// Row 0 = header, rows 1-3 = fixed authors, rows 4+ = extra names
	return rows.slice(4).map(r => r[0]).filter(Boolean)
}

/**
 * Returns towers from the "towers" tab as [{name, lat, lng}, ...]
 * Assumes: col A = name, col C = lat, col D = lng (0-indexed: 0, 2, 3)
 */
export function useSpreadsheetTowers() {
	const rows = useSheetRows(SHEET_GIDS.towers)

	if (!rows || rows.length < 2) return []
	// Skip header row (index 0)
	return rows.slice(1).map(r => ({
		name: r[1] ?? '',
		lat: parseFloat(r[2]),
		lng: parseFloat(r[3]),
	})).filter(t => isFinite(t.lat) && isFinite(t.lng))
}

/**
 * Returns timeline entries from the "timeline" tab as
 * [{ year, geography, policy, technology }, ...]
 * Col A = year, B = geography, C = policy, D = technology
 */
export function useSpreadsheetTimeline() {
	const rows = useSheetRows(SHEET_GIDS.timeline)

	if (!rows || rows.length < 2) return []
	// Skip header row (index 0)
	return rows.slice(1)
		.map(r => ({
			year: (r[0] ?? '').trim(),
			geography: (r[1] ?? '').trim(),
			policy: (r[2] ?? '').trim(),
			technology: (r[3] ?? '').trim(),
		}))
		.filter(e => e.year)
		.sort((a, b) => {
			const ya = parseInt(a.year, 10)
			const yb = parseInt(b.year, 10)
			if (isNaN(ya) || isNaN(yb)) return 0
			return ya - yb
		})
}

/** Minimal CSV parser that handles quoted fields. */
function parseCSV(text) {
	const rows = []
	for (const rawLine of text.split('\n')) {
		const line = rawLine.replace(/\r$/, '')
		if (!line.trim()) continue
		const cols = []
		let cur = ''
		let inQuote = false
		for (let i = 0; i < line.length; i++) {
			const ch = line[i]
			if (inQuote) {
				if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
				else if (ch === '"') inQuote = false
				else cur += ch
			} else {
				if (ch === '"') inQuote = true
				else if (ch === ',') { cols.push(cur); cur = '' }
				else cur += ch
			}
		}
		cols.push(cur)
		rows.push(cols)
	}
	return rows
}
