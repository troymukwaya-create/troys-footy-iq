import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
const router  = express.Router();
import axios   from 'axios';

function getToken() { return process.env.FOOTBALLDATA_TOKEN || '' }
function getAPSKey() { return process.env.APISPORTS_KEY || '' }

function hasFDToken() {
  const t = getToken()
  return t.length > 10 && !t.startsWith('YOUR') && !t.startsWith('PASTE')
}
function hasAPSKey() {
  const k = getAPSKey()
  return k.length > 10 && !k.startsWith('YOUR') && !k.startsWith('PASTE') && !k.startsWith('API_KEY')
}

const LEAGUES = [
  { code:'PL',  name:'Premier League',     country:'England',     flag:'🏴', fdId:2021,  apsId:39  },
  { code:'PD',  name:'La Liga',            country:'Spain',       flag:'🇪🇸',       fdId:2014,  apsId:140 },
  { code:'BL1', name:'Bundesliga',         country:'Germany',     flag:'🇩🇪',       fdId:2002,  apsId:78  },
  { code:'SA',  name:'Serie A',            country:'Italy',       flag:'🇮🇹',       fdId:2019,  apsId:135 },
  { code:'FL1', name:'Ligue 1',            country:'France',      flag:'🇫🇷',       fdId:2015,  apsId:61  },
  { code:'BSA', name:'Brasileirao',        country:'Brazil',      flag:'🇧🇷',       fdId:2013,  apsId:71  },
  { code:'CL',  name:'Champions League',   country:'UEFA',        flag:'⭐',         fdId:2001,  apsId:2   },
  { code:'EL',  name:'Europa League',      country:'UEFA',        flag:'🟠',         fdId:null,  apsId:3   },
  { code:'ERE', name:'Eredivisie',         country:'Netherlands', flag:'🇳🇱',       fdId:2003,  apsId:88  },
  { code:'PPL', name:'Primeira Liga',      country:'Portugal',    flag:'🇵🇹',       fdId:2017,  apsId:94  },
  { code:'BSB', name:'Brasileirao B',      country:'Brazil',      flag:'🇧🇷',       fdId:null,  apsId:72  },
  { code:'CDB', name:'Copa do Brasil',     country:'Brazil',      flag:'🇧🇷',       fdId:null,  apsId:73  },
]

// Demo standings fallback
const DEMO_STANDINGS_TABLE = [
  { rank:1, team:{id:1, name:'Liverpool',   logo:null}, all:{played:28, win:20, draw:5, lose:3, goals:{for:65, against:28}}, points:65, form:'WWWDW' },
  { rank:2, team:{id:2, name:'Arsenal',     logo:null}, all:{played:28, win:18, draw:6, lose:4, goals:{for:58, against:30}}, points:60, form:'WWDWW' },
  { rank:3, team:{id:3, name:'Manchester City',logo:null}, all:{played:28, win:16, draw:5, lose:7, goals:{for:55, against:38}}, points:53, form:'WLWWW' },
  { rank:4, team:{id:4, name:'Chelsea',     logo:null}, all:{played:28, win:15, draw:4, lose:9, goals:{for:52, against:40}}, points:49, form:'DWWLW' },
  { rank:5, team:{id:5, name:'Tottenham',   logo:null}, all:{played:28, win:14, draw:4, lose:10, goals:{for:50, against:44}}, points:46, form:'WDLWL' },
  { rank:6, team:{id:6, name:'Aston Villa', logo:null}, all:{played:28, win:13, draw:5, lose:10, goals:{for:48, against:42}}, points:44, form:'WDWDL' },
  { rank:7, team:{id:7, name:'Newcastle',   logo:null}, all:{played:28, win:13, draw:4, lose:11, goals:{for:46, against:43}}, points:43, form:'LWWWD' },
  { rank:8, team:{id:8, name:'Brighton',    logo:null}, all:{played:28, win:12, draw:6, lose:10, goals:{for:44, against:41}}, points:42, form:'DWLWW' },
  { rank:9, team:{id:9, name:'West Ham',    logo:null}, all:{played:28, win:11, draw:5, lose:12, goals:{for:40, against:44}}, points:38, form:'LLWDW' },
  { rank:10,team:{id:10,name:'Fulham',      logo:null}, all:{played:28, win:10, draw:7, lose:11, goals:{for:38, against:42}}, points:37, form:'DWWLL' },
]

