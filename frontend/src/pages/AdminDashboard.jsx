// ─── CEO COMMAND CENTER — shell, auth, nested routes ────────────────
import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import adminApi, { getToken, clearToken, adminLogin } from '../api/adminClient.js';
import { AdminCtx, useAdmin, Card, C } from '../components/admin/ui.jsx';
import Overview from './admin/Overview.jsx';
import Visitors from './admin/Visitors.jsx';
import VisitorDetail from './admin/VisitorDetail.jsx';
import TrafficDetail from './admin/TrafficDetail.jsx';
import Predictions from './admin/Predictions.jsx';
import Spend from './admin/Spend.jsx';
import ApiUsage from './admin/ApiUsage.jsx';

const NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/visitors', label: 'Visitors' },
  { to: '/admin/traffic', label: 'Traffic' },
  { to: '/admin/predictions', label: 'Predictions' },
  { to: '/admin/spend', label: 'Spend' },
  { to: '/admin/api', label: 'API' },
];

// ─── LOGIN ──────────────────────────────────────────────────────────
function Login({ onAuthed }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { (await adminLogin(pw)) ? onAuthed() : setErr('Incorrect password'); }
    catch (e2) { setErr(e2?.response?.data?.message || 'Login failed'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: '100vh', background: C.base, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4 }}>
          <span style={{ color: C.accent }}>Odd</span><span style={{ color: C.t2 }}>yssa</span>
        </div>
        <div style={{ fontSize: 12, color: C.t3, marginBottom: 24, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Command Center</div>
        <Card>
          <label style={{ fontSize: 11, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CEO Access</label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus placeholder="Password"
            style={{ width: '100%', marginTop: 8, padding: '11px 12px', background: C.base, border: `1px solid ${C.borderD}`, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: C.mono, outline: 'none' }} />
          {err && <div style={{ color: C.bad, fontSize: 12, marginTop: 8 }}>{err}</div>}
          <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 14, padding: '11px', background: C.accent, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Verifying…' : 'Enter'}
          </button>
        </Card>
      </form>
    </div>
  );
}

// ─── DEMO BANNER ────────────────────────────────────────────────────
function DemoBanner({ demo, setDemo }) {
  const qc = useQueryClient();
  const o = useAdmin('/overview', 60000).data || {};
  const [busy, setBusy] = useState(false);
  const demoCount = o.demoEvents || 0;
  if (!demo && demoCount === 0) return null;   // nothing to warn about

  const clear = async () => {
    if (!window.confirm('Delete all demo/sample data? Real visitor data is kept.')) return;
    setBusy(true);
    try { await adminApi.post('/reset-analytics'); setDemo(false); qc.invalidateQueries({ queryKey: ['adm'] }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: demo ? 'var(--warning-muted)' : 'rgba(255,255,255,0.03)', border: `1px solid ${demo ? 'rgba(234,179,8,0.3)' : C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: demo ? C.warn : C.t2, flex: 1, minWidth: 200 }}>
        {demo
          ? `⚠ Demo data is ON — these numbers include ${demoCount} sample events, not real visitors.`
          : `${demoCount} sample events exist in the database. Real metrics shown.`}
      </span>
      <button onClick={() => setDemo(!demo)} style={pill(demo ? C.warn : C.t3)}>{demo ? 'Turn off demo' : 'Show demo data'}</button>
      {demoCount > 0 && <button onClick={clear} disabled={busy} style={pill(C.bad)}>{busy ? 'Clearing…' : 'Clear demo data'}</button>}
    </div>
  );
}
const pill = (color) => ({ fontSize: 11, fontWeight: 600, color, background: 'none', border: `1px solid ${color}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' });

// ─── SHELL ──────────────────────────────────────────────────────────
function Shell({ onLogout }) {
  const [demo, setDemoState] = useState(() => { try { return localStorage.getItem('fiq_admin_demo') === '1'; } catch { return false; } });
  const setDemo = (v) => { try { localStorage.setItem('fiq_admin_demo', v ? '1' : '0'); } catch { /* ignore */ } setDemoState(v); };
  const o = useAdmin('/overview', 30000).data || {};
  const dbDown = o.dbConnected === false;

  return (
    <AdminCtx.Provider value={{ demo, setDemo }}>
      <div style={{ minHeight: '100vh', background: C.base, color: C.text, fontFamily: 'var(--font-body)' }}>
        {/* header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '10px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.5px' }}>
              <span style={{ color: C.accent }}>Odd</span><span style={{ color: C.t2 }}>yssa</span>
            </span>
            <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {NAV.map(n => (
                <NavLink key={n.to} to={n.to} end={n.end} style={({ isActive }) => ({
                  fontSize: 12, padding: '5px 11px', borderRadius: 7, textDecoration: 'none',
                  color: isActive ? '#fff' : C.t2, background: isActive ? C.accent : 'transparent', fontWeight: isActive ? 600 : 500,
                })}>{n.label}</NavLink>
              ))}
            </nav>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              {o.worldCupLive && <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-muted)' }}>WORLD CUP LIVE</span>}
              <span style={{ fontSize: 11, color: dbDown ? C.bad : C.ok, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: dbDown ? C.bad : C.ok }} /> {dbDown ? 'DB OFFLINE' : 'Live'}
              </span>
              <button onClick={onLogout} style={{ fontSize: 11, color: C.t3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Sign out</button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
          {dbDown && (
            <Card style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'var(--danger-muted)', marginBottom: 20 }}>
              <div style={{ color: C.bad, fontWeight: 600, fontSize: 13 }}>Database not connected</div>
              <div style={{ color: C.t2, fontSize: 12, marginTop: 4 }}>Connect PostgreSQL (DATABASE_URL) to populate the dashboard.</div>
            </Card>
          )}
          <DemoBanner demo={demo} setDemo={setDemo} />
          <Routes>
            <Route index element={<Overview />} />
            <Route path="visitors" element={<Visitors />} />
            <Route path="visitors/:id" element={<VisitorDetail />} />
            <Route path="traffic" element={<TrafficDetail />} />
            <Route path="predictions" element={<Predictions />} />
            <Route path="spend" element={<Spend />} />
            <Route path="api" element={<ApiUsage />} />
          </Routes>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [authed, setAuthed] = useState(!!getToken());
  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener('fiq-admin-logout', onLogout);
    return () => window.removeEventListener('fiq-admin-logout', onLogout);
  }, []);
  const logout = () => { clearToken(); setAuthed(false); };
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Shell onLogout={logout} />;
}
