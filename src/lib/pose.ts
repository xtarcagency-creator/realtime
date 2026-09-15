import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs-core'
import * as poseDetection from '@tensorflow-models/pose-detection'

export type Pose = poseDetection.Pose

let detectorPromise: Promise<poseDetection.PoseDetector> | null = null

export function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
      })
    })()
  }
  return detectorPromise
}

export function keypoint(pose: Pose, name: string) {
  return pose.keypoints.find((k) => k.name === name)
}
