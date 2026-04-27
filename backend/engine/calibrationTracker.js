// ─── CALIBRATION & MONITORING TRACKER ───────────────────────────────
// Tracks model performance over time. Stores evaluation snapshots
// and detects drift in prediction quality.

const MAX_HISTORY = 100; // Keep last 100 evaluation runs

class CalibrationTracker {
  constructor() {
    this.history = [];
    this.lastEvaluation = null;
    this.alerts = [];
    this.startedAt = Date.now();
  }

  /**
   * Record a new evaluation result.
   */
  record(evaluation) {
    const snapshot = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      matches: evaluation.summary?.totalMatches || 0,
      accuracy: evaluation.summary?.accuracy || 0,
      brierScore: evaluation.summary?.avgBrierScore || 0,
      logLoss: evaluation.summary?.avgLogLoss || 0,
      rps: evaluation.summary?.avgRPS || 0,
      ece: evaluation.summary?.expectedCalibrationError || 0,
      exactScoreAcc: evaluation.summary?.exactScoreAccuracy || 0,
      brierImprovement: evaluation.summary?.brierImprovement || 0,
      model: evaluation.model || 'unknown',
    };

    this.history.push(snapshot);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }

    this.lastEvaluation = evaluation;

    // Check for drift alerts
    this._checkDrift(snapshot);

    return snapshot;
  }

  /**
   * Check for performance drift — alert if quality degrades.
   */
  _checkDrift(current) {
    if (this.history.length < 3) return;

    const recent = this.history.slice(-5);
    const avgBrier = recent.reduce((s, r) => s + r.brierScore, 0) / recent.length;

    // Alert if Brier score degrades above random baseline threshold
    if (avgBrier > 0.20) {
      this.alerts.push({
        type: 'BRIER_DEGRADATION',
        severity: 'WARNING',
        message: `Average Brier score (${avgBrier.toFixed(4)}) approaching random baseline (0.222)`,
        timestamp: new Date().toISOString(),
      });
    }

    // Alert if accuracy drops below baseline
    if (current.accuracy < 35) {
      this.alerts.push({
        type: 'ACCURACY_DROP',
        severity: 'CRITICAL',
        message: `Accuracy (${current.accuracy}%) below acceptable threshold (35%)`,
        timestamp: new Date().toISOString(),
      });
    }

    // Alert if calibration error is too high
    if (current.ece > 0.15) {
      this.alerts.push({
        type: 'CALIBRATION_DRIFT',
        severity: 'WARNING',
        message: `ECE (${current.ece.toFixed(4)}) indicates poor calibration`,
        timestamp: new Date().toISOString(),
      });
    }

    // Trim alerts to last 50
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
  }

  /**
   * Get the full monitoring dashboard data.
   */
  getDashboard() {
    const latest = this.history[this.history.length - 1] || null;
    const trend = this.history.length >= 2
      ? this.history.slice(-10).map(h => ({
          date: h.date,
          accuracy: h.accuracy,
          brier: h.brierScore,
        }))
      : [];

    return {
      status: latest ? 'active' : 'no_data',
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
      totalEvaluations: this.history.length,
      latest,
      trend,
      alerts: this.alerts.slice(-10),
      lastEvaluation: this.lastEvaluation ? {
        summary: this.lastEvaluation.summary,
        outcomeDistribution: this.lastEvaluation.outcomeDistribution,
        accuracyByOutcome: this.lastEvaluation.accuracyByOutcome,
        accuracyByRisk: this.lastEvaluation.accuracyByRisk,
        accuracyByLeague: this.lastEvaluation.accuracyByLeague,
        calibration: this.lastEvaluation.calibration,
        teamStatsUsed: this.lastEvaluation.teamStatsUsed,
      } : null,
    };
  }

  /**
   * Get a concise health check.
   */
  getHealth() {
    const latest = this.history[this.history.length - 1];
    if (!latest) return { status: 'no_evaluations', healthy: false };

    const healthy = latest.brierScore < 0.20 && latest.accuracy > 35 && latest.ece < 0.15;
    return {
      status: healthy ? 'healthy' : 'degraded',
      healthy,
      lastAccuracy: latest.accuracy,
      lastBrier: latest.brierScore,
      lastECE: latest.ece,
      alertCount: this.alerts.length,
      evaluationAge: Math.round((Date.now() - latest.timestamp) / 1000),
    };
  }
}

// Singleton instance
const tracker = new CalibrationTracker();
export default tracker;
