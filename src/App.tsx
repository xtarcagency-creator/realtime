import { useState } from 'react'
import CameraStage from './components/CameraStage'
import Dashboard from './components/Dashboard'
import type { ActivityEvent, TrackedPerson, Zone } from './lib/types'
import './App.css'

const MAX_EVENTS = 50

function App() {
  const [zones, setZones] = useState<Zone[]>([])
  const [people, setPeople] = useState<TrackedPerson[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [fps, setFps] = useState(0)
  const [drawMode, setDrawMode] = useState(false)

  function handleEvent(event: ActivityEvent) {
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
  }

  function renameZone(id: string, label: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, label } : z)))
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          Realtime Human Activity Analyser
        </div>
        <p className="tagline">
          Live in-browser person tracking, pose estimation &amp; zone-based behavior detection — a technology
          preview for retail loss-prevention (shoplifting detection) built by xtarc.agency.
        </p>
      </header>
      <main className="layout">
        <CameraStage
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
