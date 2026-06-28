// ─── NATIONAL FLAG COLORS ───────────────────────────────────────────
// Primary flag colour per nation — used to paint each side of a fixture
// tile with the two countries' colours, fading into each other.

import { TEAM_COLORS } from './teamColors.js';

export const NATION_COLORS = {
  Mexico: '#006847', 'South Africa': '#FFB81C', Brazil: '#FFDF00', Argentina: '#75AADB',
  France: '#0055A4', Spain: '#AA151B', England: '#CE1124', Germany: '#DD0000',
  Portugal: '#006600', Netherlands: '#FF6C00', Belgium: '#FDDA24', Croatia: '#FF0000',
  Italy: '#0066CC', Uruguay: '#5CBFEB', Colombia: '#FCD116', Morocco: '#C1272D',
  Switzerland: '#FF0000', Denmark: '#C8102E', Japan: '#BC002D', USA: '#3C3B6E',
  'United States': '#3C3B6E', Senegal: '#00853F', Nigeria: '#008751', Egypt: '#CE1126',
  Ghana: '#FCD116', 'South Korea': '#0047A0', 'Korea Republic': '#0047A0', Iran: '#239F40',
  Australia: '#FFCD00', Canada: '#FF0000', Ecuador: '#FFDD00', Qatar: '#8A1538',
  'Saudi Arabia': '#006C35', Poland: '#DC143C', Serbia: '#C6363C', Austria: '#ED2939',
  Norway: '#BA0C2F', Sweden: '#FECC00', Scotland: '#0065BF', 'Czech Republic': '#11457E',
  Czechia: '#11457E', Algeria: '#006233', Tunisia: '#E70013', Cameroon: '#007A5E',
  'Ivory Coast': '#FF8200', Paraguay: '#D52B1E', Peru: '#D91023', Chile: '#0039A6',
  Uzbekistan: '#1EB53A', Jordan: '#007A3D', Panama: '#005293', 'Costa Rica': '#002B7F',
  Honduras: '#0073CF', Jamaica: '#009B3A', 'New Zealand': '#00247D', 'Cape Verde': '#003893',
  'DR Congo': '#007FFF', 'Bosnia & Herzegovina': '#002395', Haiti: '#00209F',
  Curacao: '#002B7F', Iraq: '#CE1126', Wales: '#C8102E', Turkey: '#E30A17', Greece: '#0D5EAF',
  // Provider spellings (API-Football)
  'Türkiye': '#E30A17', 'Cape Verde Islands': '#003893', 'Congo DR': '#007FFF',
};

// Unknown teams get a NEUTRAL slate — never a random palette colour.
// (Hash-picked colours rendered probability bars purple/pink for any
// unmapped team, which read as a glitch, not a design choice.)
function hashColor() {
  return '#64748B';
}

// A colour for any team — nation flag first, then club primary, then a stable hash.
export function getMatchColor(name) {
  if (!name) return '#888888';
  if (NATION_COLORS[name]) return NATION_COLORS[name];
  if (TEAM_COLORS[name]?.primary) return TEAM_COLORS[name].primary;
  return hashColor(name);
}

// Layered gradient: home colour fades in from the left, away colour from the
// right, meeting in the middle — over an optional base background. Vivid edges,
// clear centre so team names + score stay readable.
export function flagGradient(homeName, awayName, base = null, alpha = '40') {
  const h = getMatchColor(homeName), a = getMatchColor(awayName);
  const flags = `linear-gradient(100deg, ${h}${alpha} 0%, ${h}1A 30%, transparent 48%, transparent 52%, ${a}1A 70%, ${a}${alpha} 100%)`;
  return base ? `${flags}, ${base}` : flags;
}

// ─── TEAM PALETTE + BADGE CONTRAST ──────────────────────────────────
// A club crest dropped on its own team-colour seam can vanish (Liverpool's red
// crest on the red half). So: frame every crest on a CONTRASTING plate, and if
// the two teams' seam colours are too close (two reds, two navies), push one
// side to its alternate so the halves stay distinguishable.

function _rgb(hex) {
  let s = String(hex || '').replace('#', '');
  if (s.length === 3) s = s.replace(/./g, (c) => c + c);
  const n = parseInt(s.slice(0, 6), 16);
  return Number.isNaN(n) ? [100, 116, 139] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _isLight(hex) { const [r, g, b] = _rgb(hex); return (r * 299 + g * 587 + b * 114) > 140000; }

// redmean perceptual-ish distance between two hex colours (0 = identical)
export function colorDist(a, b) {
  const [r1, g1, b1] = _rgb(a), [r2, g2, b2] = _rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

// Full palette for any team — nation (flag colour + neutral alt) or club
// (its real primary/secondary/text), with a sane fallback for the unknown.
export function getTeamColors(name) {
  if (NATION_COLORS[name]) { const p = NATION_COLORS[name]; return { primary: p, secondary: '#F7F4EE', text: _isLight(p) ? '#0B0B0D' : '#fff' }; }
  const t = TEAM_COLORS[name];
  if (t?.primary) return { primary: t.primary, secondary: t.secondary || '#F7F4EE', text: t.text || (_isLight(t.primary) ? '#0B0B0D' : '#fff') };
  return { primary: '#64748B', secondary: '#F7F4EE', text: '#fff' };
}

// A plate colour that contrasts with a seam, so a crest never blends in:
// dark seam → warm cream (Bone), light seam → near-black chrome.
export function crestPlate(seam) { return _isLight(seam) ? '#0B0B0D' : '#F7F4EE'; }

// Seam colours for a fixture's two club halves, de-clashed when too similar.
const SEAM_CLASH = 78;
export function matchSeam(homeName, awayName) {
  const H = getTeamColors(homeName), A = getTeamColors(awayName);
  let home = H.primary, away = A.primary;
  if (colorDist(home, away) < SEAM_CLASH) {
    const gainAway = colorDist(home, A.secondary) - colorDist(home, away);
    const gainHome = colorDist(away, H.secondary) - colorDist(home, away);
    if (gainAway >= gainHome && gainAway > 0) away = A.secondary;
    else if (gainHome > 0) home = H.secondary;
  }
  return { home: { seam: home, plate: crestPlate(home) }, away: { seam: away, plate: crestPlate(away) } };
}