// GET /api/leagues
router.get('/', (req, res) => {
  try {
    res.json(LEAGUES)
  } catch (err) {
    res.json([])
  }
})

// GET /api/leagues/:code/standings
router.get('/:code/standings', async (req, res) => {
  const { code } = req.params

  try {
    // Try API-Sports first
    if (hasAPSKey()) {
      const league = LEAGUES.find(l => l.code === code)
      if (league?.apsId) {
        const r = await axios.get('https://v3.football.api-sports.io/standings', {
          headers: { 'x-apisports-key': getAPSKey() },
          params: { league: league.apsId, season: 2024 },
          timeout: 10000,
        })
        const data = r.data?.response?.[0]
        if (data) {
          console.log('[standings]', code, 'from API-Sports')
          return res.json(data)
        }
      }
    }

    // Fallback to demo
    console.log('[standings]', code, 'using demo data')
    res.json({ league: { standings: [DEMO_STANDINGS_TABLE] } })

  } catch (err) {
    console.error('[standings] Error for', code, ':', err.message)
    res.json({ league: { standings: [DEMO_STANDINGS_TABLE] } })
  }
})

// GET /api/leagues/:code/fixtures
router.get('/:code/fixtures', async (req, res) => {
  const { code } = req.params

  try {
    if (hasAPSKey()) {
      const league = LEAGUES.find(l => l.code === code)
      if (league?.apsId) {
        const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
        const to   = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
        const r = await axios.get('https://v3.football.api-sports.io/fixtures', {
          headers: { 'x-apisports-key': getAPSKey() },
          params: { league: league.apsId, season: 2024, from, to },
          timeout: 10000,
        })
        const fixtures = (r.data?.response || []).map(f => ({
          id: f.fixture.id,
          homeTeam: { id: f.teams.home.id, name: f.teams.home.name, crest: f.teams.home.logo },
          awayTeam: { id: f.teams.away.id, name: f.teams.away.name, crest: f.teams.away.logo },
          score: { home: f.goals.home ?? null, away: f.goals.away ?? null },
          halfTime: { home: f.score?.halftime?.home ?? null, away: f.score?.halftime?.away ?? null },
          minute: f.fixture.status.elapsed ?? null,
          status: { NS:'SCHEDULED',TBD:'SCHEDULED','1H':'IN_PLAY','2H':'IN_PLAY',HT:'PAUSED',FT:'FINISHED',AET:'FINISHED',PEN:'FINISHED',PST:'POSTPONED',CANC:'CANCELLED' }[f.fixture.status.short] || 'SCHEDULED',
          date: f.fixture.date,
          league: { name: f.league.name, code, country: f.league.country },
          venue: f.fixture.venue?.name || '',
          source: 'apisports',
        }))
        console.log('[fixtures]', code, 'got', fixtures.length, 'from API-Sports')
        return res.json(fixtures)
      }
    }

    res.json([])

  } catch (err) {
    console.error('[fixtures] Error for', code, ':', err.message)
    res.json([])
  }
})

// GET /api/leagues/:code/scorers
router.get('/:code/scorers', async (req, res) => {
  const { code } = req.params
  try {
    if (hasAPSKey()) {
      const league = LEAGUES.find(l => l.code === code)
      if (league?.apsId) {
        const r = await axios.get('https://v3.football.api-sports.io/players/topscorers', {
          headers: { 'x-apisports-key': getAPSKey() },
          params: { league: league.apsId, season: 2024 },
          timeout: 10000,
        })
        return res.json(r.data?.response || [])
      }
    }
    res.json([])
  } catch (err) {
    console.error('[scorers] Error:', err.message)
    res.json([])
  }
})

export default router;
