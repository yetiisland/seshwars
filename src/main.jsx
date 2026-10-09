import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, BrowserRouter, Routes, Route } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import SharedListPage from './pages/SharedListPage.jsx'
import SharedTrickListPage from './pages/SharedTrickListPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import SupportPage from './pages/SupportPage.jsx'
import DeleteAccountPage from './pages/DeleteAccountPage.jsx'
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
        {/* /spot/:slug and /spots/:slug are intentionally NOT their own
            Route — they fall through to the "*" route below, the same
            <App/> every other path renders, so opening a spot never
            unmounts App (and its kept-alive ListView/MapView) — App itself
            detects the match (useMatch) and renders the spot as an overlay
            on top. See App.jsx's spotMatch/SpotOverlay usage. */}
        <Route path="/list/:shareToken" element={<SharedListPage />} />
        <Route path="/trick-list/:shareToken" element={<SharedTrickListPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPolicy onClose={() => window.history.back()} />} />
        <Route path="/support" element={<SupportPage onClose={() => window.history.back()} />} />
        <Route path="/delete-account" element={<DeleteAccountPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </Router>
    <Analytics />
  </StrictMode>,
)
