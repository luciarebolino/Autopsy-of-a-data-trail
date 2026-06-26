'use client'

import { useSpreadsheetTimeline } from '../hooks/useSpreadsheetNames'

const CATEGORIES = [
	{ key: 'geography', label: 'Geography', color: '#0015ff' },
	{ key: 'policy', label: 'Policy', color: '#111' },
	{ key: 'technology', label: 'Technology', color: '#888' },
]

export default function TimelinePanel() {
	const entries = useSpreadsheetTimeline()

	if (entries.length === 0) {
		return (
			<div className="timeline-panel">
				<p className="timeline-loading">Loading timeline…</p>
			</div>
		)
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

					return (
						<div key={`${entry.year}-${i}`} className="timeline-row">
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
										{entry[cat.key] && (
											<div className="timeline-card">
												{entry[cat.key]}
											</div>
										)}
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
