import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs-core'
import * as poseDetection from '@tensorflow-models/pose-detection'
import type { DetectionQuality } from './types'
import { estimateTopDownPoses, resetTopDownTracker } from './topDownPose'

export type Pose = poseDetection.Pose
export type Detector = poseDetection.PoseDetector

type BottomUpQuality = 'fast' | 'balanced'

// Fast/Balanced use MoveNet MultiPose (one pass over the whole frame — cheap,
// good for a live webcam demo). The real speed/accuracy knob it exposes is
// multiPoseMaxDimension, the size input frames are scaled to before
// inference. Must be a multiple of 32.
const QUALITY_DIMENSION: Record<BottomUpQuality, number> = {
  fast: 256,
  balanced: 384,
}

let bottomUpCurrent: { quality: BottomUpQuality; detector: Promise<Detector> } | null = null

function getBottomUpDetector(quality: BottomUpQuality): Promise<Detector> {
  if (!bottomUpCurrent || bottomUpCurrent.quality !== quality) {
    const prevPromise = bottomUpCurrent?.detector ?? null
    const nextPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
        multiPoseMaxDimension: QUALITY_DIMENSION[quality],
        // Default is 0.25 — lower so a second, less-confident person (partially
        // occluded, smaller in frame) still gets included as a detection at all;
        // our own per-keypoint score filtering still hides noisy joints.
        minPoseScore: 0.15,
      })
      if (prevPromise) {
        const prevDetector = await prevPromise
        prevDetector.dispose()
      }
      return detector
    })()
    bottomUpCurrent = { quality, detector: nextPromise }
  }
  return bottomUpCurrent.detector
}

/**
 * Fast/Balanced: single-pass MoveNet MultiPose over the whole frame.
 * High: top-down pipeline (person detector + per-person crop through MoveNet
 * Thunder) — much more accurate when people are small, close together, or
 * overlapping (e.g. low-res CCTV-style footage), at a real FPS cost.
 */
export async function estimatePoses(video: HTMLVideoElement, quality: DetectionQuality): Promise<Pose[]> {
  if (quality === 'high') {
    return estimateTopDownPoses(video)
  }
  const detector = await getBottomUpDetector(quality)
  return detector.estimatePoses(video, { flipHorizontal: false })
}

export function resetTracking() {
  resetTopDownTracker()
}

export function keypoint(pose: Pose, name: string) {
  return pose.keypoints.find((k) => k.name === name)
}
