// ─── NATIONAL FLAG COLORS (backend copy) ────────────────────────────
// Synced copy of frontend/src/constants/nationColors.js (NATION_COLORS
// only — no club colours needed server-side). Used by the daily picks
// email to paint match tiles with the same flag-bleed the app uses.
// If you change a colour, change it in BOTH files.

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
export function getNationColor(name) {
  return NATION_COLORS[name] || '#64748B';
}

// Probability-bar colours need a luminance floor: USA navy or Bosnia blue
// on a dark tile makes the segment invisible, and an invisible favourite
// reads as the OTHER side being favoured. Lift dark colours toward white
// until the bar is legible; leave bright flags untouched.
export function getBarColor(name) {
  const hex = getNationColor(name);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  // Visibility on a near-black tile tracks the strongest channel: saturated
  // red (255,0,0) pops, deep navy (60,59,110) vanishes. Luminance gets this
  // wrong — it would wash red while leaving navy alone.
  const maxc = Math.max(r, g, b);
  if (maxc >= 150) return hex;
  const lift = 0.15 + ((150 - maxc) / 150) * 0.35;
  const mix = (c) => Math.round(c + (255 - c) * lift);
  return '#' + [r, g, b].map(c => mix(c).toString(16).padStart(2, '0')).join('');
}

// Same formula as the app's flagGradient, tightened to the edges so the
// centre stays readable in a 600px email column. Returns ONLY the
// gradient image — set background-color separately so clients that strip
// background-image still show the dark tile.
export function emailFlagBleed(homeName, awayName) {
  const h = getNationColor(homeName), a = getNationColor(awayName);
  return `linear-gradient(100deg, ${h}45 0%, ${h}14 22%, transparent 40%, transparent 60%, ${a}14 78%, ${a}45 100%)`;
}

export default { NATION_COLORS, getNationColor, emailFlagBleed };
