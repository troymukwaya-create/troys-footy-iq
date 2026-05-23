import React, { useEffect, useState } from 'react';
import { Flame, Radio, Loader2, CalendarX } from 'lucide-react';
import { motion } from 'motion/react';
import { useAIPicks } from '../hooks/useAIPicks';
import LiveScoreCard from '../components/LiveScoreCard';
import AIPickCard from '../components/AIPickCard';
import BrierScoreHero from '../components/BrierScoreHero';
import api from '../api/client';
import { Link } from 'react-router-dom';
import { enter, enterStagger } from '../lib/motion.js';

// ─── HELPERS ────────────────────────────────────────────────────────
const LeagueHeader = ({ name }) => (
  <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-outline-variant/20 pb-2">
    <span className="w-1.5 h-1.5 rounded-full bg-neon" />
    {name}
  </h3>
);

const FixtureGroup = ({ fixtures, title }) => {
  const grouped = fixtures.reduce((acc, f) => {
    const lName = f.league?.name || 'Other Competitions';
    if (!acc[lName]) acc[lName] = [];
    acc[lName].push(f);
    return acc;
  }, {});

  if (fixtures.length === 0) return null;

  return (
    <motion.section {...enter} className="mb-8">
      <h2 className="text-lg font-bold mb-4 text-on-surface uppercase tracking-wider">{title}</h2>
      <div className="space-y-6">
        {Object.entries(grouped).map(([leagueName, matches]) => (
          <div key={leagueName} className="bg-surface-container border border-outline-variant/20 rounded-2xl p-6">
            <LeagueHeader name={leagueName} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {matches.map((m, i) => (
                <motion.div key={m.id} {...enterStagger(i)}>
                  <LiveScoreCard match={m} />
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
};

const UpcomingGroup = ({ fixtures }) => {
  const byDate = fixtures.reduce((acc, f) => {
    const d = new Date(f.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (!acc[d]) acc[d] = [];
    acc[d].push(f);
    return acc;
  }, {});

  if (fixtures.length === 0) return null;

  return (
    <motion.section {...enter} className="mb-8">
      <h2 className="text-lg font-bold mb-6 text-on-surface uppercase tracking-wider">Upcoming this week</h2>
      <div className="space-y-8">
        {Object.entries(byDate).map(([dateStr, dayMatches]) => {
          const byLeague = dayMatches.reduce((acc, f) => {
            const lName = f.league?.name || 'Other';
            if (!acc[lName]) acc[lName] = [];
            acc[lName].push(f);
            return acc;
          }, {});

          return (
            <div key={dateStr}>
              <h3 className="text-base font-bold text-neon mb-4">{dateStr}</h3>
              <div className="space-y-6">
                {Object.entries(byLeague).map(([leagueName, matches]) => (
                  <div key={leagueName} className="bg-surface-container border border-outline-variant/20 rounded-2xl p-6">
                    <LeagueHeader name={leagueName} />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {matches.map((m, i) => (
                        <motion.div key={m.id} {...enterStagger(i)}>
                          <LiveScoreCard match={m} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
};

// ─── MAIN ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { todayPicks, loading: picksLoading } = useAIPicks();
  const [liveMatches, setLiveMatches] = useState([]);
  const [todayMatches, setTodayMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await api.get('/fixtures/live');
        setLiveMatches(res.data || []);
      } catch (e) { console.error('Live sync error', e); }
    };

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [todayRes, upcomingRes] = await Promise.all([
          api.get('/fixtures/today').catch(() => ({ data: [] })),
          api.get('/fixtures/upcoming').catch(() => ({ data: [] })),
        ]);
        setTodayMatches(todayRes.data || []);
        const todayIds = new Set((todayRes.data || []).map(m => m.id));
        setUpcomingMatches((upcomingRes.data || []).filter(m => !todayIds.has(m.id)));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };

    fetchLive();
    fetchAll();

    const int = setInterval(fetchLive, 30000);
    return () => clearInterval(int);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 p-4">
        <div className="h-32 bg-surface-container border border-outline-variant/20 rounded-2xl animate-pulse" />
        <div className="h-64 bg-surface-container border border-outline-variant/20 rounded-2xl animate-pulse" />
        <div className="h-64 bg-surface-container border border-outline-variant/20 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-10 min-h-screen pb-16 px-4 sm:px-6">
      {/* ── BRIER SCORE HERO ─────────────────────────────────────────── */}
      <BrierScoreHero />

      {/* ── LIVE NOW ────────────────────────────────────────────────── */}
      {liveMatches.length > 0 && (
        <motion.section {...enter}>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-bold text-on-surface tracking-tight">Live now</h2>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {liveMatches.map((m, i) => (
              <motion.div
                key={m.id}
                {...enterStagger(i)}
                className="ring-1 ring-secondary/40 rounded-xl shadow-[0_0_18px_rgba(47,248,1,0.10)] bg-secondary-container/5"
              >
                <LiveScoreCard match={m} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── TODAY ───────────────────────────────────────────────────── */}
      {todayMatches.length > 0 ? (
        <FixtureGroup fixtures={todayMatches} title="Today's fixtures" />
      ) : (
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4 text-on-surface uppercase tracking-wider">Today's fixtures</h2>
          <div className="text-on-surface-variant text-sm p-8 bg-surface-container rounded-2xl border border-outline-variant/20 text-center flex flex-col items-center gap-3">
            <CalendarX size={24} className="text-on-surface-variant/60" strokeWidth={1.5} />
            <span>No fixtures scheduled for today.</span>
          </div>
        </section>
      )}

      {/* ── UPCOMING ────────────────────────────────────────────────── */}
      {upcomingMatches.length > 0 && (
        <UpcomingGroup fixtures={upcomingMatches} />
      )}

      {/* ── AI PICKS ────────────────────────────────────────────────── */}
      <motion.section {...enter} className="border-t border-outline-variant/20 pt-8 mt-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <Flame size={18} className="text-tertiary" />
            AI picks today
          </h2>
          <Link
            to="/ai-picks"
            className="text-sm text-neon hover:text-primary-dim transition-colors font-medium"
          >
            View detailed analysis →
          </Link>
        </div>

        {picksLoading ? (
          <div className="p-8 bg-surface-container rounded-2xl border border-outline-variant/20 flex items-center justify-center gap-3 text-sm font-semibold text-on-surface-variant">
            <Loader2 size={16} className="animate-spin text-secondary" />
            Analysing matches…
          </div>
        ) : todayPicks.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {todayPicks.map((pick, i) => (
              <motion.div key={pick.id} {...enterStagger(i)}>
                <AIPickCard pick={pick} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-8 bg-surface-container rounded-2xl border border-outline-variant/20 text-center flex flex-col items-center gap-3 text-on-surface-variant text-sm">
            <Radio size={20} className="text-on-surface-variant/60" strokeWidth={1.5} />
            <span>No low-risk picks identified for today's matches.</span>
          </div>
        )}
      </motion.section>
    </div>
  );
}
