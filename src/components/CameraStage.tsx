import { useEffect, useRef, useState } from 'react'
import { getDetector } from '../lib/pose'
import { classifyActivity, getCentroid, pushHistory } from '../lib/activity'
import { pointInZone, LOITER_THRESHOLD_SEC } from '../lib/zones'
import { computeCoverTransform, mapPointCover } from '../lib/coverMap'
import type { ActivityEvent, Point, Source, TrackedPerson, Zone } from '../lib/types'

const CANVAS_W = 1280
const CANVAS_H = 720

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
}

export default function CameraStage({ source, zones, onZonesChange, onPeopleUpdate, onEvent, onFps, drawMode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peopleRef = useRef<Map<number, TrackedPerson>>(new Map())
  const zonesRef = useRef(zones)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const [dragRect, setDragRect] = useState<Zone | null>(null)
  const [status, setStatus] = useState('Starting…')
  const [running, setRunning] = useState(true)

  useEffect(() => {
    zonesRef.current = zones
  }, [zones])

  // Restart the feed (camera re-request or upload re-play) whenever the source changes.
  useEffect(() => {
    setRunning(true)
  }, [source])

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

      setStatus('Loading pose model…')
      const detector = await getDetector()
      setStatus('')

      const loop = async () => {
        if (stopped) return
        if (video.paused || video.ended) {
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
          ctx.lineWidth = 3
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
              ctx.arc(pk.x, pk.y, 3, 0, Math.PI * 2)
              ctx.fillStyle = color
              ctx.fill()
            }
          }
          ctx.fillStyle = color
          ctx.font = '14px system-ui, sans-serif'
          ctx.fillText(`#${id} ${activity}`, canvasCentroid.x + 8, canvasCentroid.y - 8)
        }

        for (const id of Array.from(peopleRef.current.keys())) {
          if (!seenIds.has(id)) peopleRef.current.delete(id)
        }

        // draw zones
        for (const zone of zonesRef.current) {
          const occupied = Array.from(peopleRef.current.values()).some((p) => (p.zoneDwell[zone.id] ?? 0) > 0)
          ctx.strokeStyle = occupied ? '#dc2626' : '#2563eb'
          ctx.fillStyle = occupied ? 'rgba(220,38,38,0.1)' : 'rgba(37,99,235,0.08)'
          ctx.lineWidth = 2
          ctx.strokeRect(zone.x, zone.y, zone.w, zone.h)
          ctx.fillRect(zone.x, zone.y, zone.w, zone.h)
          ctx.fillStyle = occupied ? '#dc2626' : '#2563eb'
          ctx.font = '13px system-ui, sans-serif'
          ctx.fillText(zone.label, zone.x + 6, zone.y + 16)
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

  function handleMouseDown(e: React.MouseEvent) {
    if (!drawMode) return
    dragRef.current = toCanvasCoords(e)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!drawMode || !dragRef.current) return
    const p = toCanvasCoords(e)
    const start = dragRef.current
    setDragRect({
      id: 'draft',
      label: 'New zone',
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    })
  }

  function handleMouseUp() {
    if (!drawMode || !dragRef.current || !dragRect) {
      dragRef.current = null
      return
    }
    if (dragRect.w > 20 && dragRect.h > 20) {
      const n = zones.length + 1
      onZonesChange([...zones, { ...dragRect, id: `zone-${Date.now()}`, label: `Zone ${n}` }])
    }
    dragRef.current = null
    setDragRect(null)
  }

  return (
    <div className="stage">
      <div className="stage-toolbar">
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={drawMode ? 'draw-cursor' : ''}
        />
        {dragRect && canvasRef.current && (
          <div
            className="drag-preview"
            style={{
              left: `${(dragRect.x / canvasRef.current.width) * 100}%`,
              top: `${(dragRect.y / canvasRef.current.height) * 100}%`,
              width: `${(dragRect.w / canvasRef.current.width) * 100}%`,
              height: `${(dragRect.h / canvasRef.current.height) * 100}%`,
            }}
          />
        )}
        {status && <div className="stage-status">{status}</div>}
      </div>
    </div>
  )
}
