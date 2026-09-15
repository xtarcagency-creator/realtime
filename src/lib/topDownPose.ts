import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs-core'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as poseDetection from '@tensorflow-models/pose-detection'
import { CentroidTracker } from './tracker'
import type { Pose } from './pose'

// Bottom-up multi-pose models (MoveNet MultiPose) estimate every joint for
// every person in one pass over the whole frame, which is fast but breaks
// down exactly when people are small, close together, or overlapping — a
// single "person center" heatmap can't cleanly separate them. This top-down
// pipeline instead detects each person as their own bounding box first, then
// runs a much more accurate single-person model (MoveNet Thunder) on that
// person's own cropped, upscaled region — the standard fix for that failure
// mode, at the cost of one detector pass + one pose pass per person per frame.

const PERSON_SCORE_MIN = 0.4
const CROP_SIZE = 256 // MoveNet SinglePose Thunder's native input size
const PAD_RATIO = 0.25 // padding around each detected box so joints near the edge aren't cut off

let objectDetectorPromise: Promise<cocoSsd.ObjectDetection> | null = null
let singlePoseDetectorPromise: Promise<poseDetection.PoseDetector> | null = null
let cropCanvas: HTMLCanvasElement | null = null
const tracker = new CentroidTracker()

function getObjectDetector() {
  if (!objectDetectorPromise) {
    objectDetectorPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      return cocoSsd.load({ base: 'lite_mobilenet_v2' })
    })()
  }
  return objectDetectorPromise
}

function getSinglePoseDetector() {
  if (!singlePoseDetectorPromise) {
    singlePoseDetectorPromise = poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
    })
  }
  return singlePoseDetectorPromise
}

export function resetTopDownTracker() {
  tracker.reset()
}

export async function estimateTopDownPoses(video: HTMLVideoElement): Promise<Pose[]> {
  const [objectDetector, poseDetector] = await Promise.all([getObjectDetector(), getSinglePoseDetector()])
  // detect()'s own minScore defaults to 0.5, which would silently drop
  // anything below that before our PERSON_SCORE_MIN filter ever saw it —
  // pass a lower floor explicitly so borderline person detections survive.
  const predictions = await objectDetector.detect(video, 20, PERSON_SCORE_MIN)
  const people = predictions.filter((p) => p.class === 'person')

  if (!cropCanvas) cropCanvas = document.createElement('canvas')
  cropCanvas.width = CROP_SIZE
  cropCanvas.height = CROP_SIZE
  const cropCtx = cropCanvas.getContext('2d')!

  const rawPoses: { keypoints: poseDetection.Keypoint[]; centroid: { x: number; y: number } }[] = []

  for (const person of people) {
    const [bx, by, bw, bh] = person.bbox
    // Pad to a *square* crop (MoveNet's own expected input shape) instead of
    // stretching the box to fit — non-uniform scaling distorts body
    // proportions and measurably hurts keypoint accuracy.
    const cx = bx + bw / 2
    const cy = by + bh / 2
    const side = Math.max(bw, bh) * (1 + PAD_RATIO * 2)
    const x0 = Math.max(0, cx - side / 2)
    const y0 = Math.max(0, cy - side / 2)
    const x1 = Math.min(video.videoWidth, cx + side / 2)
    const y1 = Math.min(video.videoHeight, cy + side / 2)
    const cropW = x1 - x0
    const cropH = y1 - y0
    if (cropW < 10 || cropH < 10) continue

    cropCtx.clearRect(0, 0, CROP_SIZE, CROP_SIZE)
    cropCtx.drawImage(video, x0, y0, cropW, cropH, 0, 0, CROP_SIZE, CROP_SIZE)

    // eslint-disable-next-line no-await-in-loop
    const [pose] = await poseDetector.estimatePoses(cropCanvas, { flipHorizontal: false })
    if (!pose) continue

    const keypoints = pose.keypoints.map((k) => ({
      ...k,
      x: x0 + (k.x / CROP_SIZE) * cropW,
      y: y0 + (k.y / CROP_SIZE) * cropH,
    }))
    const hip = keypoints.find((k) => (k.name === 'left_hip' || k.name === 'right_hip') && (k.score ?? 0) > 0.3)
    const centroid = hip ? { x: hip.x, y: hip.y } : { x: x0 + cropW / 2, y: y0 + cropH / 2 }
    rawPoses.push({ keypoints, centroid })
  }

  const ids = tracker.update(rawPoses.map((p) => p.centroid))
  return rawPoses.map((p, i) => ({ id: ids[i], keypoints: p.keypoints }))
}
