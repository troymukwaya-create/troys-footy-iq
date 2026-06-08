import React, { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Loads Google Identity Services once and resolves with the global `google`.
function loadGis() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const existing = document.getElementById('gis-script');
    if (existing) { existing.addEventListener('load', () => resolve(window.google)); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true; s.id = 'gis-script';
    s.onload = () => resolve(window.google);
    document.head.appendChild(s);
  });
}

export function GoogleSignIn() {
  const ref = useRef(null);
  const googleAuth = useAuth(s => s.googleAuth);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGis().then(google => {
      if (cancelled || !google?.accounts?.id || !ref.current) return;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => { if (resp?.credential) googleAuth(resp.credential); },
      });
      google.accounts.id.renderButton(ref.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300,
      });
    });
    return () => { cancelled = true; };
  }, [googleAuth]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />;
}
