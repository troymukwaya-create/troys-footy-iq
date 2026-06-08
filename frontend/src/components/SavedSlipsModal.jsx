import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useStore } from '../store/useStore.js';

export function SavedSlipsModal() {
  const { slipsOpen, closeSlips, authedFetch, user } = useAuth();
  const { addParlaySelection, clearParlay } = useStore();
  const [slips, setSlips] = useState(null);

  useEffect(() => {
    if (!slipsOpen || !user) return;
    setSlips(null);
    authedFetch('/slips')
      .then(r => (r.ok ? r.json() : { slips: [] }))
      .then(d => setSlips(d.slips || []))
      .catch(() => setSlips([]));
  }, [slipsOpen, user]); // eslint-disable-line

  if (!slipsOpen) return null;

  const load = (legs) => {
    clearParlay();
    (legs || []).forEach(l => addParlaySelection(l));
    closeSlips();
  };
  const del = async (id) => {
    try { await authedFetch(`/slips/${id}`, { method: 'DELETE' }); } catch { /* ignore */ }
    setSlips(s => (s || []).filter(x => x.id !== id));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={closeSlips}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,8,10,0.8)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 440, maxHeight: '80vh', overflowY: 'auto', background: 'linear-gradient(160deg,#14161B,#0B0B0D)', border: '1px solid var(--border-subtle)', borderRadius: 22, padding: '22px 22px 18px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>Your saved slips</h2>
            <button onClick={closeSlips} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          {slips === null && <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>}
          {slips && slips.length === 0 && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>No saved slips yet. Build one, then tap “Save”.</div>
          )}
          {slips && slips.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label || 'My slip'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {(s.legs || []).length} legs{s.combinedOdds ? ` · ${Number(s.combinedOdds).toFixed(2)}×` : ''}{s.evPct != null ? ` · ${s.evPct > 0 ? '+' : ''}${Math.round(s.evPct)}% edge` : ''}
                </div>
              </div>
              <button onClick={() => load(s.legs)} style={{ padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700 }}>Load</button>
              <button onClick={() => del(s.id)} aria-label="Delete" style={{ padding: 7, borderRadius: 10, border: '1px solid var(--border-subtle)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
