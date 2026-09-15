import type { Point } from './types'

interface Track {
  id: number
  centroid: Point
  missed: number
}

const MAX_MATCH_DIST_PX = 140
const MAX_MISSED_FRAMES = 10

/** Minimal nearest-centroid tracker: assigns stable ids to per-frame detections that have no built-in identity. */
export class CentroidTracker {
  private tracks: Track[] = []
  private nextId = 1

  update(centroids: Point[]): number[] {
    const assigned = new Array(centroids.length).fill(-1)
    const usedTracks = new Set<number>()
    const existingCount = this.tracks.length

    for (let i = 0; i < centroids.length; i++) {
      let bestTrack = -1
      let bestDist = MAX_MATCH_DIST_PX
      for (let t = 0; t < existingCount; t++) {
        if (usedTracks.has(t)) continue
        const d = Math.hypot(centroids[i].x - this.tracks[t].centroid.x, centroids[i].y - this.tracks[t].centroid.y)
        if (d < bestDist) {
          bestDist = d
          bestTrack = t
        }
      }
      if (bestTrack >= 0) {
        usedTracks.add(bestTrack)
        this.tracks[bestTrack].centroid = centroids[i]
        this.tracks[bestTrack].missed = 0
        assigned[i] = this.tracks[bestTrack].id
      }
    }

    for (let i = 0; i < centroids.length; i++) {
      if (assigned[i] === -1) {
        const id = this.nextId++
        this.tracks.push({ id, centroid: centroids[i], missed: 0 })
        assigned[i] = id
      }
    }

    for (let t = existingCount - 1; t >= 0; t--) {
      if (!usedTracks.has(t)) {
        this.tracks[t].missed++
        if (this.tracks[t].missed > MAX_MISSED_FRAMES) this.tracks.splice(t, 1)
      }
    }

    return assigned
  }

  reset() {
    this.tracks = []
    this.nextId = 1
  }
}
