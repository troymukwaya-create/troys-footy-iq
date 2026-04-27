import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
const router = express.Router();
import api from '../services/apisports.js';
import * as fd from '../services/footballdata.js';
import cacheService from '../services/cache.js';
import { predictStatic } from '../engine/inferenceEngine.js';

// Hardcoded fallback — site is NEVER empty
const DEMO = [
  { id:'dm1', status:'SCHEDULED', date:new Date(Date.now()+7200000).toISOString(),
    homeTeam:{id:'fd_t_57',name:'Arsenal FC',crest:'https://crests.football-data.org/57.png'}, 
    awayTeam:{id:'fd_t_65',name:'Manchester City FC',crest:'https://crests.football-data.org/65.png'},
    score:{home:null,away:null}, league:{name:'Premier League',code:'PL',country:'England'},
    venue:'Emirates Stadium', source:'demo',
    probability: { riskLevel: 'MEDIUM', probabilities: { home: 38, draw: 28, away: 34 }, topScorelines: [{score: '1-1'}, {score: '2-1'}] } },
  { id:'dm2', status:'IN_PLAY', date:new Date(Date.now()-3600000).toISOString(),
    homeTeam:{id:'fd_t_86',name:'Real Madrid CF',crest:'https://crests.football-data.org/86.png'}, 
    awayTeam:{id:'fd_t_81',name:'FC Barcelona',crest:'https://crests.football-data.org/81.svg'},
    score:{home:2,away:1}, minute:67, league:{name:'La Liga',code:'PD',country:'Spain'},
    venue:'Santiago Bernabéu', source:'demo',
    probability: { riskLevel: 'LOW', probabilities: { home: 44, draw: 22, away: 34 }, topScorelines: [{score: '2-1'}, {score: '3-1'}] } },
  { id:'dm3', status:'SCHEDULED', date:new Date(Date.now()+86400000).toISOString(),
    homeTeam:{id:'fd_t_5',name:'FC Bayern München',crest:'https://crests.football-data.org/5.svg'}, 
    awayTeam:{id:'fd_t_4',name:'Borussia Dortmund',crest:'https://crests.football-data.org/4.png'},
    score:{home:null,away:null}, league:{name:'Bundesliga',code:'BL1',country:'Germany'},
    venue:'Allianz Arena', source:'demo',
    probability: { riskLevel: 'LOW', probabilities: { home: 58, draw: 20, away: 22 }, topScorelines: [{score: '3-0'}, {score: '2-1'}] } },
  { id:'dm4', status:'FINISHED', date:new Date(Date.now()-172800000).toISOString(),
    homeTeam:{id:'fd_t_64',name:'Liverpool FC',crest:'https://crests.football-data.org/64.png'}, 
    awayTeam:{id:'fd_t_66',name:'Manchester United FC',crest:'https://crests.football-data.org/66.png'},
    score:{home:3,away:0}, league:{name:'Premier League',code:'PL',country:'England'},
    venue:'Anfield', source:'demo',
    probability: { riskLevel: 'LOW', probabilities: { home: 65, draw: 18, away: 17 }, topScorelines: [{score: '2-0'}, {score: '3-0'}] } },
  { id:'dm5', status:'SCHEDULED', date:new Date(Date.now()+172800000).toISOString(),
    homeTeam:{id:'fd_t_108',name:'Inter Milan',crest:'https://crests.football-data.org/108.png'}, 
    awayTeam:{id:'fd_t_109',name:'Juventus FC',crest:'https://crests.football-data.org/109.png'},
    score:{home:null,away:null}, league:{name:'Serie A',code:'SA',country:'Italy'},
    venue:'San Siro', source:'demo',
    probability: { riskLevel: 'MEDIUM', probabilities: { home: 42, draw: 31, away: 27 }, topScorelines: [{score: '1-0'}, {score: '1-1'}] } },
];

