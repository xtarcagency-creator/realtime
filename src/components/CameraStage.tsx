import { useEffect, useRef, useState } from 'react'
import { estimatePoses, preloadModels, resetTracking } from '../lib/pose'
import { classifyActivity, getCentroid, pushHistory } from '../lib/activity'
import {
  pointInZone,
  zoneCentroid,
  LINGER_THRESHOLD_RATIO,
  ZONE_EXIT_GRACE_SEC,
  ZONE_REVISIT_ALERT_COUNT,
  MIN_ZONE_POINTS,
  CLOSE_POINT_RADIUS_PX,
} from '../lib/zones'
import { computeCoverTransform, mapPointCover } from '../lib/coverMap'
import { ACTIVITY_COLORS } from '../lib/activityColors'
import type { ActivityEvent, DetectionQuality, OverlayMode, Point, Source, TrackedPerson, Zone } from '../lib/types'

const CANVAS_W = 1920
const CANVAS_H = 1080
// Drawing sizes below were tuned at a 1280-wide reference canvas; scale them
// with the actual canvas width so the overlay stays legible at any resolution.
const DRAW_SCALE = CANVAS_W / 1280

const SKELETON_EDGES: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
]

interface Props {
  source: Source
  zones: Zone[]
  onZonesChange: (zones: Zone[]) => void
  onPeopleUpdate: (people: TrackedPerson[]) => void
  onEvent: (event: ActivityEvent) => void
  onFps: (fps: number) => void
  drawMode: boolean
  quality: DetectionQuality
  alertPulse: number
  loiterThresholdSec: number
  onModelLoadingChange: (loading: boolean) => void
}

