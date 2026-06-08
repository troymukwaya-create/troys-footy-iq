import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function AuthVerify() {
  const { verify } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    const t = params.get('token');
    if (!t) { setStatus('error'); return; }
    verify(t).then(ok => { if (ok) nav('/', { replace: true }); else setStatus('error'); });
  }, []); // eslint-disable-line

  return (
    <div style={{ minHeight: '100dvh', background: '#070708', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif' }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}><span style={{ color: '#A8344A' }}>Odd</span>yessa</div>
        {status === 'verifying' ? (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>Signing you in…</div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>That link didn’t work</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 18 }}>It may have expired or already been used. Try signing in again.</div>
            <a href="/" style={{ color: '#A8344A', fontWeight: 600, textDecoration: 'none' }}>Back to Oddyessa →</a>
          </>
        )}
      </div>
    </div>
  );
}