// GET /api/fixtures/all — MAIN ENDPOINT
router.get('/all', async (req, res) => {
  try {
    const hasToken = process.env.FOOTBALLDATA_TOKEN?.length > 10;
    const hasApsKey = api.hasKey();

    // PRIMARY: football-data.org (free plan supports upcoming & recent fixtures)
    if (hasToken) {
      console.log('[fixtures/all] Fetching from football-data.org...');
      const today = new Date().toISOString().split('T')[0];
      const past  = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
      const future = new Date(Date.now() + 9 * 86400000).toISOString().split('T')[0]; // Max allowed for FD free tier ~10 days

      const [recent, upcoming] = await Promise.allSettled([
        fd.client.get('matches', { params: { competitions: fd.LEAGUE_CODES.join(','), dateFrom: past, dateTo: today } }).then(r => (r.data.matches || []).map(fd.normalise)).catch(e => { console.error('[fixtures/all] FD recent error:', e.response?.status, e.message); return []; }),
        fd.client.get('matches', { params: { competitions: fd.LEAGUE_CODES.join(','), dateFrom: today, dateTo: future } }).then(r => (r.data.matches || []).map(fd.normalise)).catch(e => { console.error('[fixtures/all] FD upcoming error:', e.response?.status, e.message); return []; }),
      ]);

      const recentData   = recent.status === 'fulfilled'   ? recent.value   : [];
      const upcomingData = upcoming.status === 'fulfilled' ? upcoming.value : [];

      const seen = new Set();
      const fixtures = [];
      for (const f of [...recentData, ...upcomingData]) {
        if (!seen.has(f.id)) { seen.add(f.id); fixtures.push(f); }
      }
      fixtures.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Inject AI Risk indicators & Probabilities from cache or engine
      fixtures.forEach(f => {
        const cached = cacheService.get('full_analysis_' + f.id);
        if (cached) {
          if (cached.ai) {
            f.ai_risk = cached.ai.risk_level || (cached.ai.confidence >= 70 ? 'LOW' : cached.ai.confidence >= 55 ? 'MEDIUM' : 'HIGH');
            f.ai_pick = cached.ai.recommendedPick || cached.ai.recommendedMarket;
          }
          if (cached.probability) {
            f.probability = cached.probability;
          }
        }
        // Fallback: generate from hybrid engine if no cached probability
        if (!f.probability) {
          try {
            const pred = predictStatic({}, {});
            f.probability = {
              riskLevel: pred.riskLevel,
              probabilities: pred.probabilities,
              topScorelines: (pred.topScorelines || []).slice(0, 2),
              model: pred.model || 'hybrid-dixon-coles-v2',
            };
          } catch { /* ignore prediction errors */ }
        }
      });

      console.log('[fixtures/all] football-data.org — Total:', fixtures.length,
        '| Recent:', recentData.length, '| Upcoming:', upcomingData.length);

      if (fixtures.length > 0) {
        return res.json({ fixtures, source: 'footballdata', total: fixtures.length });
      }
      console.log('[fixtures/all] football-data.org returned 0, trying apisports...');
    }

    // SECONDARY: api-sports
    if (hasApsKey) {
      console.log('[fixtures/all] Fetching from API-Sports...');
      const [recent, todayMatches, upcoming] = await Promise.all([
        api.getRecentFixtures(2),
        api.getTodayFixtures(),
        api.getUpcomingFixtures(14),
      ]);
      const seen = new Set();
      const fixtures = [];
      for (const f of [...recent, ...todayMatches, ...upcoming]) {
        if (!seen.has(f.id)) { seen.add(f.id); fixtures.push(f); }
      }
      fixtures.sort((a, b) => new Date(a.date) - new Date(b.date));

      fixtures.forEach(f => {
        const cached = cacheService.get('full_analysis_' + f.id);
        if (cached) {
          if (cached.ai) {
            f.ai_risk = cached.ai.risk_level || (cached.ai.confidence >= 70 ? 'LOW' : cached.ai.confidence >= 55 ? 'MEDIUM' : 'HIGH');
            f.ai_pick = cached.ai.recommendedPick || cached.ai.recommendedMarket;
          }
          if (cached.probability) {
            f.probability = cached.probability;
          }
        }
      });
      console.log('[fixtures/all] API-Sports Total:', fixtures.length);
      if (fixtures.length > 0) {
        return res.json({ fixtures, source: 'apisports', total: fixtures.length });
      }
    }

    // FALLBACK: demo data
    if (!hasToken && !hasApsKey) {
      console.log('[fixtures/all] No API keys — serving demo');
    } else {
      console.log('[fixtures/all] All APIs returned 0 — using demo');
    }
    res.json({ fixtures: DEMO, source: 'demo', total: DEMO.length });

  } catch (err) {
    console.error('[fixtures/all] Error:', err.message);
    res.json({ fixtures: DEMO, source: 'demo_error', total: DEMO.length });
  }
});

// GET /api/fixtures/live
router.get('/live', async (req, res) => {
  try {
    const live = api.hasKey() ? await api.getLiveFixtures() : DEMO.filter(f => f.status === 'IN_PLAY');
    res.json(live);
  } catch (err) { res.json([]); }
});

router.get('/team/:id',          async (req, res) => { try { res.json(await api.getTeamInfo(req.params.id) || {}); } catch(e) { res.json({}); } });
router.get('/squad/:id',         async (req, res) => { try { res.json(await api.getSquad(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/team-fixtures/:id', async (req, res) => { try { res.json(await api.getTeamFixtures(req.params.id) || []); } catch(e) { res.json([]); } });

router.get('/:id/stats',       async (req, res) => { try { res.json(await api.getFixtureStats(req.params.id) || {}); } catch(e) { res.json({}); } });
router.get('/:id/events',      async (req, res) => { try { res.json(await api.getFixtureEvents(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/:id/lineups',     async (req, res) => { try { res.json(await api.getFixtureLineups(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/:id/players',     async (req, res) => { try { res.json(await api.getFixturePlayers(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/:id/predictions', async (req, res) => { try { res.json(await api.getPredictions(req.params.id) || {}); } catch(e) { res.json({}); } });
router.get('/:id',             async (req, res) => { try { res.json(await api.getFixture(req.params.id) || {}); } catch(e) { res.json({}); } });

export default router;
