// ─── BOOKMAKER REGISTRY ──────────────────────────────────────────────
// Curated set of books our readers actually use, each with ITS OWN names
// for the markets we model — so a copied slip reads like the bookmaker's
// own betslip, not like our internal jargon. Rebuilding a 3-leg slip at
// your book should take ~30 seconds with this sheet open.
//
// HONESTY RAIL: `url` is each operator's public site, nothing more. No
// bookmaker accepts a pre-filled slip from outside without a commercial
// partnership (deep-link / booking-code APIs are partner programs), so we
// don't pretend otherwise. When a partnership exists, the SAME "Open"
// button becomes the tracked deep link — nothing else changes.

// Market keys used inside Oddyessa: '1X2', 'OU25', 'BTTS'.
const STD = { '1X2': 'Match Result (1X2)', OU25: 'Over/Under 2.5 Goals', BTTS: 'Both Teams to Score' };

export const BOOKMAKERS = [
  {
    id: 'bet365', name: 'bet365', region: 'Global', url: 'https://www.bet365.com',
    markets: { '1X2': 'Full Time Result', OU25: 'Goals Over/Under 2.5', BTTS: 'Both Teams to Score' },
  },
  {
    id: 'betway', name: 'Betway', region: 'Global · Africa', url: 'https://www.betway.com',
    markets: { '1X2': 'Match Result (1X2)', OU25: 'Total Goals Over/Under 2.5', BTTS: 'Both Teams to Score' },
  },
  {
    id: 'betpawa', name: 'betPawa', region: 'Africa', url: 'https://www.betpawa.com', bookingCodes: true,
    markets: { '1X2': '1X2', OU25: 'Over/Under 2.5', BTTS: 'Both Teams To Score (GG/NG)' },
  },
  {
    id: 'sportybet', name: 'SportyBet', region: 'Africa', url: 'https://www.sportybet.com', bookingCodes: true,
    markets: { '1X2': '1X2', OU25: 'Over/Under 2.5', BTTS: 'GG/NG' },
  },
  {
    id: 'betika', name: 'Betika', region: 'Africa', url: 'https://www.betika.com', bookingCodes: true,
    markets: { '1X2': '1X2', OU25: 'Total Goals Over/Under 2.5', BTTS: 'GG/NG' },
  },
  {
    id: '1xbet', name: '1xBet', region: 'Global', url: 'https://1xbet.com',
    markets: { '1X2': '1X2', OU25: 'Total Over/Under 2.5', BTTS: 'Both Teams To Score' },
  },
  {
    id: 'williamhill', name: 'William Hill', region: 'UK · Spain', url: 'https://www.williamhill.com',
    markets: { '1X2': 'Match Betting', OU25: 'Total Match Goals Over/Under 2.5', BTTS: 'Both Teams To Score' },
  },
  {
    id: 'bwin', name: 'bwin', region: 'Spain · Europe', url: 'https://www.bwin.com',
    markets: { '1X2': '1X2 (Resultado del partido)', OU25: 'Total de goles +/- 2.5', BTTS: 'Ambos equipos marcan' },
  },
  {
    id: 'unibet', name: 'Unibet', region: 'Europe', url: 'https://www.unibet.com',
    markets: { '1X2': 'Full Time Result', OU25: 'Total Goals Over/Under 2.5', BTTS: 'Both Teams to Score' },
  },
  {
    id: 'fanduel', name: 'FanDuel', region: 'USA', url: 'https://sportsbook.fanduel.com',
    markets: { '1X2': 'Moneyline (3-Way)', OU25: 'Total Goals Over/Under 2.5', BTTS: 'Both Teams to Score' },
  },
  {
    id: 'draftkings', name: 'DraftKings', region: 'USA', url: 'https://sportsbook.draftkings.com',
    markets: { '1X2': 'Moneyline (3-Way)', OU25: 'Total Goals Over/Under 2.5', BTTS: 'Both Teams to Score' },
  },
  {
    id: 'caliente', name: 'Caliente', region: 'Mexico', url: 'https://www.caliente.mx',
    markets: { '1X2': 'Resultado Final (1X2)', OU25: 'Total de Goles +/- 2.5', BTTS: 'Ambos Equipos Anotan' },
  },
  {
    id: 'other', name: 'My book isn’t listed', region: '', url: null,
    markets: STD,
  },
];

const PREF_KEY = 'oddyessa_bookie';
export function getPreferredBookmaker() {
  try {
    const id = localStorage.getItem(PREF_KEY);
    return BOOKMAKERS.find(b => b.id === id) || null;
  } catch { return null; }
}
export function setPreferredBookmaker(id) {
  try { localStorage.setItem(PREF_KEY, id); } catch { /* private mode */ }
}

export function marketLabelFor(book, marketType) {
  const key = String(marketType || '1X2').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const map = book?.markets || STD;
  return map[key] || map[marketType] || STD[key] || String(marketType || 'Match Result');
}

// The slip, rewritten in the bookmaker's own language.
export function formatForBookmaker(legs, totals, book) {
  const name = book?.name && book.id !== 'other' ? book.name.toUpperCase() : 'YOUR BOOKMAKER';
  const lines = legs.map((l, i) =>
    `${i + 1}. ${l.matchLabel}\n   ${marketLabelFor(book, l.marketType)} → ${l.outcome} @ ${Number(l.odds).toFixed(2)}`
  );
  const combined = totals?.combinedOdds ? `Combined odds: ${totals.combinedOdds.toFixed(2)}×` : null;
  return [
    `SLIP — REBUILD AT ${name}`,
    '',
    ...lines,
    '',
    combined,
    'Prices move — your book may show slightly different odds.',
    'via oddyessa.com · 18+ · bet what you can afford',
  ].filter(Boolean).join('\n');
}
