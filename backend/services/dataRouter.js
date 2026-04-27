import * as fd from './footballdata.js';
import * as apf from './apifootball.js';
import { FD_LEAGUES, APF_LEAGUES } from '../constants/leagues.js';

export async function getAllLiveMatches() {
  const fdLive = await fd.getLiveMatches().catch(e => { console.error('FD Live fail', e.message); return []; });
  const apfLive = await apf.getLiveFixtures().catch(e => { console.error('APF Live fail', e.message); return []; });
  return [...fdLive, ...apfLive];
}

export async function getStandings(code) {
  if (FD_LEAGUES[code]) return fd.getStandings(code).catch(() => []);
  if (APF_LEAGUES[code]) return apf.getStandings(code, new Date().getFullYear()).catch(() => []);
  return [];
}

export async function getTodayFixtures() {
  const fdToday = await fd.getTodayMatches().catch(e => { console.error('FD Today fail', e.message); return []; });
  
  const today = new Date().toISOString().split('T')[0];
  const apfMatches = [];
  for (const leagueId of Object.keys(APF_LEAGUES)) {
     const matches = await apf.getFixtures(leagueId, new Date().getFullYear()).catch(() => []);
     const todays = matches.filter(m => m.date && m.date.startsWith(today));
     apfMatches.push(...todays);
  }
  return [...fdToday, ...apfMatches];
}

export async function getH2H(matchOrTeamIds) {
  if (typeof matchOrTeamIds === 'string' && matchOrTeamIds.startsWith('fd_')) {
    return fd.getH2H(matchOrTeamIds).catch(() => ({ matches: [] }));
  }
  if (matchOrTeamIds && matchOrTeamIds.team1Id && matchOrTeamIds.team2Id) {
    return apf.getH2H(matchOrTeamIds.team1Id, matchOrTeamIds.team2Id).catch(() => []);
  }
  return { matches: [] };
}

export async function getLeagueFixtures(code, params = {}) {
  if (FD_LEAGUES[code]) return fd.getFixtures(code, params).catch(() => []);
  if (APF_LEAGUES[code]) {
      const year = params.season || new Date().getFullYear();
      return apf.getFixtures(code, year).catch(() => []);
  }
  return [];
}

export default {
  getAllLiveMatches,
  getStandings,
  getTodayFixtures,
  getH2H,
  getLeagueFixtures
};
