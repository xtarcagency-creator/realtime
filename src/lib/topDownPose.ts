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
// person's own cropped, upscaled region.
//
// Person boxes come from two independent detectors, unioned and deduped:
// COCO-SSD (a generic object detector) and MoveNet MultiPose's own
// per-instance box output (decoded from a person-center heatmap, a
// different mechanism with different failure modes than SSD's box-level
// NMS). SSD's NMS is known to collapse two heavily-overlapping "person"
// boxes into one — exactly the case of two people standing close together
// — so relying on a single detector can silently drop a person before any
// pose model even runs. Using both as an ensemble means either one catching
// a person is enough.

const PERSON_SCORE_MIN = 0.35
const MULTIPOSE_PROPOSAL_SCORE_MIN = 0.15
const MULTIPOSE_PROPOSAL_DIMENSION = 512 // top of MoveNet's documented recommended range
const DEDUPE_IOU_THRESHOLD = 0.4
const CROP_SIZE = 256 // MoveNet SinglePose Thunder's native input size
const PAD_RATIO = 0.25 // padding around each detected box so joints near the edge aren't cut off

interface BoxProposal {
  x0: number
  y0: number
  x1: number
  y1: number
}

let objectDetectorPromise: Promise<cocoSsd.ObjectDetection> | null = null
let singlePoseDetectorPromise: Promise<poseDetection.PoseDetector> | null = null
let proposalDetectorPromise: Promise<poseDetection.PoseDetector> | null = null
let cropCanvas: HTMLCanvasElement | null = null
const tracker = new CentroidTracker()

function getObjectDetector() {
  if (!objectDetectorPromise) {
    objectDetectorPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      // 'mobilenet_v2' (vs. the default 'lite_mobilenet_v2') trades speed for
      // recall — worth it given this whole pipeline already trades FPS for
      // accuracy.
      return cocoSsd.load({ base: 'mobilenet_v2' })
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

function getProposalDetector() {
  if (!proposalDetectorPromise) {
    proposalDetectorPromise = poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
      enableTracking: false,
      multiPoseMaxDimension: MULTIPOSE_PROPOSAL_DIMENSION,
      minPoseScore: 0.1,
    })
  }
  return proposalDetectorPromise
}

export function resetTopDownTracker() {
  tracker.reset()
}

function iou(a: BoxProposal, b: BoxProposal): number {
  const ix0 = Math.max(a.x0, b.x0)
  const iy0 = Math.max(a.y0, b.y0)
  const ix1 = Math.min(a.x1, b.x1)
  const iy1 = Math.min(a.y1, b.y1)
  const interArea = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0)
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0)
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0)
  const union = areaA + areaB - interArea
  return union > 0 ? interArea / union : 0
}

/** Keeps every box that doesn't heavily overlap one already kept, so the two detectors' proposals merge without double-counting the same person. */
function dedupeBoxes(boxes: BoxProposal[]): BoxProposal[] {
  const kept: BoxProposal[] = []
  for (const box of boxes) {
    if (!kept.some((k) => iou(k, box) > DEDUPE_IOU_THRESHOLD)) kept.push(box)
  }
  return kept
}

export async function estimateTopDownPoses(video: HTMLVideoElement): Promise<Pose[]> {
  const [objectDetector, poseDetector, proposalDetector] = await Promise.all([
    getObjectDetector(),
    getSinglePoseDetector(),
    getProposalDetector(),
  ])

  const vw = video.videoWidth
  const vh = video.videoHeight

  const [predictions, proposalPoses] = await Promise.all([
    // detect()'s own minScore defaults to 0.5, which would silently drop
    // candidates before our own PERSON_SCORE_MIN filter ever saw them.
    objectDetector.detect(video, 20, PERSON_SCORE_MIN),
    proposalDetector.estimatePoses(video, { flipHorizontal: false }),
  ])

  const ssdBoxes: BoxProposal[] = predictions
    .filter((p) => p.class === 'person')
    .map((p) => {
      const [x, y, w, h] = p.bbox
      return { x0: x, y0: y, x1: x + w, y1: y + h }
    })

  // MultiPose's box output is normalized [0,1] (unlike its keypoints, which
  // the library already scales to pixel space) — scale it ourselves.
  const poseBoxes: BoxProposal[] = proposalPoses
    .filter((p) => (p.score ?? 0) >= MULTIPOSE_PROPOSAL_SCORE_MIN && p.box)
    .map((p) => ({
      x0: p.box!.xMin * vw,
      y0: p.box!.yMin * vh,
      x1: p.box!.xMax * vw,
      y1: p.box!.yMax * vh,
    }))

  const people = dedupeBoxes([...ssdBoxes, ...poseBoxes])

  if (!cropCanvas) cropCanvas = document.createElement('canvas')
  cropCanvas.width = CROP_SIZE
  cropCanvas.height = CROP_SIZE
  const cropCtx = cropCanvas.getContext('2d')!

  const rawPoses: { keypoints: poseDetection.Keypoint[]; centroid: { x: number; y: number } }[] = []

  for (const box of people) {
    const bw = box.x1 - box.x0
    const bh = box.y1 - box.y0
    // Pad to a *square* crop (MoveNet's own expected input shape) instead of
    // stretching the box to fit — non-uniform scaling distorts body
    // proportions and measurably hurts keypoint accuracy.
    const cx = box.x0 + bw / 2
    const cy = box.y0 + bh / 2
    let side = Math.max(bw, bh) * (1 + PAD_RATIO * 2)
    // Cap the crop so it doesn't reach past a neighboring person's center —
    // for two people standing close together, an uncapped padded crop
    // around one can include the other's body, confusing the single-person
    // pose model (which assumes one dominant person in frame) even though
    // both got correctly detected as separate boxes.
    for (const other of people) {
      if (other === box) continue
      const ocx = other.x0 + (other.x1 - other.x0) / 2
      const ocy = other.y0 + (other.y1 - other.y0) / 2
      const dist = Math.hypot(cx - ocx, cy - ocy)
      side = Math.min(side, dist * 1.3)
    }
    const x0 = Math.max(0, cx - side / 2)
    const y0 = Math.max(0, cy - side / 2)
    const x1 = Math.min(vw, cx + side / 2)
    const y1 = Math.min(vh, cy + side / 2)
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
