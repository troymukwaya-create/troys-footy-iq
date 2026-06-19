import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useTeamSearch } from '../hooks/useQueries.js';
import TeamMark from './TeamMark.jsx';

// Global team / country search. Debounced (250ms), hits the full API-Football
// team database, and on select hands the team id back to the app (→ team page).
// The fix for "I couldn't find their country — there was no search bar."
export function SearchBar({ onSelectTeam }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Debounce the query so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data: results = [], isFetching } = useTeamSearch(query);
  const showPanel = open && query.length >= 3;

  // Close on outside click / Escape.
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (team) => {
    onSelectTeam?.(team);
    setOpen(false);
    setInput('');
    setQuery('');
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', padding: '10px 12px 0' }}>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          placeholder="Search any team or country…"
          aria-label="Search teams and countries"
          style={{
            width: '100%', padding: '9px 30px 9px 32px', fontSize: 13,
            background: 'var(--bg-base)', color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
            outline: 'none',
          }}
        />
        {input && (
          <button
            onClick={() => { setInput(''); setQuery(''); }}
            aria-label="Clear search"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showPanel && (
        <div style={{
          position: 'absolute', left: 12, right: 12, top: '100%', marginTop: 4, zIndex: 50,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          maxHeight: 320, overflowY: 'auto',
        }}>
          {isFetching && !results.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          )}
          {!isFetching && !results.length && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              No teams found for “{query}”.
            </div>
          )}
          {results.map(team => (
            <button
              key={team.id}
              onClick={() => pick(team)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-raised)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <TeamMark name={team.name} crest={team.logo} size={20} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                  {team.national ? 'National team' : 'Club'}{team.country ? ` · ${team.country}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
