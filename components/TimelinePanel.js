'use client'

import { useState } from 'react'
import { useSpreadsheetTimeline } from '../hooks/useSpreadsheetNames'

const CATEGORIES = [
	{ key: 'geography', label: 'Geography', color: '#0015ff' },
	{ key: 'policy', label: 'Policy', color: '#111' },
	{ key: 'technology', label: 'Technology', color: '#888' },
]

const TECH_SUBS = [
	{ key: 'documentacion', label: 'Documentación' },
	{ key: 'interpelacion', label: 'Interpelación al SIVE' },
]

export default function TimelinePanel() {
	const entries = useSpreadsheetTimeline()
	const [expandedRows, setExpandedRows] = useState({})

	if (entries.length === 0) {
		return (
			<div className="timeline-panel">
				<p className="timeline-loading">Loading timeline…</p>
			</div>
		)
	}

	function toggleRow(rowKey) {
		setExpandedRows(prev => ({
			...prev,
			[rowKey]: !prev[rowKey],
		}))
	}

	return (
		<div className="timeline-panel">
			{/* Column headers */}
			<div className="timeline-col-headers">
				{CATEGORIES.map(cat => (
					<div key={cat.key} className="timeline-col-header" style={{ '--cat-color': cat.color }}>
						{cat.label}
					</div>
				))}
			</div>

			{/* Scrollable timeline body */}
			<div className="timeline-body">
				{entries.map((entry, i) => {
					const hasContent = CATEGORIES.some(cat => entry[cat.key])
					if (!hasContent) return null

					const rowKey = `${entry.year}-${i}`
					const hasSubs = entry.documentacion || entry.interpelacion
					const isExpanded = Boolean(expandedRows[rowKey])

					return (
						<div key={rowKey} className="timeline-row">
							{/* Year label on the left spine */}
							<div className="timeline-year">
								<span className="timeline-year-text">{entry.year}</span>
								<span className="timeline-year-dot" />
							</div>

							{/* Three category columns */}
							<div className="timeline-cells">
								{CATEGORIES.map(cat => (
									<div
										key={cat.key}
										className={`timeline-cell${entry[cat.key] ? ' has-content' : ''}`}
										style={{ '--cat-color': cat.color }}
									>
										{entry[cat.key] && cat.key === 'technology' && hasSubs ? (
											<div
												className={`timeline-card timeline-card--expandable${isExpanded ? ' expanded' : ''}`}
												onClick={() => toggleRow(rowKey)}
												role="button"
												tabIndex={0}
												onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(rowKey) } }}
											>
												<div className="timeline-card-header">
													<span className="timeline-card-arrow">{isExpanded ? '▾' : '▸'}</span>
													{entry[cat.key]}
												</div>
												{isExpanded && (
													<div className="timeline-card-subs">
														{TECH_SUBS.map(sub => (
															entry[sub.key] && (
																<div key={sub.key} className="timeline-card-sub">
																	<span className="timeline-card-sub-label">{sub.label}</span>
																	<span className="timeline-card-sub-text">{entry[sub.key]}</span>
																</div>
															)
														))}
													</div>
												)}
											</div>
										) : entry[cat.key] ? (
											<div className="timeline-card">
												{entry[cat.key]}
											</div>
										) : null}
									</div>
								))}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
