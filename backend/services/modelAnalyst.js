// ─── MODEL ANALYST (Claude AI Integration) ─────────────────────────
// Uses Claude to analyze model performance patterns, identify weaknesses,
// and suggest improvements. This is the "intelligence" layer that makes
// the feedback loop interpretable for humans.
//
// Claude does NOT replace the model — it enhances understanding:
//   - Identifies patterns in prediction errors
//   - Explains why certain leagues/markets perform poorly
//   - Suggests adjustments (e.g., "draws underestimated in low-scoring leagues")
//   - Provides natural language summaries of model health

import axios from 'axios';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { getStoredAggregates } from '../engine/feedbackEngine.js';
import { getActiveVersion, listVersions } from '../engine/modelVersioning.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function hasValidKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.length > 20 && !key.startsWith('YOUR') && !key.includes('placeholder');
}

/**
 * Generate AI-powered insights about model performance.
 * Called weekly by the scheduler after feedback aggregates are computed.
 *
 * @returns {Object} { insights, suggestions, weaknesses, timestamp }
 */
export async function generateModelInsights() {
  if (!hasValidKey()) {
    console.log('[ANALYST] Claude not configured — skipping AI insights');
    return {
      insights: 'AI analysis unavailable (Claude API key not configured)',
      suggestions: [],
      timestamp: new Date().toISOString(),
    };
  }

  console.log('[ANALYST] Generating AI model insights...');

  try {
    // Gather data for analysis
    const [aggregates, activeVersion, recentPerformance, versions] = await Promise.all([
      getStoredAggregates(),
      getActiveVersion(),
      getRecentPerformanceMetrics(),
      listVersions(5),
    ]);

    const prompt = buildAnalysisPrompt({
      aggregates,
      activeVersion,
      recentPerformance,
      versions,
    });

    const response = await axios.post(ANTHROPIC_API_URL, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    });

    const analysis = response.data?.content?.[0]?.text || 'No analysis generated';

    // Parse structured insights from Claude's response
    const parsed = parseAnalysis(analysis);

    // Store insights in the database
    await storeInsights(parsed);

    console.log(`[ANALYST] Generated ${parsed.suggestions.length} suggestions`);
    return parsed;
  } catch (err) {
    console.error('[ANALYST] AI analysis failed:', err.message);
    return {
      insights: `Analysis failed: ${err.message}`,
      suggestions: [],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get the latest stored AI insights.
 */
export async function getLatestInsights() {
  if (!isDbAvailable()) return null;

  const result = await safeQuery(`
    SELECT details
    FROM model_runs
    WHERE run_type = 'ai_analysis'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return result?.rows?.[0]?.details || null;
}

// ─── Internal ───────────────────────────────────────────────────────

function buildAnalysisPrompt({ aggregates, activeVersion, recentPerformance, versions }) {
  const biasSection = aggregates.length > 0
    ? aggregates.map(a =>
        `- ${a.dimension}:${a.dimension_value} | Bias: ${(a.bias * 100).toFixed(1)}% | Sample: ${a.sample_size} | Brier: ${a.brier_score?.toFixed(4) || 'N/A'}`
      ).join('\n')
    : 'No feedback aggregates computed yet.';

  const perfSection = recentPerformance
    ? `Accuracy: ${recentPerformance.accuracy}%\nBrier Score: ${recentPerformance.avgBrier}\nLog Loss: ${recentPerformance.avgLogLoss}\nTotal Evaluated: ${recentPerformance.total}`
    : 'No performance data available yet.';

  const versionSection = versions.map(v =>
    `${v.version} (${v.is_active ? 'ACTIVE' : 'inactive'}) - Weights: ${JSON.stringify(v.weights)} - Metrics: ${JSON.stringify(v.metrics || {})}`
  ).join('\n');

  return `You are analyzing a football prediction model's performance. Provide actionable insights.

## Current Model: ${activeVersion.version}
Weights: ${JSON.stringify(activeVersion.weights)}

## Recent Performance
${perfSection}

## Feedback Aggregates (Bias Detection)
${biasSection}

## Model Version History
${versionSection}

## Instructions
Analyze the above data and provide:

1. **PATTERNS**: What patterns do you see in the prediction errors? Are there systematic biases?
2. **WEAKNESSES**: Which leagues, markets, or probability ranges perform worst? Why might this be?
3. **SUGGESTIONS**: Specific, actionable adjustments to improve the model. Be precise (e.g., "reduce draw probability by 3% for Serie A" rather than "improve draw prediction").
4. **WEIGHT RECOMMENDATIONS**: Should the ensemble weights be adjusted? In what direction?
5. **CALIBRATION**: Is the model overconfident or underconfident? At what probability ranges?
6. **PRIORITY**: Rank your suggestions by expected impact (highest first).

Be concise, data-driven, and specific. No generic advice.`;
}

function parseAnalysis(text) {
  // Extract structured sections from Claude's response
  const sections = {
    patterns: extractSection(text, 'PATTERNS', 'WEAKNESSES'),
    weaknesses: extractSection(text, 'WEAKNESSES', 'SUGGESTIONS'),
    suggestions: extractSection(text, 'SUGGESTIONS', 'WEIGHT'),
    weightRecommendations: extractSection(text, 'WEIGHT', 'CALIBRATION'),
    calibration: extractSection(text, 'CALIBRATION', 'PRIORITY'),
    priority: extractSection(text, 'PRIORITY', null),
  };

  // Extract bullet-point suggestions
  const suggestionLines = (sections.suggestions || '').split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().match(/^\d+\./))
    .map(line => line.trim().replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, ''));

  return {
    insights: text,
    patterns: sections.patterns,
    weaknesses: sections.weaknesses,
    suggestions: suggestionLines,
    weightRecommendations: sections.weightRecommendations,
    calibration: sections.calibration,
    timestamp: new Date().toISOString(),
  };
}

function extractSection(text, startMarker, endMarker) {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return '';

  const afterStart = text.substring(startIdx + startMarker.length);
  if (endMarker) {
    const endIdx = afterStart.indexOf(endMarker);
    return endIdx > -1 ? afterStart.substring(0, endIdx).trim() : afterStart.trim();
  }
  return afterStart.trim();
}

async function getRecentPerformanceMetrics() {
  if (!isDbAvailable()) return null;

  const result = await safeQuery(`
    SELECT
      COUNT(*)::int as total,
      ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
      ROUND(AVG(brier_score)::numeric, 4) as avg_brier,
      ROUND(AVG(log_loss)::numeric, 4) as avg_log_loss
    FROM model_performance
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);

  const row = result?.rows?.[0];
  if (!row || parseInt(row.total) === 0) return null;

  return {
    total: parseInt(row.total),
    accuracy: parseFloat(row.accuracy),
    avgBrier: parseFloat(row.avg_brier),
    avgLogLoss: parseFloat(row.avg_log_loss),
  };
}

async function storeInsights(parsed) {
  if (!isDbAvailable()) return;

  await safeQuery(
    `INSERT INTO model_runs (model_version, run_type, details)
     VALUES ((SELECT version FROM model_versions WHERE is_active = true LIMIT 1), 'ai_analysis', $1)`,
    [JSON.stringify(parsed)]
  );
}

export default {
  generateModelInsights,
  getLatestInsights,
};
