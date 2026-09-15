export interface Point {
  x: number
  y: number
}

export interface Zone {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
}

export type ActivityLabel =
  | 'standing'
  | 'sitting'
  | 'walking'
  | 'bending'
  | 'reaching'
  | 'loitering'

export interface TrackedPerson {
  id: number
  centroid: Point
  wrist: Point | null
  activity: ActivityLabel
  lastSeen: number
  zoneDwell: Record<string, number>
  history: Point[]
}

export interface ActivityEvent {
  id: string
  timestamp: number
  personId: number
  message: string
  level: 'info' | 'warning'
}

export type Source = { kind: 'camera' } | { kind: 'upload'; file: File }
