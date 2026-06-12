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

-- ═══════════════════════════════════════════════════════════════════
-- FEEDBACK LOOP TABLES (v4)
-- ═══════════════════════════════════════════════════════════════════

-- ─── PER-MATCH MODEL PERFORMANCE ────────────────────────────────────
-- Stores computed metrics for every evaluated prediction.
-- This is the core feedback loop output — one row per prediction per match.
CREATE TABLE IF NOT EXISTS model_performance (
  id SERIAL PRIMARY KEY,
  prediction_id INT REFERENCES predictions(id),
  match_external_id VARCHAR(30) NOT NULL,
  fixture_id INT REFERENCES fixtures(id),
  log_loss FLOAT,
  brier_score FLOAT,
  prediction_correct BOOLEAN,
  predicted_outcome VARCHAR(10),
  actual_outcome VARCHAR(10),
  prob_home FLOAT,
  prob_draw FLOAT,
  prob_away FLOAT,
  odds_home FLOAT,
  odds_draw FLOAT,
  odds_away FLOAT,
  value_edge_home FLOAT,
  value_edge_draw FLOAT,
  value_edge_away FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_perf_match ON model_performance(match_external_id);
CREATE INDEX IF NOT EXISTS idx_model_perf_fixture ON model_performance(fixture_id);
CREATE INDEX IF NOT EXISTS idx_model_perf_date ON model_performance(created_at);
CREATE INDEX IF NOT EXISTS idx_model_perf_correct ON model_performance(prediction_correct);

-- ─── EXTEND PREDICTIONS TABLE ───────────────────────────────────────
-- Add columns for odds, value edges, and team names (idempotent ALTER)
DO $$ BEGIN
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS odds_home FLOAT;
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS odds_draw FLOAT;
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS odds_away FLOAT;
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS value_edge_home FLOAT;
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS value_edge_draw FLOAT;
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS value_edge_away FLOAT;
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS match_external_id VARCHAR(30);
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS home_team VARCHAR(100);
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS away_team VARCHAR(100);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_predictions_external ON predictions(match_external_id);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(created_at);

-- ═══════════════════════════════════════════════════════════════════
-- SELF-IMPROVING ENGINE TABLES (v5)
-- ═══════════════════════════════════════════════════════════════════

-- ─── MARKET-LEVEL PREDICTIONS ──────────────────────────────────────
-- Stores per-market predictions (BTTS, O/U, etc.) alongside the main 1X2.
-- Enables market-level feedback and bias detection.
CREATE TABLE IF NOT EXISTS market_predictions (
  id SERIAL PRIMARY KEY,
  prediction_id INT REFERENCES predictions(id) ON DELETE CASCADE,
  market_type VARCHAR(30) NOT NULL,      -- 'BTTS_YES','OVER_25','HOME_WIN', etc.
  predicted_prob FLOAT NOT NULL,
  implied_odds_prob FLOAT,               -- From bookmaker odds if available
  actual_hit BOOLEAN,                    -- Filled after match ends
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_pred_prediction ON market_predictions(prediction_id);
CREATE INDEX IF NOT EXISTS idx_market_pred_type ON market_predictions(market_type);
CREATE INDEX IF NOT EXISTS idx_market_pred_unevaluated ON market_predictions(actual_hit) WHERE actual_hit IS NULL;

-- ─── FEEDBACK AGGREGATES ───────────────────────────────────────────
-- Stores aggregated bias metrics by league, market type, and odds range.
-- This is the core data structure for the feedback loop.
CREATE TABLE IF NOT EXISTS feedback_aggregates (
  id SERIAL PRIMARY KEY,
  model_version VARCHAR(30) NOT NULL,
  dimension VARCHAR(30) NOT NULL,         -- 'league', 'market', 'odds_range', 'outcome'
  dimension_value VARCHAR(50) NOT NULL,   -- 'PL', 'BTTS_YES', '1.50-2.00', 'DRAW'
  sample_size INT NOT NULL DEFAULT 0,
  avg_predicted_prob FLOAT,
  actual_hit_rate FLOAT,
  bias FLOAT,                             -- predicted - actual (positive = overconfident)
  brier_score FLOAT,
  log_loss FLOAT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_version, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_feedback_agg_version ON feedback_aggregates(model_version);
CREATE INDEX IF NOT EXISTS idx_feedback_agg_dimension ON feedback_aggregates(dimension, dimension_value);

-- ─── MODEL VERSIONS ────────────────────────────────────────────────
-- Full version tracking with weights, calibration, and comparison metrics.
-- Each version is a snapshot of model configuration at a point in time.
CREATE TABLE IF NOT EXISTS model_versions (
  id SERIAL PRIMARY KEY,
  version VARCHAR(30) UNIQUE NOT NULL,
  parent_version VARCHAR(30),
  weights JSONB NOT NULL,                 -- { poisson: 0.50, form: 0.25, ... }
  calibration_curves JSONB,               -- Data-driven calibration maps
  league_corrections JSONB,               -- Per-league goal variance corrections
  bias_corrections JSONB,                 -- Correction factors from feedback loop
  config JSONB,                           -- Additional model config
  metrics JSONB,                          -- Performance at time of creation
  is_active BOOLEAN DEFAULT false,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_versions_active ON model_versions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_model_versions_date ON model_versions(created_at);

-- ─── EXTEND PREDICTIONS TABLE (v5) ─────────────────────────────────
DO $$ BEGIN
  ALTER TABLE predictions ADD COLUMN IF NOT EXISTS league_code VARCHAR(10);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_predictions_league ON predictions(league_code);

-- ═══════════════════════════════════════════════════════════════════
-- PRODUCTION HARDENING TABLES (v6)
-- ═══════════════════════════════════════════════════════════════════

-- ─── SYSTEM ALERTS ─────────────────────────────────────────────────
-- Persistent monitoring alerts. Replaces in-memory-only tracking.
CREATE TABLE IF NOT EXISTS system_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL,        -- 'ACCURACY_DROP', 'API_FAILURE', 'MODEL_DRIFT', etc.
  severity VARCHAR(20) NOT NULL,          -- 'INFO', 'WARNING', 'CRITICAL'
  message TEXT NOT NULL,
  context JSONB,                          -- Additional alert data
  source VARCHAR(50) DEFAULT 'system',    -- 'monitor', 'optimizer', 'scheduler', etc.
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON system_alerts(severity) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_alerts_type ON system_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_recent ON system_alerts(created_at DESC);

-- ─── PERFORMANCE INDEXES (v6) ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mp_eval_join ON model_performance(prediction_id, actual_outcome);
CREATE INDEX IF NOT EXISTS idx_pred_pending ON predictions(match_external_id) WHERE actual_result IS NULL;
CREATE INDEX IF NOT EXISTS idx_market_pred_eval ON market_predictions(prediction_id, actual_hit);
CREATE INDEX IF NOT EXISTS idx_pred_model_version ON predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_pred_actual ON predictions(actual_result) WHERE actual_result IS NOT NULL;
-- ═══════════════════════════════════════════════════════════════════
-- AI ANALYSIS CACHE (v7)
-- ═══════════════════════════════════════════════════════════════════

-- ─── AI ANALYSIS CACHE ─────────────────────────────────────────────
-- Caches Claude analysis results for 6 hours to avoid redundant API calls.
CREATE TABLE IF NOT EXISTS ai_analysis_cache (
  id SERIAL PRIMARY KEY,
  fixture_id VARCHAR(50) NOT NULL,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_fixture ON ai_analysis_cache(fixture_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- CEO COMMAND CENTER TABLES (v8)
-- Powers the /admin analytics dashboard: first-party visitor tracking,
-- external API quota usage, and AI (Claude) cost accounting.
-- ═══════════════════════════════════════════════════════════════════

-- ─── SITE EVENTS (first-party analytics) ───────────────────────────
-- Every visitor pageview / interaction. Written by the public /api/track
-- endpoint. This makes the CEO dashboard show real traffic with ZERO
-- external dependency — PostHog (if configured) is purely additive.
CREATE TABLE IF NOT EXISTS site_events (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(40) NOT NULL,        -- anonymous client id (localStorage uuid)
  session_id VARCHAR(40),                 -- per-session id (resets on tab close)
  event_name VARCHAR(60) NOT NULL,        -- '$pageview' | 'prediction_viewed' | 'ai_analysis_opened' | ...
  path VARCHAR(300),                      -- page path
  referrer VARCHAR(300),                  -- document.referrer
  country VARCHAR(60),                    -- best-effort from CF/Vercel headers
  device VARCHAR(20),                     -- 'mobile' | 'desktop' | 'tablet'
  props JSONB,                            -- arbitrary event properties (fixture_id, teams, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_events_time   ON site_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_visitor ON site_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_site_events_name   ON site_events(event_name, created_at DESC);

-- ─── API USAGE LOG (external quota tracking) ───────────────────────
-- One row per outbound call to football-data.org / api-sports.io / anthropic.
-- Written by monitor.recordApiCall(). Powers the quota gauges that stop
-- you from silently blowing through a free-tier limit on a match day.
CREATE TABLE IF NOT EXISTS api_usage_log (
  id SERIAL PRIMARY KEY,
  source VARCHAR(30) NOT NULL,            -- 'footballdata' | 'apisports' | 'anthropic'
  endpoint VARCHAR(200),
  success BOOLEAN NOT NULL DEFAULT true,
  response_time_ms INT,
  called_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_source_date ON api_usage_log(source, called_at DESC);

-- ─── API COST LOG (Claude spend accounting) ────────────────────────
-- One row per Claude API call with token counts + computed USD cost.
-- Lets the CEO dashboard show spend-vs-budget in real time.
CREATE TABLE IF NOT EXISTS api_cost_log (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(30) DEFAULT 'anthropic',
  model VARCHAR(60),
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cached_tokens INT NOT NULL DEFAULT 0,
  cost_usd FLOAT NOT NULL DEFAULT 0,
  endpoint VARCHAR(100),                  -- 'ai_verdict' | 'model_insights' | ...
  called_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_cost_date ON api_cost_log(called_at DESC);

-- ─── SITE EVENTS — accuracy columns (v9) ───────────────────────────
-- synthetic separates demo/seed data from real visitors; browser/os enrich
-- the per-visitor detail view. Idempotent so existing deploys upgrade safely.
DO $$ BEGIN
  ALTER TABLE site_events ADD COLUMN IF NOT EXISTS synthetic BOOLEAN DEFAULT false;
  ALTER TABLE site_events ADD COLUMN IF NOT EXISTS browser VARCHAR(40);
  ALTER TABLE site_events ADD COLUMN IF NOT EXISTS os VARCHAR(40);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_site_events_synthetic ON site_events(synthetic, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- EMAIL / CRM (v10) — owned subscriber list for the daily picks email
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  source VARCHAR(40),                       -- capture hook: 'landing' | 'in_app' | 'after_slip' | ...
  visitor_id VARCHAR(40),                   -- stitches to site_events for CRM behaviour
  prefs JSONB,                              -- {worldCup:true, leagues:[...]}
  consent BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'active',      -- 'active' | 'unsubscribed'
  unsubscribe_token VARCHAR(64),
  confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscribers_visitor ON subscribers(visitor_id);

-- One row per broadcast send; the UNIQUE pair is the once-per-day guard
-- (two instances racing during a deploy can't both send the daily picks).
CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,                -- 'daily_picks'
  send_date DATE NOT NULL,
  recipients INT DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (kind, send_date)
);

-- ═══════════════════════════════════════════════════════════════════
-- ACCOUNTS / AUTH (v11) — passwordless magic-link login + saved slips
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
-- one-time, short-lived magic-link tokens
CREATE TABLE IF NOT EXISTS login_tokens (
  token VARCHAR(80) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- long-lived sessions so people stay signed in across visits
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(80) PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS saved_slips (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(120),
  legs JSONB NOT NULL,
  combined_odds FLOAT,
  ev_pct FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_slips_user ON saved_slips(user_id, created_at DESC);

-- ─── LEARNED NATIONAL-TEAM ELO (World Cup engine) ──────────────────
-- National-team strength that LEARNS from qualifier/friendly results.
-- getElo() prefers these learned values over the static snapshot.
CREATE TABLE IF NOT EXISTS national_elo (
  team_norm    VARCHAR(60) PRIMARY KEY,   -- normalised team name
  team_name    VARCHAR(80),               -- last-seen display name
  elo          INT NOT NULL,
  played       INT NOT NULL DEFAULT 0,    -- results learned from
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PLATFORM UPDATES (CEO dashboard changelog) ────────────────────
-- Dated record of every shipped/incoming platform update, shown in the CEO
-- command center. The CEO can "approve" an update to feature it.
CREATE TABLE IF NOT EXISTS platform_updates (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80) UNIQUE,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  category    VARCHAR(40) DEFAULT 'engine',
  status      VARCHAR(20) DEFAULT 'shipped',   -- 'shipped' | 'approved'
  shipped_at  TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_platform_updates_time ON platform_updates(shipped_at DESC);

-- Seed the updates shipped so far (idempotent).
INSERT INTO platform_updates (slug, title, body, category, status, shipped_at) VALUES
 ('honest-confidence','Honest, evidence-based confidence','Match confidence now reflects real evidence — recent form and strength gap — instead of an artificial cap. Clear mismatches read high, toss-ups read low.','engine','shipped','2026-06-09 11:20:00+00'),
 ('recent-form','Predictions use recent qualifiers & friendlies','The World Cup model now blends each team''s last 10 results into the prediction, so teams are judged on the games leading up to the tournament.','engine','shipped','2026-06-09 12:00:00+00'),
 ('elo-learning','Engine learns from results','National-team strength now updates automatically from match results every 6 hours.','engine','shipped','2026-06-09 11:45:00+00'),
 ('rest-injuries','Fatigue & injuries factored in','Fixture congestion (rest days) and player injuries now adjust expected goals.','engine','shipped','2026-06-09 12:30:00+00'),
 ('player-importance','Injuries weighted by player importance','Losing a star scorer now hurts far more than losing a backup, using real player goal/minutes data.','engine','shipped','2026-06-09 12:55:00+00'),
 ('apf-second-opinion','API-Football second opinion','Predictions now blend API-Football''s own win-probability model as an independent second opinion.','engine','shipped','2026-06-09 13:10:00+00')
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- ENGINE CREDIBILITY MIGRATIONS (2026-06-10)
-- Everything below is idempotent — this file runs on every boot.
-- ═══════════════════════════════════════════════════════════════════

-- 90-minute (regular time) scores. fixtures.home_goals stays the FINAL
-- (display) score; ft_* hold the 90-minute score so 1X2 / O-U / BTTS
-- predictions are scored against the market they were made for.
-- Knockout matches decided in extra time were previously mis-scored.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS ft_home_goals INT;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS ft_away_goals INT;

-- Learned national-team Elo. Written by engine/nationalTeams.applyResult
-- since launch, but the table was never in the schema — every persist was
-- silently swallowed by .catch(). This makes Elo learning survive restarts.
CREATE TABLE IF NOT EXISTS national_elo (
  team_norm    TEXT PRIMARY KEY,
  team_name    TEXT,
  elo          FLOAT NOT NULL,
  played       INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Elo learning dedup — a finished match must shift ratings exactly ONCE.
-- (The 6-hourly learning cycle re-fetches a 7-day window, so without this
-- each result was re-applied ~28 times, massively over-weighting it.)
CREATE TABLE IF NOT EXISTS elo_processed_matches (
  match_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Key-value engine settings (learned WC market weight, etc.)
CREATE TABLE IF NOT EXISTS engine_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cached national-team recent form + injuries (refreshed by scheduler,
-- read by the fixtures feed and the prediction-lock job — no API calls
-- on the request path).
CREATE TABLE IF NOT EXISTS wc_team_form (
  team_id    TEXT PRIMARY KEY,        -- 'apf_t_<id>'
  team_name  TEXT,
  form       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The World Cup league row must exist for WC fixture upserts.
INSERT INTO leagues (code, name, country, source)
VALUES ('WC', 'FIFA World Cup', 'World', 'apisports')
ON CONFLICT (code) DO NOTHING;

-- The international-friendlies league row must exist so the prediction-lock
-- job can upsert FR fixture rows (locked friendlies are scored like WC ones).
INSERT INTO leagues (code, name, country, source)
VALUES ('FR', 'International Friendlies', 'World', 'apisports')
ON CONFLICT (code) DO NOTHING;

-- ─── Predictions integrity ──────────────────────────────────────────
-- 1) Dedupe: keep the NEWEST prediction per (fixture, model), delete the
--    rest (and their dependent rows) so each fixture is scored once.
DELETE FROM market_predictions WHERE prediction_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY fixture_id, model_version
                                  ORDER BY created_at DESC, id DESC) AS rn
    FROM predictions WHERE fixture_id IS NOT NULL
  ) d WHERE d.rn > 1
);
DELETE FROM model_performance WHERE prediction_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY fixture_id, model_version
                                  ORDER BY created_at DESC, id DESC) AS rn
    FROM predictions WHERE fixture_id IS NOT NULL
  ) d WHERE d.rn > 1
);
DELETE FROM predictions WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY fixture_id, model_version
                                  ORDER BY created_at DESC, id DESC) AS rn
    FROM predictions WHERE fixture_id IS NOT NULL
  ) d WHERE d.rn > 1
);
-- 2) Enforce: one prediction per fixture per model from now on.
--    (NULL fixture_id rows are unconstrained — Postgres treats NULLs as distinct.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_predictions_fixture_model
  ON predictions (fixture_id, model_version);

-- Market predictions: one row per (prediction, market). Dedupe then enforce.
DELETE FROM market_predictions WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY prediction_id, market_type
                                  ORDER BY id DESC) AS rn
    FROM market_predictions
  ) d WHERE d.rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_pred_market
  ON market_predictions (prediction_id, market_type);
