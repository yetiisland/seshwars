import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, BrowserRouter, Routes, Route } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import SpotPage from './pages/SpotPage.jsx'
import SharedListPage from './pages/SharedListPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import SupportPage from './pages/SupportPage.jsx'
import DeepLinkHandler from './components/DeepLinkHandler.jsx'

// Upgrade previously-shared hash links (/#/spots/foo → /spots/foo) on web
if (!Capacitor.isNativePlatform() && window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1) + window.location.search)
}

// Native WebView loads from capacitor://localhost so BrowserRouter path routing
// doesn't work there — keep HashRouter for native, use BrowserRouter on web.
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <DeepLinkHandler />
      <Routes>
        <Route path="/spot/:slug" element={<SpotPage />} />
        <Route path="/spots/:slug" element={<SpotPage />} />
        <Route path="/list/:shareToken" element={<SharedListPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPolicy onClose={() => window.history.back()} />} />
        <Route path="/support" element={<SupportPage onClose={() => window.history.back()} />} />
        <Route path="*" element={<App />} />
      </Routes>
    </Router>
  </StrictMode>,
)
