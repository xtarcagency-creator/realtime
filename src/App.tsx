import { useEffect, useRef, useState } from 'react'
import CameraStage from './components/CameraStage'
import Dashboard from './components/Dashboard'
import type { ActivityEvent, Source, TrackedPerson, Zone } from './lib/types'
import './App.css'

const MAX_EVENTS = 50
const ZONES_STORAGE_KEY = 'realtime-activity-analyser.zones'

function loadStoredZones(): Zone[] {
  try {
    const raw = localStorage.getItem(ZONES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Zone[]) : []
  } catch {
    return []
  }
}

function App() {
  const [source, setSource] = useState<Source>({ kind: 'camera' })
  const [fileName, setFileName] = useState<string | null>(null)
  const [zones, setZones] = useState<Zone[]>(loadStoredZones)
  const [people, setPeople] = useState<TrackedPerson[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [fps, setFps] = useState(0)
  const [drawMode, setDrawMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones))
    } catch {
      // localStorage unavailable (private browsing, etc.) — zones just won't persist.
    }
  }, [zones])

  function handleEvent(event: ActivityEvent) {
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
  }

  function renameZone(id: string, label: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, label } : z)))
  }

  function deleteZone(id: string) {
    setZones((prev) => prev.filter((z) => z.id !== id))
  }

  function resetRun() {
    setPeople([])
    setEvents([])
  }

  function useCamera() {
    setFileName(null)
    setSource({ kind: 'camera' })
    resetRun()
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setSource({ kind: 'upload', file })
    resetRun()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">Realtime Human Activity Analyser</div>
        <p className="tagline">
          Live in-browser person tracking, pose estimation &amp; zone-based behavior detection (loitering,
          dwell time) — runs entirely client-side.
        </p>
        <div className="source-bar">
          <button className={source.kind === 'camera' ? 'btn active' : 'btn'} onClick={useCamera}>
            Live camera
          </button>
          <button className={source.kind === 'upload' ? 'btn active' : 'btn'} onClick={() => fileInputRef.current?.click()}>
            Upload video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          {fileName && source.kind === 'upload' && <span className="file-name">{fileName}</span>}
        </div>
      </header>
      <main className="layout">
        <CameraStage
          source={source}
          zones={zones}
          onZonesChange={setZones}
          onPeopleUpdate={setPeople}
          onEvent={handleEvent}
          onFps={setFps}
          drawMode={drawMode}
        />
        <Dashboard
          people={people}
          events={events}
          zones={zones}
          fps={fps}
          drawMode={drawMode}
          onToggleDraw={() => setDrawMode((d) => !d)}
          onClearZones={() => setZones([])}
          onRenameZone={renameZone}
          onDeleteZone={deleteZone}
        />
      </main>
    </div>
  )
}

export default App
