export const FD_LEAGUES = {         // football-data.org codes
  PL:  { name: 'Premier League',      country: 'England' },
  PD:  { name: 'La Liga',             country: 'Spain'   },
  BL1: { name: 'Bundesliga',          country: 'Germany' },
  SA:  { name: 'Serie A',             country: 'Italy'   },
  FL1: { name: 'Ligue 1',             country: 'France'  },
  BSA: { name: 'Brasileirao Serie A', country: 'Brazil'  },
  CL:  { name: 'Champions League',    country: 'UEFA'    },
  EL:  { name: 'Europa League',       country: 'UEFA'    },  // ← ADDED
};

export const APF_LEAGUES = {        // API-Football IDs (gap-fill only)
  72:  { name: 'Brasileirao Serie B', country: 'Brazil'      },
  73:  { name: 'Copa do Brasil',      country: 'Brazil'      },
  88:  { name: 'Eredivisie',          country: 'Netherlands' },
  94:  { name: 'Primeira Liga',       country: 'Portugal'    },
  3:   { name: 'UEFA Europa League',  country: 'UEFA'        },
  848: { name: 'Conference League',   country: 'UEFA'        },
};
