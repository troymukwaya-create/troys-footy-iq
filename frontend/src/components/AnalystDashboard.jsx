import React, { useMemo } from 'react';
import { useBriefing } from '../hooks/useQueries.js';

/**
 * AnalystDashboard — Center panel when no fixture is selected.
 * Structured sections: Briefing → Live → Upcoming → Results.
 */
export function AnalystDashboard({ fixtures = [], onSelect }) {
  const { data: briefing } = useBriefing(fixtures);

  const liveMatches = useMemo(() =>
    (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED'),
    [fixtures]
  );

  const upcomingToday = useMemo(() => {
    const today = new Date().toDateString();
    return (fixtures || []).filter(f =>
      f.status === 'SCHEDULED' && new Date(f.date).toDateString() === today
    );
  }, [fixtures]);

  const recentResults = useMemo(() =>
    (fixtures || []).filter(f => f.status === 'FINISHED').slice(0, 6),
    [fixtures]
  );

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="animate-fade-in" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Daily Briefing */}
      {briefing && (
        <div className="card animate-fade-in" style={{ padding: 20, marginBottom: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 12 }}>Today's Insights</h2>

          {briefing.headline && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 16 }}>{briefing.headline}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {briefing.topPick && (
              <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--success-muted)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em', marginBottom: 4 }}>TOP PICK</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{briefing.topPick.fixture}</div>
                {briefing.topPick.market && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{briefing.topPick.market}</div>}
                {briefing.topPick.confidence && (
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>{briefing.topPick.confidence}%</div>
                )}
              </div>
            )}
            {briefing.gameOfTheDay && (
              <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--accent-muted)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 4 }}>GAME OF THE DAY</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{briefing.gameOfTheDay.fixture}</div>
                {briefing.gameOfTheDay.why && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{briefing.gameOfTheDay.why}</div>}
              </div>
            )}
            {briefing.avoid && (
              <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--danger-muted)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: '0.06em', marginBottom: 4 }}>AVOID</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{briefing.avoid.fixture}</div>
                {briefing.avoid.why && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{briefing.avoid.why}</div>}
              </div>
            )}
          </div>

          {briefing.summary && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>{briefing.summary}</p>
          )}
        </div>
      )}

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <div className="animate-fade-in" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
            <h2 className="section-title" style={{ color: 'var(--success)' }}>Live Now</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{liveMatches.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
            {liveMatches.map(f => <DashboardMatchCard key={f.id} fixture={f} onClick={() => onSelect?.(f)} variant="live" />)}
          </div>
        </div>
      )}

      {/* Upcoming Today */}
      {upcomingToday.length > 0 && (
        <div className="animate-fade-in" style={{ marginBottom: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 12 }}>Coming Up</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
            {upcomingToday.slice(0, 8).map(f => <DashboardMatchCard key={f.id} fixture={f} onClick={() => onSelect?.(f)} variant="upcoming" />)}
          </div>
        </div>
      )}

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <div className="animate-fade-in" style={{ marginBottom: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 12 }}>Recent Results</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
            {recentResults.map(f => <DashboardMatchCard key={f.id} fixture={f} onClick={() => onSelect?.(f)} variant="result" />)}
          </div>
        </div>
      )}

      {/* Empty State */}
      {fixtures.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚽</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No fixtures available</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Check that the backend is running</div>
        </div>
      )}
    </div>
  );
}

function DashboardMatchCard({ fixture, onClick, variant }) {
  const isLive = variant === 'live';
  const isResult = variant === 'result';
  const homeWon = isResult && (fixture.score?.home ?? 0) > (fixture.score?.away ?? 0);
  const awayWon = isResult && (fixture.score?.away ?? 0) > (fixture.score?.home ?? 0);

  const time = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div onClick={onClick} className="match-card card" style={{ padding: '12px 16px', cursor: 'pointer', opacity: isResult ? 0.75 : 1 }}>
      {/* League + Time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fixture.league?.name || ''}</span>
        {isLive ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
            {fixture.minute ? `${fixture.minute}'` : 'LIVE'}
          </span>
        ) : isResult ? (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>FT</span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{time}</span>
        )}
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {fixture.homeTeam?.crest && <img src={fixture.homeTeam.crest} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
          <span style={{ fontSize: 13, fontWeight: homeWon ? 600 : 400, color: homeWon ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fixture.homeTeam?.name || 'Home'}
          </span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, color: isLive ? 'var(--success)' : 'var(--text-secondary)', padding: '0 8px', fontVariantNumeric: 'tabular-nums' }}>
          {fixture.score?.home ?? (isResult ? '?' : '–')} - {fixture.score?.away ?? (isResult ? '?' : '–')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 13, fontWeight: awayWon ? 600 : 400, color: awayWon ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
            {fixture.awayTeam?.name || 'Away'}
          </span>
          {fixture.awayTeam?.crest && <img src={fixture.awayTeam.crest} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
        </div>
      </div>
    </div>
  );
}
