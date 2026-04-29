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

-- ═══════════════════════════════════════════════════════════════════
-- PREDICTION SYSTEM TABLES (v3)
-- ═══════════════════════════════════════════════════════════════════

-- ─── PREDICTIONS LOG ────────────────────────────────────────────────
-- Every pre-match prediction stored BEFORE kickoff for evaluation.
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  fixture_id INT REFERENCES fixtures(id),
  model_version VARCHAR(30) NOT NULL DEFAULT 'v1',
  prob_home FLOAT NOT NULL,
  prob_draw FLOAT NOT NULL,
  prob_away FLOAT NOT NULL,
  lambda_home FLOAT,
  lambda_away FLOAT,
  risk_level VARCHAR(10),
  confidence FLOAT,
  features JSONB,
  actual_result VARCHAR(10), -- filled after match: 'HOME','DRAW','AWAY'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ
);

-- ─── MODEL PERFORMANCE RUNS ────────────────────────────────────────
-- Each backtest or weekly evaluation stores a summary row.
CREATE TABLE IF NOT EXISTS model_runs (
  id SERIAL PRIMARY KEY,
  model_version VARCHAR(30) NOT NULL,
  run_type VARCHAR(20) NOT NULL, -- 'backtest', 'weekly_eval', 'retrain'
  matches_evaluated INT DEFAULT 0,
  accuracy FLOAT,
  brier_score FLOAT,
  log_loss FLOAT,
  ece FLOAT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ODDS HISTORY ───────────────────────────────────────────────────
-- Snapshots of bookmaker odds for CLV tracking and value backtesting.
CREATE TABLE IF NOT EXISTS odds_history (
  id SERIAL PRIMARY KEY,
  fixture_id INT REFERENCES fixtures(id),
  bookmaker VARCHAR(50) NOT NULL,
  market VARCHAR(20) NOT NULL,
  outcome VARCHAR(30) NOT NULL,
  odds_value FLOAT NOT NULL,
  implied_prob FLOAT,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, bookmaker, market, outcome, captured_at)
);

-- ─── FITTED MODEL PARAMETERS ───────────────────────────────────────
-- Stores serialized model weights, calibration curves, Dixon-Coles params.
CREATE TABLE IF NOT EXISTS model_params (
  id SERIAL PRIMARY KEY,
  model_version VARCHAR(30) UNIQUE NOT NULL,
  param_type VARCHAR(30) NOT NULL, -- 'dixon_coles', 'xgboost', 'calibration'
  params JSONB NOT NULL,
  metrics JSONB, -- evaluation metrics at time of fitting
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PREDICTION SYSTEM INDEXES ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_predictions_fixture ON predictions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_unevaluated ON predictions(actual_result) WHERE actual_result IS NULL;
CREATE INDEX IF NOT EXISTS idx_model_runs_version ON model_runs(model_version, created_at);
CREATE INDEX IF NOT EXISTS idx_odds_history_fixture ON odds_history(fixture_id, market);
CREATE INDEX IF NOT EXISTS idx_model_params_active ON model_params(is_active) WHERE is_active = true;

