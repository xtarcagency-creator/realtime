import type { ActivityLabel } from './types'

// Shared between the canvas skeleton overlay and the dashboard UI, so a
// person's color means the same thing everywhere in the app.
export const ACTIVITY_COLORS: Record<ActivityLabel, string> = {
  standing: '#64748b',
  sitting: '#0d9488',
  walking: '#2563eb',
  bending: '#b45309',
  reaching: '#7c3aed',
  lingering: '#d97706',
  loitering: '#dc2626',
}
