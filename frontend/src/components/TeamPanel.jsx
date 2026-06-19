import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTeamInfo, useTeamFixtures } from '../hooks/useQueries.js';
import { FixtureList } from './FixtureList.jsx';
import TeamMark from './TeamMark.jsx';
import { SkeletonCard } from './ui/SkeletonLoader.jsx';

// A team's page: shown in the center panel when ?team=<id> is set (from the
// search bar). Header + that team's recent/upcoming fixtures, freshness-first.
// Works year-round for ANY team — even an offseason or non-World-Cup nation —
// which is exactly when the main feed has nothing for them.
export function TeamPanel({ teamId, onSelectFixture, onBack }) {
  const { data: info, isLoading: infoLoading } = useTeamInfo(teamId);
  const { data: fixtures = [], isLoading: fixturesLoading } = useTeamFixtures(teamId);

  const name = info?.name || (fixtures[0]?.homeTeam?.id === teamId ? fixtures[0]?.homeTeam?.name : null) || 'Team';
  const crest = info?.logo || null;
  const country = info?.country || null;

  return (
    <div style={{ padding: '16px 16px 32px' }}>
      <button
        onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, padding: 0 }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <TeamMark name={name} crest={crest} size={44} />
        <div>
          <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{name}</div>
          {country && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{country}</div>}
        </div>
      </div>

      {fixturesLoading || infoLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : (
        <FixtureList
          fixtures={fixtures}
          onSelect={onSelectFixture}
          emptyLabel="No fixtures found for this team"
        />
      )}
    </div>
  );
}

export default TeamPanel;
