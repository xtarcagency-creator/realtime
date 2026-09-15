import { ACTIVITY_COLORS } from '../lib/activityColors'
import type { ActivityEvent, DetectionQuality, TrackedPerson, Zone } from '../lib/types'

const QUALITY_OPTIONS: { value: DetectionQuality; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
]

interface Props {
  people: TrackedPerson[]
  events: ActivityEvent[]
  zones: Zone[]
  fps: number
  drawMode: boolean
  onToggleDraw: () => void
  onClearZones: () => void
  onRenameZone: (id: string, label: string) => void
  onDeleteZone: (id: string) => void
  quality: DetectionQuality
  onQualityChange: (quality: DetectionQuality) => void
  onExportEvents: () => void
  loiterThresholdSec: number
  onLoiterThresholdChange: (sec: number) => void
  modelLoading: boolean
}

export default function Dashboard({
  people,
  events,
  zones,
  fps,
  drawMode,
  onToggleDraw,
  onClearZones,
  onRenameZone,
  onDeleteZone,
  quality,
  onQualityChange,
  onExportEvents,
  loiterThresholdSec,
  onLoiterThresholdChange,
  modelLoading,
}: Props) {
  return (
    <aside className="dashboard">
      <div className="panel">
        <div className="panel-title">Live status</div>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">{people.length}</span>
            <span className="stat-label">people tracked</span>
          </div>
          <div className="stat">
            <span className="stat-value">{fps}</span>
            <span className="stat-label">fps</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title-row">
          <div className="panel-title">Detection quality</div>
          {modelLoading && (
            <span className="loading-badge">
              <span className="spinner" />
              Loading model…
            </span>
          )}
        </div>
        <div className="panel-actions">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={quality === opt.value ? 'btn active' : 'btn'}
              onClick={() => onQualityChange(opt.value)}
              disabled={modelLoading && quality !== opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="empty" style={{ marginTop: 8 }}>
          Fast/Balanced scan the whole frame at once. High switches to a per-person pipeline (detect each person,
          then a sharper pose model on just their crop) — much better for small, close, or overlapping people
          (e.g. CCTV footage), at a real FPS cost. First use of High downloads the model (~40MB), cached after.
        </div>
      </div>

      <div className="panel">
        <div className="panel-title-row">
          <div className="panel-title">Zones</div>
          <div className="panel-actions">
            <button className={drawMode ? 'btn active' : 'btn'} onClick={onToggleDraw}>
              {drawMode ? 'Drawing…' : 'Draw zone'}
            </button>
            <button className="btn" onClick={onClearZones} disabled={!zones.length}>
              Clear
            </button>
          </div>
        </div>
        <div className="loiter-control">
          <span className="loiter-label">Loiter threshold</span>
          <div className="stepper">
            <button
              className="btn"
              onClick={() => onLoiterThresholdChange(Math.max(2, loiterThresholdSec - 2))}
              aria-label="Decrease loiter threshold"
            >
              −
            </button>
            <span className="stepper-value">{loiterThresholdSec}s</span>
            <button
              className="btn"
              onClick={() => onLoiterThresholdChange(Math.min(60, loiterThresholdSec + 2))}
              aria-label="Increase loiter threshold"
            >
              +
            </button>
          </div>
        </div>
        {drawMode && (
          <div className="empty" style={{ marginBottom: 8 }}>
            Click to place each corner (3+), then click the first point again — or use "Finish zone" above the
            video — to close it.
          </div>
        )}
        {!zones.length && !drawMode && <div className="empty">Draw a zone to mark a shelf/aisle.</div>}
        <ul className="zone-list">
          {zones.map((z) => (
            <li key={z.id} className="zone-row">
              <input
                value={z.label}
                onChange={(e) => onRenameZone(z.id, e.target.value)}
                className="zone-input"
              />
              <button
                className="zone-remove"
                onClick={() => onDeleteZone(z.id)}
                aria-label={`Delete ${z.label}`}
                title="Delete zone"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <div className="panel-title">People</div>
        {!people.length && <div className="empty">No one detected yet.</div>}
        <ul className="people-list">
          {people.map((p) => (
            <li key={p.id} className={`activity-${p.activity}`}>
              <span className="activity-dot" style={{ background: ACTIVITY_COLORS[p.activity] }} />
              <span className="pill">#{p.id}</span>
              <span className="activity-label">{p.activity}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel panel-grow">
        <div className="panel-title-row">
          <div className="panel-title">Event log</div>
          <button className="btn" onClick={onExportEvents} disabled={!events.length}>
            Export CSV
          </button>
        </div>
        {!events.length && <div className="empty">Events (lingering, loitering) appear here.</div>}
        <ul className="event-list">
          {events.map((e) => (
            <li key={e.id} className={e.level}>
              <span className={`event-dot ${e.level}`} />
              <div className="event-body">
                <span className="event-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span>{e.message}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
