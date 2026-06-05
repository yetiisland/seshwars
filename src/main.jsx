import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import SpotPage from './pages/SpotPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/spots/:slug" element={<SpotPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
