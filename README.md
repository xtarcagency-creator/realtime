# Realtime Human Activity Analyser

Live, in-browser multi-person pose tracking and zone-based behavior
detection. Runs entirely client-side (WebGL) — no backend, no GPU server,
no video leaves the device.

## Features

- **Multi-person detection & tracking** — MoveNet MultiPose (TensorFlow.js)
  detects every person in frame and assigns each a persistent ID across
  frames.
- **Pose estimation** — 17-point skeleton per person, rendered live over the
  video.
- **Activity classification** — per person, per frame: `standing`,
  `sitting`, `walking`, `bending`, `reaching`. Heuristic, derived from joint
  geometry and centroid movement (not a trained action-recognition model).
- **Zones & dwell time** — draw a polygon over the video to mark a zone
  (any shape, not just rectangles). The app tracks how long each tracked
  person dwells inside it; dwelling past a threshold raises a `loitering`
  state, logs a timestamped event, and flashes the video border.
- **Camera or uploaded video** — analyse a live webcam feed or a video file.
- **Detection quality control** — Fast / Balanced / High, trading pose
  model input resolution for FPS (useful on slower hardware or for
  catching smaller/farther people).
- **Frame capture** — save the current canvas (video + overlay) as a PNG.
- **Overlay toggle** — Full (skeleton + labels) or Minimal (just a marker +
  labels), for a cleaner view when someone's watching over your shoulder.
- **Live dashboard** — person count, FPS, per-person activity, zone list,
  and a scrolling event log with CSV export.
- **Stop/start control** — release the camera or pause the video without
  reloading the page.
- Zones persist across reloads (localStorage).

## Running locally

```bash
npm install
npm run dev
```

Open the printed local URL in a browser with camera access (Chrome/Edge
recommended for WebGL performance).

- Click **Draw zone**, then click to place each corner of a zone (3+
  points); click the first point again, or hit **Finish zone**, to close
  it. Rename or delete zones inline in the sidebar.
- Stay in a zone for 6+ seconds to trigger a `loitering` event — the log
  entry and a red flash on the video.
- Raise a hand above shoulder height to see `reaching` detected.
- Use **Upload video** to run detection against a video file instead of the
  camera.
- Use **Capture frame** to download the current view (video + skeleton +
  zones) as a PNG.

## Building & deploying

```bash
npm run build
```

Outputs a static site to `dist/`. `netlify.toml` is included (build command
`npm run build`, publish dir `dist`, plus a `Permissions-Policy` header for
camera access), so on Netlify: **New site from Git** → connect this
repo/branch — build settings are picked up automatically.

To embed it elsewhere (e.g. an iframe):

```html
<iframe
  src="https://<your-deployed-domain>/"
  allow="camera"
  style="width:100%; aspect-ratio:16/9; border:0; border-radius:12px;"
></iframe>
```

`allow="camera"` is required for the embedded page to request webcam access
from within an iframe, and the embedding page must be served over HTTPS
(camera access requires a secure context).

## Architecture

- `src/lib/pose.ts` — loads the MoveNet MultiPose detector (tracking
  enabled), keyed by `DetectionQuality` (adjusts `multiPoseMaxDimension`);
  disposes the old model when quality changes.
- `src/lib/activity.ts` — heuristic activity classifier + shared centroid
  helper.
- `src/lib/coverMap.ts` — maps arbitrary camera/video resolutions onto the
  fixed 16:9 canvas (object-fit: cover style crop).
- `src/lib/zones.ts` — polygon point-in-zone test, zone centroid, dwell
  constants.
- `src/components/CameraStage.tsx` — capture, detection loop, drawing,
  polygon zone-drawing UI, frame capture, loitering flash.
- `src/components/Dashboard.tsx` — live stats sidebar, detection quality
  control, zone list.

## Limitations

- Requires a browser with webcam + WebGL support.
- The activity classifier is a lightweight rule-based heuristic for
  real-time performance, not a trained action-recognition model — it reads
  joint geometry (raised wrist, torso compression, movement over time), not
  learned behavior patterns.
- No re-identification: if a tracked person leaves and re-enters frame,
  they get a new ID.
- Single camera only — no multi-camera handoff.
