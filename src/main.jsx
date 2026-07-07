import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import SpotPage from './pages/SpotPage.jsx'
import SharedListPage from './pages/SharedListPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import SupportPage from './pages/SupportPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/spots/:slug" element={<SpotPage />} />
        <Route path="/list/:shareToken" element={<SharedListPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPolicy onClose={() => window.history.back()} />} />
        <Route path="/support" element={<SupportPage onClose={() => window.history.back()} />} />
        <Route path="*" element={<App />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
