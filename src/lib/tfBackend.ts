import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-webgpu'
import * as poseDetection from '@tensorflow-models/pose-detection'

// WebGPU is meaningfully faster than WebGL for these models on hardware/
// browsers that support it (Chrome 113+, most machines from the last few
// years) — tried first, with an automatic fallback to WebGL. Two distinct
// failure points: the backend itself can fail to initialize (unsupported
// browser/driver), or initialization can succeed but a specific model can
// still hit an op WebGPU hasn't implemented, which only surfaces once a
// detector actually runs a real inference, not at tf.ready() time.
let backendPromise: Promise<'webgpu' | 'webgl'> | null = null

function ensureBackend(): Promise<'webgpu' | 'webgl'> {
  if (!backendPromise) {
    backendPromise = (async () => {
      // tf.setBackend() resolves to false on failure rather than rejecting
      // (e.g. no GPU adapter available), so a try/catch alone doesn't detect
      // it — check the resolved value and re-confirm with getBackend().
      const webgpuOk = await tf.setBackend('webgpu').catch(() => false)
      if (webgpuOk && tf.getBackend() === 'webgpu') {
        await tf.ready()
        console.info('[pose] using WebGPU backend')
        return 'webgpu' as const
      }
      await tf.setBackend('webgl')
      await tf.ready()
      console.info('[pose] using WebGL backend')
      return 'webgl' as const
    })()
  }
  return backendPromise
}

export async function createMoveNetDetector(
  config: poseDetection.MoveNetModelConfig,
): Promise<poseDetection.PoseDetector> {
  const backend = await ensureBackend()
  try {
    return await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, config)
  } catch (err) {
    if (backend === 'webgpu') {
      console.warn('[pose] WebGPU detector creation failed, falling back to WebGL', err)
      await tf.setBackend('webgl')
      await tf.ready()
      return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, config)
    }
    throw err
  }
}
