import { useEffect, useState } from 'react';
import axios from '../api/client.js';

export function DataSourceBadge() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    axios.get('/api/status')
      .then(r => setStatus(r.data))
      .catch(() => setStatus({ footballdata: false, usingDemo: true }));
  }, []);

  if (!status) return null;

  if (status.footballdata) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-secondary font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
        Live Data
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 text-[10px] text-primary font-black tracking-widest uppercase">
      <span className="material-symbols-outlined text-xs" style={{fontVariationSettings: "'FILL' 1"}}>verified</span>
      Elite Showcase
    </div>
  );
}
