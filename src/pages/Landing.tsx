import { Link } from 'react-router-dom'
import {
  ArrowRight,
  GithubLogo,
  Users,
  MapPinArea,
  ShieldCheck,
  Crosshair,
  Path,
  Bell,
} from '@phosphor-icons/react'
import Reveal from '../components/Reveal'
import './Landing.css'

const REPO_URL = 'https://github.com/xtarcagency-creator/realtime'

const FEATURES = [
  {
    icon: Users,
    tint: 'accent',
    size: 'large' as const,
    title: 'Multi-person detection and tracking',
    body: 'Every person gets a persistent ID. Fast and Balanced run MoveNet MultiPose in a single pass; High switches to a YOLOv8n plus MoveNet Thunder pipeline built for crowded or low-resolution footage.',
  },
  {
    icon: MapPinArea,
    tint: 'warn',
    size: 'small' as const,
    title: 'Zones, dwell time, loitering',
    body: 'Draw a polygon over any shelf or aisle. Crossing the loiter threshold logs an alert. A brief step out of the zone does not reset the timer.',
  },
  {
    icon: ShieldCheck,
    tint: 'good',
    size: 'small' as const,
    title: 'Runs entirely client-side',
    body: 'Pose models run on WebGL, detection on WebAssembly. Video never leaves the browser tab. No backend, no upload.',
  },
]

const PIPELINE = [
  {
    icon: Crosshair,
    title: 'Detect',
    body: 'YOLOv8n and MoveNet MultiPose each propose person boxes. Either one catching someone is enough.',
  },
  {
    icon: Path,
    title: 'Track',
    body: 'A centroid tracker keeps a stable ID per person across frames, including through the per-person high-quality pipeline.',
  },
  {
    icon: Bell,
    title: 'Alert',
    body: 'Zone dwell time crosses a lingering threshold, then a loitering threshold, logged as a CSV-exportable event.',
  },
]

const STACK = ['React 19', 'TypeScript', 'Vite', 'TensorFlow.js', 'ONNX Runtime Web', 'WebAssembly']

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">
            <span className="logo-mark">RA</span>
            <span className="logo-word">Realtime Activity Analyser</span>
          </span>
          <div className="landing-nav-actions">
            <a className="nav-link" href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubLogo size={16} weight="bold" />
              <span className="nav-link-word">Source</span>
            </a>
            <Link className="btn-cta" to="/app">
              Open app
              <ArrowRight size={14} weight="bold" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Multi-person tracking, right in your browser.</h1>
            <p className="hero-sub">
              Pose tracking, zone dwell alerts, and loitering detection running on WebGL and
              WebAssembly. No server, no upload required.
            </p>
            <div className="hero-actions">
              <Link className="btn-cta" to="/app">
                Open app
                <ArrowRight size={14} weight="bold" />
              </Link>
              <a className="btn-ghost" href={REPO_URL} target="_blank" rel="noreferrer">
                <GithubLogo size={15} weight="bold" />
                View source
              </a>
            </div>
          </div>
          <Reveal className="hero-visual" delay={80}>
            <div className="hero-frame">
              <div className="hero-frame-bar">
                <span />
                <span />
                <span />
              </div>
              <img
                src="/landing/dashboard-preview.png"
                alt="Realtime Activity Analyser dashboard showing live status, zones, and the event log"
                loading="eager"
              />
            </div>
          </Reveal>
        </section>

        <section className="features">
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80} className={`feature-tile tile-${f.size} tint-${f.tint}`}>
                <f.icon size={22} weight="bold" />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pipeline">
          <Reveal>
            <h2>How it works</h2>
          </Reveal>
          <div className="pipeline-row">
            {PIPELINE.map((step, i) => (
              <Reveal key={step.title} delay={i * 100} className="pipeline-step">
                <div className="pipeline-icon">
                  <step.icon size={20} weight="bold" />
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="stack">
          <Reveal>
            <p className="stack-label">Built with</p>
            <div className="stack-row">
              {STACK.map((name) => (
                <span key={name} className="stack-badge">
                  {name}
                </span>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="cta-banner">
          <Reveal>
            <h2>See it track a room.</h2>
            <p>Grant camera access or drop in a video file. Detection starts immediately.</p>
            <Link className="btn-cta btn-cta-lg" to="/app">
              Open app
              <ArrowRight size={16} weight="bold" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <span>Realtime Activity Analyser</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          <GithubLogo size={15} weight="bold" />
          GitHub
        </a>
      </footer>
    </div>
  )
}
