import type { Point, Zone } from './types'

/** Ray-casting point-in-polygon test. */
export function pointInZone(p: Point, z: Zone): boolean {
  const pts = z.points
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function zoneCentroid(z: Zone): Point {
  const n = z.points.length
  return {
    x: z.points.reduce((s, p) => s + p.x, 0) / n,
    y: z.points.reduce((s, p) => s + p.y, 0) / n,
  }
}

export const LOITER_THRESHOLD_SEC = 6
export const MIN_ZONE_POINTS = 3
export const CLOSE_POINT_RADIUS_PX = 18
