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
  Terminal,
} from '@phosphor-icons/react'
import Reveal from '../components/Reveal'
import './Landing.css'

const REPO_URL = 'https://github.com/xtarcagency-creator/realtime'

const FEATURES = [
  {
    icon: Users,
    title: 'Multi-person detection and tracking',
    body: 'Every person gets a persistent ID. Fast and Balanced run MoveNet MultiPose in a single pass; High switches to a YOLOv8n plus MoveNet Thunder pipeline built for crowded or low-resolution footage.',
  },
  {
    icon: MapPinArea,
    title: 'Zones, dwell time, loitering',
    body: 'Draw a polygon over any shelf or aisle. Crossing the loiter threshold logs an alert. A brief step out of the zone does not reset the timer.',
  },
  {
    icon: ShieldCheck,
    title: 'Runs entirely client-side',
    body: 'Pose models run on WebGL, detection on WebAssembly. Video never leaves the browser tab. No backend, no upload.',
  },
]

const PIPELINE = [
  {
    n: '01',
    icon: Crosshair,
    title: 'Detect',
    body: 'YOLOv8n and MoveNet MultiPose each propose person boxes. Either one catching someone is enough.',
  },
  {
    n: '02',
    icon: Path,
    title: 'Track',
    body: 'A centroid tracker keeps a stable ID per person across frames, including through the per-person high-quality pipeline.',
  },
  {
    n: '03',
    icon: Bell,
    title: 'Alert',
    body: 'Zone dwell time crosses a lingering threshold, then a loitering threshold, logged as a CSV-exportable event.',
  },
]

const STACK = ['React 19', 'TypeScript', 'Vite', 'TensorFlow.js', 'ONNX Runtime Web', 'WebAssembly']

export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-nav-wrap">
        <header className="landing-nav">
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
        </header>
      </div>

      <main>
        <section className="hero">
          <Reveal className="hero-badge">
            <Terminal size={13} weight="bold" />
            Client-side computer vision
          </Reveal>
          <Reveal delay={60}>
            <h1>
              Multi-person tracking that never leaves your <span className="accent-word">browser</span>.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="hero-sub">
              Pose tracking, zone dwell alerts, and loitering detection running on WebGL and
              WebAssembly. No server, no upload required.
            </p>
          </Reveal>
          <Reveal delay={180} className="hero-actions">
            <Link className="btn-cta" to="/app">
              Open app
              <ArrowRight size={14} weight="bold" />
            </Link>
            <a className="btn-ghost" href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubLogo size={15} weight="bold" />
              View source
            </a>
          </Reveal>
        </section>

        <Reveal delay={100} className="preview">
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

        <section className="stack">
          <p className="mono-label">Built with</p>
          <div className="stack-row">
            {STACK.map((name) => (
              <span key={name} className="stack-badge">
                {name}
              </span>
            ))}
          </div>
        </section>

        <section className="features">
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80} className="feature-item">
                <f.icon size={22} weight="bold" className="feature-icon" />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pipeline">
          <Reveal>
            <p className="mono-label">How it works</p>
          </Reveal>
          <div className="pipeline-row">
            {PIPELINE.map((step, i) => (
              <Reveal key={step.title} delay={i * 100} className="pipeline-step">
                <div className="pipeline-head">
                  <span className="pipeline-n">{step.n}</span>
                  <step.icon size={18} weight="bold" />
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="cta-banner">
          <Reveal>
            <h2>
              See it track a <span className="accent-word">room</span>.
            </h2>
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
