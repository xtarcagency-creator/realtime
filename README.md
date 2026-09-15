# Realtime Human Activity Analyser

A live, in-browser demo of multi-person pose tracking and zone-based behavior
detection, built as a credibility/technology preview for **xtarc.agency**'s
retail loss-prevention (shoplifting detection) proposal.

Everything runs client-side in the browser via WebGL — no backend, no GPU
server, no video leaves the device. That makes it cheap to host and safe to
embed as a live demo on the agency site.

## What it shows

- **Multi-person detection & tracking** — MoveNet MultiPose (TensorFlow.js)
  detects every person in frame and assigns each a persistent ID across
  frames (`enableTracking` + bounding-box tracker).
- **Pose estimation** — 17-point skeleton per person, rendered live over the
  camera feed.
- **Heuristic activity classification** — per person, per frame: `standing`,
  `walking`, `bending`, `reaching` (arm raised above shoulder), derived from
  joint geometry and centroid velocity. This is a lightweight rule-based
  classifier, not a trained action-recognition network — good enough for a
  live demo, and the natural place to swap in a trained model later.
- **Zones & dwell time** — draw a rectangle over the video (e.g. a "shelf" or
  "aisle") and the app tracks how long each tracked person dwells inside it.
  Dwelling past a threshold raises a `loitering` state and logs a
  timestamped event — the same primitive a shoplifting system needs
  (zone intrusion + dwell time + behavior), just demoed on generic footage.
- **Live dashboard** — person count, FPS, per-person activity, zone list,
  and a scrolling event log.

## Why this shape (vs. an exercise-rep counter)

A fitness rep-counter is a neat toy but it's single-person, front-facing,
and curated. This demo instead exercises the actual primitives a retail
system needs — multi-person tracking, pose, zone dwell-time, and behavior
flags — on arbitrary, messy footage, which is a much closer proof of
capability for the shoplifting-detection pitch.

## Running locally

```bash
npm install
npm run dev
```

Open the printed local URL in a browser that has camera access (Chrome/Edge
recommended for WebGL performance). Grant camera permission when prompted.

- Click **Draw zone** in the sidebar, then drag on the video to mark a
  zone (e.g. a shelf). Rename it inline.
- Stand in the zone for 6+ seconds to trigger a `loitering` event in the log.
- Raise a hand above shoulder height to see `reaching` detected.

## Building & embedding

```bash
npm run build
```

Outputs a static site to `dist/`. Deploy it to any static host (Vercel,
Netlify, GitHub Pages, Cloudflare Pages) and embed it on xtarc.agency as an
iframe, e.g.:

```html
<iframe
  src="https://<your-deployed-domain>/"
  allow="camera"
  style="width:100%; aspect-ratio:16/10; border:0; border-radius:12px;"
></iframe>
```

The `allow="camera"` attribute is required for the embedded page to request
webcam access from within an iframe, and the embedding page must be served
over HTTPS (camera access requires a secure context).

## Notes / limitations

- Requires a browser with webcam + WebGL support; this demo has been
  typechecked, linted, and build-verified in this environment, but the
  actual webcam pipeline needs to be exercised in a real browser (this
  sandbox has no camera) before presenting it live — please do a quick
  run-through beforehand.
- The activity classifier is intentionally simple/heuristic for real-time
  performance; a production shoplifting system would layer a trained
  action/behavior model and multi-camera re-identification on top of the
  same tracking + zone primitives shown here.

## Roadmap toward the shoplifting-detection product

1. Swap the heuristic classifier for a trained action-recognition model
   (e.g. a lightweight temporal model over pose sequences).
2. Add concealment-relevant cues: hand-to-shelf, hand-to-bag/pocket,
   item-in-hand disappearance.
3. Multi-camera re-identification so a tracked person persists across
   camera handoffs within a store.
4. Store-side deployment: edge inference (on-prem GPU/NPU) instead of
   browser WebGL, with an alerting/review dashboard for staff.
5. Privacy/compliance layer: on-device processing, configurable retention,
   and audit logging per store's jurisdiction.
