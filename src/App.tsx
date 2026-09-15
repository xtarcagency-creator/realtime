import { useRef, useState } from 'react'
import CameraStage from './components/CameraStage'
import Dashboard from './components/Dashboard'
import type { ActivityEvent, Source, TrackedPerson, Zone } from './lib/types'
import './App.css'

const MAX_EVENTS = 50

function App() {
  const [source, setSource] = useState<Source>({ kind: 'camera' })
  const [fileName, setFileName] = useState<string | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [people, setPeople] = useState<TrackedPerson[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [fps, setFps] = useState(0)
  const [drawMode, setDrawMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleEvent(event: ActivityEvent) {
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
  }

  function renameZone(id: string, label: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, label } : z)))
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
          Live in-browser person tracking, pose estimation &amp; zone-based behavior detection — a technology
          preview for retail loss-prevention (shoplifting detection) built by xtarc.agency.
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
        />
      </main>
    </div>
  )
}

export default App
