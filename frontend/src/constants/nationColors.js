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
};

const FALLBACK = ['#A8344A', '#3B82F6', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DB2777'];
function hashColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
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
