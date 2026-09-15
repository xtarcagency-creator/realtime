# Realtime Human Activity Analyser

Live, in-browser multi-person pose tracking and zone-based behavior
detection. Runs entirely client-side (WebGL) — no backend, no GPU server,
no video leaves the device.

## Features

- **Multi-person detection & tracking** — every person in frame gets a
  persistent ID across frames. Fast/Balanced use MoveNet MultiPose
  (one pass over the whole frame — cheap). High switches to a top-down
  pipeline: a person detector (COCO-SSD) finds each person's box, then
  MoveNet Thunder runs pose estimation on just that person's own cropped,
  upscaled region. Bottom-up multi-pose models can't cleanly separate
  people who are small, close together, or overlapping (a single
  "person center" heatmap can't split them) — the top-down pipeline
  fixes exactly that, which is what low-res CCTV-style footage needs.
- **Pose estimation** — 17-point skeleton per person, rendered live over the
  video.
- **Activity classification** — per person, per frame: `standing`,
  `sitting`, `walking`, `bending`, `reaching`. Heuristic, derived from joint
  geometry and centroid movement (not a trained action-recognition model).
- **Zones & dwell time** — draw a polygon over the video to mark a zone
  (any shape, not just rectangles). Dwelling past half the loiter threshold
  raises a soft `lingering` state (logged, no flash); crossing the full
  threshold raises `loitering` (logged + a red flash on the video). A
  brief exit from a zone (detection flicker, stepping out and back) doesn't
  reset the timer — only a continuous 1.5s+ outside the zone does. The
  loiter threshold is adjustable in the sidebar (Zones panel).
- **Camera or uploaded video** — analyse a live webcam feed or a video
  file, with play/pause/seek controls for uploaded video.
- **Detection quality control** — Fast / Balanced / High. Multi-person
  accuracy depends heavily on this: CCTV-style footage with
  smaller/closer-together/overlapping people needs High (the top-down
  pipeline), not just a close-up webcam demo.
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
- Stay in a zone past the loiter threshold (6s by default, adjustable in
  the Zones panel) to trigger a `loitering` event — the log entry and a
  red flash on the video. Half that time raises a softer `lingering` event
  first (log only).
- Raise a hand above shoulder height to see `reaching` detected.
- Use **Upload video** to run detection against a video file instead of the
  camera — use the play/pause button and scrub bar under the video to jump
  to a specific moment; scrubbing while paused still redraws the frame.
- If it's only catching one person on a video with several, switch
  **Detection quality** to High — the model resolves multiple/smaller
  people much better at higher input resolution.
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

- `src/lib/pose.ts` — unified `estimatePoses(video, quality)`: routes to
  the bottom-up MoveNet MultiPose detector (fast/balanced) or the
  top-down pipeline (high). Caches/disposes models as quality changes.
- `src/lib/topDownPose.ts` — the top-down pipeline: COCO-SSD person
  detection → square padded crop per person → MoveNet Thunder per crop →
  map keypoints back to full-frame coordinates → `CentroidTracker` for
  persistent IDs (this path has no built-in tracker, unlike MultiPose).
- `src/lib/tracker.ts` — minimal nearest-centroid tracker used by the
  top-down pipeline.
- `src/lib/activity.ts` — heuristic activity classifier + shared centroid
  helper.
- `src/lib/coverMap.ts` — maps arbitrary camera/video resolutions onto the
  fixed 16:9 canvas (object-fit: cover style crop).
- `src/lib/zones.ts` — polygon point-in-zone test, zone centroid, dwell/
  lingering/exit-grace constants.
- `src/components/CameraStage.tsx` — capture, detection loop, drawing,
  polygon zone-drawing UI, frame capture, lingering/loitering + exit
  grace logic, loitering flash.
- `src/components/Dashboard.tsx` — live stats sidebar, detection quality
  control, loiter threshold control, zone list.

## Limitations

- Requires a browser with webcam + WebGL support.
- Fast/Balanced (MoveNet MultiPose) can detect up to 6 people, but
  accuracy on smaller/farther/closely-grouped people (typical of
  CCTV-style footage) is meaningfully worse than on a close, well-lit
  webcam subject. High's top-down pipeline handles that case far better
  but costs real FPS (a person detector pass + one pose pass *per
  person*, per frame) — still a lightweight, in-browser model, not the
  accuracy of a heavy server-side detector, so very low-res or very
  crowded footage still has a real ceiling.
- Switching Detection quality mid-session gives everyone new tracking
  IDs (fast/balanced and high use independent tracking, so identity
  doesn't carry across the switch).
- The activity classifier is a lightweight rule-based heuristic for
  real-time performance, not a trained action-recognition model — it reads
  joint geometry (raised wrist, torso compression, movement over time), not
  learned behavior patterns.
- No re-identification: if a tracked person leaves and re-enters frame,
  they get a new ID.
- Single camera only — no multi-camera handoff.
