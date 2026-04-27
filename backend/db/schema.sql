-- ═══════════════════════════════════════════════════════════════════
-- Troy's Footy IQ — Database Schema v2
-- Production-grade schema with caching strategy
-- ═══════════════════════════════════════════════════════════════════

-- ─── LEAGUES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100),
  country VARCHAR(50),
  logo_url TEXT,
  source VARCHAR(20)
);

-- ─── TEAMS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(30) UNIQUE,
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(50),
  league_id INT REFERENCES leagues(id),
  logo_url TEXT,
  stadium VARCHAR(100)
);

-- ─── PLAYERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(30) UNIQUE,
  name VARCHAR(100) NOT NULL,
  team_id INT REFERENCES teams(id),
  position VARCHAR(30),
  nationality VARCHAR(50),
  date_of_birth DATE,
  photo_url TEXT
);

-- ─── FIXTURES (MATCHES) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixtures (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(30) UNIQUE,
  league_id INT REFERENCES leagues(id),
  home_team_id INT REFERENCES teams(id),
  away_team_id INT REFERENCES teams(id),
  match_date TIMESTAMPTZ,
  status VARCHAR(20),
  home_goals INT,
  away_goals INT,
  ht_home INT,
  ht_away INT,
  venue VARCHAR(100),
  referee VARCHAR(100),
  minute INT
);

-- ─── MATCH EVENTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_events (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(50) UNIQUE,
  fixture_id INT REFERENCES fixtures(id),
  type VARCHAR(30),
  minute INT,
  player_name VARCHAR(100),
  team_name VARCHAR(100),
  x FLOAT,
  y FLOAT,
  xg_value FLOAT,
  outcome VARCHAR(50),
  detail JSONB
);

-- ─── TEAM SEASON STATS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_season_stats (
  id SERIAL PRIMARY KEY,
  team_id INT REFERENCES teams(id),
  league_id INT REFERENCES leagues(id),
  season INT,
  played INT DEFAULT 0,
  wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  losses INT DEFAULT 0,
  goals_for INT DEFAULT 0,
  goals_against INT DEFAULT 0,
  clean_sheets INT DEFAULT 0,
  btts_count INT DEFAULT 0,
  over25_count INT DEFAULT 0,
  form VARCHAR(10),
  avg_goals_for FLOAT DEFAULT 0,
  avg_goals_against FLOAT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, league_id, season)
);

-- ─── AI PICKS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_picks (
  id SERIAL PRIMARY KEY,
  fixture_id INT REFERENCES fixtures(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pick_type VARCHAR(50),
  pick_detail VARCHAR(100),
  confidence INT,
  risk_score INT,
  risk_level VARCHAR(10),
  reasoning TEXT,
  key_risks TEXT[],
  actual_result VARCHAR(20),
  analysis_json JSONB
);

-- ─── LEAGUE STANDINGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_standings (
  id SERIAL PRIMARY KEY,
  league_id INT REFERENCES leagues(id),
  team_id INT REFERENCES teams(id),
  season INT,
  rank INT,
  points INT,
  played INT,
  won INT,
  drawn INT,
  lost INT,
  goals_for INT,
  goals_against INT,
  goal_diff INT,
  form VARCHAR(10),
  UNIQUE(league_id, team_id, season)
);

-- ─── H2H (HEAD TO HEAD) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS h2h (
  id SERIAL PRIMARY KEY,
  team_a INT REFERENCES teams(id),
  team_b INT REFERENCES teams(id),
  stats_json JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_a, team_b)
);

-- ─── CACHE TABLE (for API response caching) ────────────────────────
CREATE TABLE IF NOT EXISTS api_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  data JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures(match_date, status);
CREATE INDEX IF NOT EXISTS idx_fixtures_league ON fixtures(league_id);
CREATE INDEX IF NOT EXISTS idx_ai_picks_risk ON ai_picks(risk_level, confidence);
CREATE INDEX IF NOT EXISTS idx_team_stats_team ON team_season_stats(team_id, season);
CREATE INDEX IF NOT EXISTS idx_h2h_teams ON h2h(team_a, team_b);
CREATE INDEX IF NOT EXISTS idx_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);
