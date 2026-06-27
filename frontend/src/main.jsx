import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { initAnalytics } from './lib/analytics.js'
import { Analytics } from '@vercel/analytics/react'

// First-party visitor tracking (feeds the CEO command center at /admin).
// Never blocks render; fails silent if the backend is unreachable.
// Vercel Analytics (<Analytics /> below) runs alongside it: edge-measured
// traffic counts that work even when the Render backend is cold — the CEO
// dashboard stays the product-engagement source of truth.
try { initAnalytics() } catch { /* ignore */ }

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1, // Minimize retries for demo
      staleTime: Infinity, // Aggressive demo caching
      gcTime: Infinity,
    },
  },
})

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
    this.setState({ error: error.message, info: info.componentStack })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: '#0B0B0D', color: '#e7eafb', height: '100vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: "'IBM Plex Sans', system-ui", padding: 32, gap: 20,
        }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.5px' }}>
            <span style={{ color: '#C0392B' }}>Odd</span><span style={{ color: '#9CA3AF' }}>yessa</span>
          </div>
          <div style={{ color: '#ef4444', fontSize: 15, fontWeight: 600 }}>
            Something crashed
          </div>
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12, padding: '14px 24px', maxWidth: 600,
            fontSize: 13, color: '#f87171', fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.7, wordBreak: 'break-word',
          }}>
            {this.state.error}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', maxWidth: 500, textAlign: 'center' }}>
            Open browser console (F12) for the full error.
            Check that the backend is running and accessible.
          </div>
          <button
            onClick={() => { this.setState({ error: null, info: null }); window.location.reload(); }}
            style={{
              padding: '12px 28px', background: '#C0392B',
              border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700,
              cursor: 'pointer', fontSize: 14, transition: 'transform 0.2s',
            }}
            onMouseOver={e => e.target.style.transform = 'scale(1.04)'}
            onMouseOut={e => e.target.style.transform = 'scale(1)'}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
    <Analytics />
  </ErrorBoundary>
)
