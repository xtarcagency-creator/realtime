import { useEffect, useRef, useState } from 'react'
import { getDetector, type Detector } from '../lib/pose'
import { classifyActivity, getCentroid, pushHistory } from '../lib/activity'
import { pointInZone, zoneCentroid, LOITER_THRESHOLD_SEC, MIN_ZONE_POINTS, CLOSE_POINT_RADIUS_PX } from '../lib/zones'
import { computeCoverTransform, mapPointCover } from '../lib/coverMap'
import type { ActivityEvent, DetectionQuality, Point, Source, TrackedPerson, Zone } from '../lib/types'

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

const ACTIVITY_COLORS: Record<string, string> = {
  standing: '#64748b',
  sitting: '#0d9488',
  walking: '#2563eb',
  bending: '#b45309',
  reaching: '#7c3aed',
  loitering: '#dc2626',
}

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
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peopleRef = useRef<Map<number, TrackedPerson>>(new Map())
  const zonesRef = useRef(zones)
  const detectorRef = useRef<Detector | null>(null)
  const [status, setStatus] = useState('Starting…')
  const [running, setRunning] = useState(true)
  const [draftPoints, setDraftPoints] = useState<Point[]>([])
  const [cursorPos, setCursorPos] = useState<Point | null>(null)

  useEffect(() => {
    zonesRef.current = zones
  }, [zones])

  // Restart the feed (camera re-request or upload re-play) whenever the source changes.
  useEffect(() => {
    setRunning(true)
  }, [source])

  // Load (or swap) the pose model independently of the camera/video pipeline,
  // so changing quality doesn't interrupt the live feed.
  useEffect(() => {
    let cancelled = false
    detectorRef.current = null
    getDetector(quality).then((detector) => {
      if (!cancelled) detectorRef.current = detector
    })
    return () => {
      cancelled = true
    }
  }, [quality])

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

      const loop = async () => {
        if (stopped) return
        if (video.paused || video.ended) {
          raf = requestAnimationFrame(loop)
          return
        }
        const detector = detectorRef.current
        if (!detector) {
          raf = requestAnimationFrame(loop)
          return
        }
        const now = performance.now()
        const dt = (now - lastFrameTime) / 1000
        lastFrameTime = now

        const poses = await detector.estimatePoses(video, { flipHorizontal: false })

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

          const zoneDwell = { ...(prev?.zoneDwell ?? {}) }
          for (const zone of zonesRef.current) {
            const inside = pointInZone(canvasCentroid, zone)
            const key = zone.id
            if (inside) {
              const before = zoneDwell[key] ?? 0
              zoneDwell[key] = before + dt
              if (before < LOITER_THRESHOLD_SEC && zoneDwell[key] >= LOITER_THRESHOLD_SEC) {
                onEvent({
                  id: `${Date.now()}-${id}-${key}`,
                  timestamp: Date.now(),
                  personId: id,
                  message: `Person ${id} loitering in "${zone.label}" (${LOITER_THRESHOLD_SEC}s+)`,
                  level: 'warning',
                })
              }
            } else {
              zoneDwell[key] = 0
            }
          }

          const anyLoitering = Object.values(zoneDwell).some((v) => v >= LOITER_THRESHOLD_SEC)
          const activity = anyLoitering ? 'loitering' : activityRaw

          const history = pushHistory(prev?.history ?? [], centroid)

          const person: TrackedPerson = {
            id,
            centroid: canvasCentroid,
            wrist: wristPoint ? mapPointCover({ x: wristPoint.x, y: wristPoint.y }, cover) : null,
            activity,
            lastSeen: now,
            zoneDwell,
            history,
          }
          peopleRef.current.set(id, person)

          // draw skeleton
          const color = ACTIVITY_COLORS[activity] ?? '#94a3b8'
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

  const draftLine = cursorPos ? [...draftPoints, cursorPos] : draftPoints

  return (
    <div className="stage">
      <div className="stage-toolbar">
        {drawMode && draftPoints.length >= MIN_ZONE_POINTS && (
          <button className="btn" onClick={() => finishZone(draftPoints)}>
            Finish zone
          </button>
        )}
        {drawMode && draftPoints.length > 0 && (
          <button className="btn" onClick={() => setDraftPoints([])}>
            Cancel zone
          </button>
        )}
        <button className="btn" onClick={handleCapture}>
          Capture frame
        </button>
        <button className="btn" onClick={() => setRunning((r) => !r)}>
          {running ? 'Stop feed' : 'Start feed'}
        </button>
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
        {status && <div className="stage-status">{status}</div>}
      </div>
    </div>
  )
}
