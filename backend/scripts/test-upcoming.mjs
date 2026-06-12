import api from '../services/apisports.js';

const days = parseInt(process.argv[2] || '2', 10);
console.log('hasKey:', api.hasKey());
const fixtures = await api.getUpcomingFixtures(days);
console.log(`getUpcomingFixtures(${days}) -> ${fixtures.length} fixtures`);
for (const f of fixtures.slice(0, 8)) {
  console.log(` ${f.date}  [${f.league.code}] ${f.homeTeam.name} vs ${f.awayTeam.name} (${f.statusRaw})`);
}
