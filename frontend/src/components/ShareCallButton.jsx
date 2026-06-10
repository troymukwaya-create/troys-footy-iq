import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';

// "Share this call" — distribution is the bottleneck, and a shared link is
// the channel. Builds a plain-text summary of the model's call + the deep
// link (?match=<id>), then native-shares on mobile or copies to clipboard.
export function ShareCallButton({ fixture, prob }) {
  const [copied, setCopied] = useState(false);
  if (!fixture?.id) return null;

  const home = fixture?.homeTeam?.name || 'Home';
  const away = fixture?.awayTeam?.name || 'Away';
  const url = `${window.location.origin}/?match=${encodeURIComponent(fixture.id)}`;

  const buildText = () => {
    const p = prob?.probabilities;
    if (p?.home != null) {
      const entries = [
        { label: `${home} win`, value: p.home, edge: prob?.valueEdges?.home },
        { label: 'Draw', value: p.draw, edge: prob?.valueEdges?.draw },
        { label: `${away} win`, value: p.away, edge: prob?.valueEdges?.away },
      ].sort((a, b) => b.value - a.value);
      const top = entries[0];
      const edgeBit = Number.isFinite(top.edge) && top.edge > 1
        ? ` (+${Math.round(top.edge)}% vs the bookies)`
        : '';
      return `Oddyessa read: ${home} v ${away} — ${top.label} at ${Math.round(top.value)}%${edgeBit}. We publish our error rate. ${url}`;
    }
    return `Oddyessa read: ${home} v ${away} — probabilities, scorelines, and where the bookies are off. ${url}`;
  };

  const share = async () => {
    const text = buildText();
    try {
      if (navigator.share) {
        await navigator.share({ title: `Oddyessa — ${home} v ${away}`, text, url });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* user dismissed the share sheet — not an error */ }
  };

  return (
    <button
      onClick={share}
      aria-label="Share this call"
      title="Share this call"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '0 12px', height: 34, borderRadius: 10, cursor: 'pointer',
        border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
        color: copied ? 'var(--success)' : 'var(--text-secondary)', fontSize: 11.5, fontWeight: 600,
      }}
    >
      {copied ? <Check size={14} /> : <Share2 size={14} />}
      {copied ? 'Copied' : 'Share'}
    </button>
  );
}
