// In-scope competitions: domestic European leagues + the Champions League.
// Every code below is inside football-data.org's FREE tier ("free forever").
// Europa League and Conference League are deliberately absent — they require
// the paid €49/mo Standard plan. See docs/superpowers/specs/
// 2026-09-02-free-tier-revival-design.md §2.
export const FD_LEAGUES = {
  PL:  { name: 'Premier League',   country: 'England'     },
  PD:  { name: 'La Liga',          country: 'Spain'       },
  BL1: { name: 'Bundesliga',       country: 'Germany'     },
  SA:  { name: 'Serie A',          country: 'Italy'       },
  FL1: { name: 'Ligue 1',          country: 'France'      },
  CL:  { name: 'Champions League', country: 'UEFA'        },
  DED: { name: 'Eredivisie',       country: 'Netherlands' },
  PPL: { name: 'Primeira Liga',    country: 'Portugal'    },
  ELC: { name: 'Championship',     country: 'England'     },
};

// API-Football is no longer used. It existed only to gap-fill Eredivisie and
// Primeira Liga, which football-data.org's free tier now covers directly.
// Kept as an empty object so existing importers keep working.
export const APF_LEAGUES = {};
