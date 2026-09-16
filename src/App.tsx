import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Analyser from './pages/Analyser'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<Analyser />} />
    </Routes>
  )
}

export default App
