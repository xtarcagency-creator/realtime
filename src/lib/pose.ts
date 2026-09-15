import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs-core'
import * as poseDetection from '@tensorflow-models/pose-detection'
import type { DetectionQuality } from './types'

export type Pose = poseDetection.Pose
export type Detector = poseDetection.PoseDetector

// MoveNet MultiPose only ships one model (Lightning); the real speed/accuracy
// knob it exposes is multiPoseMaxDimension — the size input frames are scaled
// to before inference. Higher catches smaller/more distant people better, at
// the cost of latency. Must be a multiple of 32.
const QUALITY_DIMENSION: Record<DetectionQuality, number> = {
  fast: 256,
  balanced: 320,
  high: 480,
}

let current: { quality: DetectionQuality; detector: Promise<Detector> } | null = null

export function getDetector(quality: DetectionQuality): Promise<Detector> {
  if (!current || current.quality !== quality) {
    const prevPromise = current?.detector ?? null
    const nextPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
        multiPoseMaxDimension: QUALITY_DIMENSION[quality],
      })
      if (prevPromise) {
        const prevDetector = await prevPromise
        prevDetector.dispose()
      }
      return detector
    })()
    current = { quality, detector: nextPromise }
  }
  return current.detector
}

export function keypoint(pose: Pose, name: string) {
  return pose.keypoints.find((k) => k.name === name)
}
