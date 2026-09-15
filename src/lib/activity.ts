import type { Pose } from './pose'
import { keypoint } from './pose'
import type { ActivityLabel, Point, TrackedPerson } from './types'

const MIN_SCORE = 0.3
const WALK_SPEED_PX = 6
const HISTORY_LEN = 12

function avg(points: Point[]): Point | null {
  const valid = points.filter(Boolean)
  if (!valid.length) return null
  return {
    x: valid.reduce((s, p) => s + p.x, 0) / valid.length,
    y: valid.reduce((s, p) => s + p.y, 0) / valid.length,
  }
}

/** Heuristic, keypoint-geometry based activity classification (not a trained action-recognition model). */
export function classifyActivity(pose: Pose, prev: TrackedPerson | undefined): ActivityLabel {
  const nose = keypoint(pose, 'nose')
  const lShoulder = keypoint(pose, 'left_shoulder')
  const rShoulder = keypoint(pose, 'right_shoulder')
  const lHip = keypoint(pose, 'left_hip')
  const rHip = keypoint(pose, 'right_hip')
  const lKnee = keypoint(pose, 'left_knee')
  const rKnee = keypoint(pose, 'right_knee')
  const lWrist = keypoint(pose, 'left_wrist')
  const rWrist = keypoint(pose, 'right_wrist')

  const shoulders = [lShoulder, rShoulder].filter((k) => k && k.score! > MIN_SCORE) as Point[]
  const hips = [lHip, rHip].filter((k) => k && k.score! > MIN_SCORE) as Point[]
  const knees = [lKnee, rKnee].filter((k) => k && k.score! > MIN_SCORE) as Point[]

  const shoulderY = avg(shoulders)?.y
  const hipY = avg(hips)?.y
  const kneeY = avg(knees)?.y

  const wrists = [lWrist, rWrist].filter((k) => k && k.score! > MIN_SCORE) as (Point & { score: number })[]
  const highestWristY = wrists.length ? Math.min(...wrists.map((w) => w.y)) : null

  // Reaching: a wrist raised above the shoulder line.
  if (highestWristY != null && shoulderY != null && highestWristY < shoulderY - 15) {
    return 'reaching'
  }

  // Bending/crouching: torso (shoulder->hip) compressed relative to hip->knee, or hips close to knees.
  if (shoulderY != null && hipY != null && kneeY != null) {
    const torso = hipY - shoulderY
    const legs = kneeY - hipY
    if (torso > 0 && legs > 0 && torso < legs * 0.6) {
      return 'bending'
    }
  } else if (nose && hipY != null && nose.score! > MIN_SCORE) {
    // Fallback: nose close to hip height relative to typical standing posture.
    if (hipY - nose.y < 120) return 'bending'
  }

  const centroid = avg(hips.length ? hips : shoulders)
  if (centroid && prev && prev.history.length) {
    const last = prev.history[prev.history.length - 1]
    const dist = Math.hypot(centroid.x - last.x, centroid.y - last.y)
    if (dist > WALK_SPEED_PX) return 'walking'
  }

  return 'standing'
}

export function pushHistory(history: Point[], point: Point): Point[] {
  const next = [...history, point]
  if (next.length > HISTORY_LEN) next.shift()
  return next
}
