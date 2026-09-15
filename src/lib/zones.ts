import type { Point, Zone } from './types'

export function pointInZone(p: Point, z: Zone): boolean {
  return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h
}

export const LOITER_THRESHOLD_SEC = 6