export default function CameraStage({
  source,
  zones,
  onZonesChange,
  onPeopleUpdate,
  onEvent,
  onFps,
  drawMode,
  quality,
  alertPulse,
  loiterThresholdSec,
  onModelLoadingChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peopleRef = useRef<Map<number, TrackedPerson>>(new Map())
  const zonesRef = useRef(zones)
  const qualityRef = useRef(quality)
  const loiterThresholdRef = useRef(loiterThresholdSec)
  const overlayModeRef = useRef<OverlayMode>('full')
  const [status, setStatus] = useState('Starting…')
  const [running, setRunning] = useState(true)
  const [draftPoints, setDraftPoints] = useState<Point[]>([])
  const [cursorPos, setCursorPos] = useState<Point | null>(null)
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('full')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoPlaying, setVideoPlaying] = useState(true)

  useEffect(() => {
    zonesRef.current = zones
  }, [zones])

  useEffect(() => {
    overlayModeRef.current = overlayMode
  }, [overlayMode])

  useEffect(() => {
    qualityRef.current = quality
    let cancelled = false
    onModelLoadingChange(true)
    preloadModels(quality).finally(() => {
      if (!cancelled) onModelLoadingChange(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality])

  useEffect(() => {
    loiterThresholdRef.current = loiterThresholdSec
  }, [loiterThresholdSec])

  // Restart the feed (camera re-request or upload re-play) whenever the source changes.
  useEffect(() => {
    setRunning(true)
    resetTracking()
  }, [source])

  // Leaving draw mode (or switching source) clears any in-progress zone.
  useEffect(() => {
    if (!drawMode) {
      setDraftPoints([])
      setCursorPos(null)
    }
  }, [drawMode])

  useEffect(() => {
    let stream: MediaStream | null = null
    let objectUrl: string | null = null
    let raf = 0
    let stopped = false
    let lastFrameTime = performance.now()
    let frameCount = 0
    let fpsTimer = performance.now()
    let detachPlaybackListeners: (() => void) | null = null

    async function start() {
      const video = videoRef.current!
      const canvas = canvasRef.current!
      canvas.width = CANVAS_W
      canvas.height = CANVAS_H
      peopleRef.current = new Map()

      if (!running) {
        setStatus('Feed stopped')
        canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
        onPeopleUpdate([])
        onFps(0)
        return
      }

      if (source.kind === 'camera') {
        setStatus('Requesting camera…')
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: CANVAS_W, height: CANVAS_H }, audio: false })
        } catch {
          setStatus('Camera access denied or unavailable.')
          return
        }
        video.srcObject = stream
        video.loop = false
      } else {
        setStatus('Loading video…')
        objectUrl = URL.createObjectURL(source.file)
        video.srcObject = null
        video.src = objectUrl
        video.loop = true
      }

      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) resolve()
        else video.onloadedmetadata = () => resolve()
      })
      await video.play()
      if (stopped) return

      const ctx = canvas.getContext('2d')!
      const cover = computeCoverTransform(video.videoWidth, video.videoHeight, CANVAS_W, CANVAS_H)

      setStatus('')

      if (source.kind === 'upload') {
        const handleTimeUpdate = () => setCurrentTime(video.currentTime)
        const handlePlay = () => setVideoPlaying(true)
        const handlePause = () => setVideoPlaying(false)
        const handleSeeked = () => {
          // redraw immediately so scrubbing while paused is visible, not just a frozen frame
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(video, cover.sx, cover.sy, cover.sw, cover.sh, 0, 0, canvas.width, canvas.height)
        }
        video.addEventListener('timeupdate', handleTimeUpdate)
        video.addEventListener('play', handlePlay)
        video.addEventListener('pause', handlePause)
        video.addEventListener('seeked', handleSeeked)
        setDuration(video.duration || 0)
        setCurrentTime(video.currentTime)
        setVideoPlaying(!video.paused)
        detachPlaybackListeners = () => {
          video.removeEventListener('timeupdate', handleTimeUpdate)
          video.removeEventListener('play', handlePlay)
          video.removeEventListener('pause', handlePause)
          video.removeEventListener('seeked', handleSeeked)
        }
      }

      const loop = async () => {
        if (stopped) return
        if (video.paused || video.ended) {
          raf = requestAnimationFrame(loop)
          return
        }
        const now = performance.now()
        const dt = (now - lastFrameTime) / 1000
        lastFrameTime = now

        const poses = await estimatePoses(video, qualityRef.current)

        ctx.save()
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(video, cover.sx, cover.sy, cover.sw, cover.sh, 0, 0, canvas.width, canvas.height)

        const seenIds = new Set<number>()

        for (const pose of poses) {
          const id = pose.id ?? -1
          if (id < 0) continue
          seenIds.add(id)

          const prev = peopleRef.current.get(id)
          const activityRaw = classifyActivity(pose, prev)

          const wristPoint = pose.keypoints
            .filter((k) => (k.name === 'left_wrist' || k.name === 'right_wrist') && (k.score ?? 0) > 0.3)
            .sort((a, b) => a.y - b.y)[0]
          // classifyActivity/history stay in native video-space (unaffected by canvas presentation size);
          // zones and drawing use the canvas-space point after the cover crop/scale.
          const centroid: Point = getCentroid(pose)
          const canvasCentroid = mapPointCover(centroid, cover)

          const loiterSec = loiterThresholdRef.current
          const lingerSec = loiterSec * LINGER_THRESHOLD_RATIO
          const zoneDwell = { ...(prev?.zoneDwell ?? {}) }
          const zoneLastInside = { ...(prev?.zoneLastInside ?? {}) }
          const zoneVisits = { ...(prev?.zoneVisits ?? {}) }
          for (const zone of zonesRef.current) {
            const inside = pointInZone(canvasCentroid, zone)
            const key = zone.id
            const before = zoneDwell[key] ?? 0
            if (inside) {
              zoneDwell[key] = before + dt
              zoneLastInside[key] = now
              if (before === 0) {
                zoneVisits[key] = (zoneVisits[key] ?? 0) + 1
                if (zoneVisits[key] === ZONE_REVISIT_ALERT_COUNT) {
                  onEvent({
                    id: `${Date.now()}-${id}-${key}-revisit`,
                    timestamp: Date.now(),
                    personId: id,
                    message: `Person ${id} has revisited "${zone.label}" ${ZONE_REVISIT_ALERT_COUNT} times`,
                    level: 'info',
                  })
                }
              }
              if (before < lingerSec && zoneDwell[key] >= lingerSec) {
                onEvent({
                  id: `${Date.now()}-${id}-${key}-linger`,
                  timestamp: Date.now(),
                  personId: id,
                  message: `Person ${id} lingering in "${zone.label}"`,
                  level: 'info',
                })
              }
              if (before < loiterSec && zoneDwell[key] >= loiterSec) {
                onEvent({
                  id: `${Date.now()}-${id}-${key}`,
                  timestamp: Date.now(),
                  personId: id,
                  message: `Person ${id} loitering in "${zone.label}" (${loiterSec}s+)`,
                  level: 'warning',
                })
              }
            } else {
              const lastInside = zoneLastInside[key] ?? 0
              const sinceLeftSec = (now - lastInside) / 1000
              if (sinceLeftSec > ZONE_EXIT_GRACE_SEC) {
                zoneDwell[key] = 0
                zoneLastInside[key] = 0
              }
              // else: briefly outside (flicker/occlusion) — hold dwell steady until grace expires
            }
          }

          const anyLoitering = Object.values(zoneDwell).some((v) => v >= loiterSec)
          const anyLingering = Object.values(zoneDwell).some((v) => v >= lingerSec)
          const activity = anyLoitering ? 'loitering' : anyLingering ? 'lingering' : activityRaw

          const history = pushHistory(prev?.history ?? [], centroid)

          const person: TrackedPerson = {
            id,
            centroid: canvasCentroid,
            wrist: wristPoint ? mapPointCover({ x: wristPoint.x, y: wristPoint.y }, cover) : null,
            activity,
            lastSeen: now,
            zoneDwell,
            zoneLastInside,
            zoneVisits,
            history,
          }
          peopleRef.current.set(id, person)

          const color = ACTIVITY_COLORS[activity] ?? '#94a3b8'
          if (overlayModeRef.current === 'full') {
            // draw skeleton
            ctx.strokeStyle = color
            ctx.lineWidth = 5 * DRAW_SCALE
            for (const [a, b] of SKELETON_EDGES) {
              const ka = pose.keypoints.find((k) => k.name === a)
              const kb = pose.keypoints.find((k) => k.name === b)
              if (ka && kb && (ka.score ?? 0) > 0.3 && (kb.score ?? 0) > 0.3) {
                const pa = mapPointCover(ka, cover)
                const pb = mapPointCover(kb, cover)
                ctx.beginPath()
                ctx.moveTo(pa.x, pa.y)
                ctx.lineTo(pb.x, pb.y)
                ctx.stroke()
              }
            }
            for (const k of pose.keypoints) {
              if ((k.score ?? 0) > 0.3) {
                const pk = mapPointCover(k, cover)
                ctx.beginPath()
                ctx.arc(pk.x, pk.y, 6 * DRAW_SCALE, 0, Math.PI * 2)
                ctx.fillStyle = color
                ctx.fill()
              }
            }
          } else {
            // minimal mode: just a marker at the person's tracked position
            ctx.beginPath()
            ctx.arc(canvasCentroid.x, canvasCentroid.y, 7 * DRAW_SCALE, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.fill()
          }
          const label = `#${id} ${activity}`
          ctx.font = `bold ${22 * DRAW_SCALE}px system-ui, sans-serif`
          const labelX = canvasCentroid.x + 12 * DRAW_SCALE
          const labelY = canvasCentroid.y - 14 * DRAW_SCALE
          const labelW = ctx.measureText(label).width
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          ctx.fillRect(labelX - 6 * DRAW_SCALE, labelY - 22 * DRAW_SCALE, labelW + 12 * DRAW_SCALE, 30 * DRAW_SCALE)
          ctx.fillStyle = color
          ctx.fillText(label, labelX, labelY)
        }

        for (const id of Array.from(peopleRef.current.keys())) {
          if (!seenIds.has(id)) peopleRef.current.delete(id)
        }

        // draw zones
        for (const zone of zonesRef.current) {
          if (zone.points.length < MIN_ZONE_POINTS) continue
          const occupied = Array.from(peopleRef.current.values()).some((p) => (p.zoneDwell[zone.id] ?? 0) > 0)
          const zoneColor = occupied ? '#dc2626' : '#2563eb'
          ctx.strokeStyle = zoneColor
          ctx.fillStyle = occupied ? 'rgba(220,38,38,0.1)' : 'rgba(37,99,235,0.08)'
          ctx.lineWidth = 3 * DRAW_SCALE
          ctx.beginPath()
          zone.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
          ctx.closePath()
          ctx.fill()
          ctx.stroke()

          const c = zoneCentroid(zone)
          ctx.font = `bold ${18 * DRAW_SCALE}px system-ui, sans-serif`
          const labelW = ctx.measureText(zone.label).width
          ctx.fillStyle = zoneColor
          ctx.fillText(zone.label, c.x - labelW / 2, c.y)
        }

        ctx.restore()

        onPeopleUpdate(Array.from(peopleRef.current.values()))

        frameCount++
        if (now - fpsTimer > 1000) {
          onFps(Math.round((frameCount * 1000) / (now - fpsTimer)))
          frameCount = 0
          fpsTimer = now
        }

        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      detachPlaybackListeners?.()
      stream?.getTracks().forEach((t) => t.stop())
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, running])

  function toCanvasCoords(e: React.MouseEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function finishZone(points: Point[]) {
    if (points.length < MIN_ZONE_POINTS) return
    const n = zones.length + 1
    onZonesChange([...zones, { id: `zone-${Date.now()}`, label: `Zone ${n}`, points }])
    setDraftPoints([])
    setCursorPos(null)
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (!drawMode) return
    const p = toCanvasCoords(e)
    if (draftPoints.length >= MIN_ZONE_POINTS) {
      const first = draftPoints[0]
      const dist = Math.hypot(p.x - first.x, p.y - first.y)
      if (dist < CLOSE_POINT_RADIUS_PX * DRAW_SCALE) {
        finishZone(draftPoints)
        return
      }
    }
    setDraftPoints((prev) => [...prev, p])
  }

  function handleCanvasMouseMove(e: React.MouseEvent) {
    if (!drawMode) return
    setCursorPos(toCanvasCoords(e))
  }

  function handleCapture() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `activity-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function togglePlayPause() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play()
    else video.pause()
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    const t = Number(e.target.value)
    video.currentTime = t
    setCurrentTime(t)
  }

  function formatTime(t: number) {
    if (!Number.isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const draftLine = cursorPos ? [...draftPoints, cursorPos] : draftPoints

  return (
    <div className="stage">
      <div className="stage-toolbar">
        {drawMode && (
          <div className="toolbar-group">
            <button className="btn" onClick={() => finishZone(draftPoints)} disabled={draftPoints.length < MIN_ZONE_POINTS}>
              Finish zone
            </button>
            <button className="btn" onClick={() => setDraftPoints([])} disabled={!draftPoints.length}>
              Cancel zone
            </button>
          </div>
        )}
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => setOverlayMode((m) => (m === 'full' ? 'minimal' : 'full'))}
            title="Toggle skeleton overlay"
          >
            {overlayMode === 'full' ? 'Overlay: Full' : 'Overlay: Minimal'}
          </button>
          <button className="btn" onClick={handleCapture}>
            Capture frame
          </button>
          <button className={running ? 'btn' : 'btn active'} onClick={() => setRunning((r) => !r)}>
            {running ? 'Stop feed' : 'Start feed'}
          </button>
        </div>
      </div>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <div className="stage-frame">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          className={drawMode ? 'draw-cursor' : ''}
        />
        {drawMode && draftPoints.length > 0 && (
          <svg className="zone-draft-overlay" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} preserveAspectRatio="none">
            <polyline
              points={draftLine.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth={3 * DRAW_SCALE}
              strokeDasharray={`${8 * DRAW_SCALE} ${6 * DRAW_SCALE}`}
            />
            {draftPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={7 * DRAW_SCALE} fill={i === 0 ? '#16a34a' : '#2563eb'} />
            ))}
          </svg>
        )}
        {alertPulse > 0 && <div key={alertPulse} className="alert-flash" />}
        {status && (
          <div className="stage-status">
            {status.endsWith('…') && <span className="spinner spinner-light" />}
            {status}
          </div>
        )}
      </div>
      {source.kind === 'upload' && running && (
        <div className="video-scrubber">
          <button className="btn" onClick={togglePlayPause}>
            {videoPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            className="scrub-range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
          />
          <span className="scrub-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  )
}
