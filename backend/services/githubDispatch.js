// ─── GITHUB WORKFLOW DISPATCH ───────────────────────────────────────
// Fires a GitHub Actions workflow via the REST API. Used by the social
// "heartbeat" cron (jobs/scheduler.js) and the admin Mission-Control button
// (routes/adminOps.js) so there is ONE definition of the call.
//
// Why a backend heartbeat at all: GitHub heavily throttles scheduled (`cron`)
// workflows — the social-matchday `*/5` schedule actually fires every few
// HOURS, so pre-match cards miss their T-3h window and receipts land late.
// The Render backend's node-cron runs reliably 24/7, so it drives the real
// 5-minute tick by dispatching the workflow itself.
//
// Auth: GITHUB_TOKEN in the backend env (a fine-grained PAT with
// Actions: read & write on this repo). Absent → every call is a safe no-op.

const REPO = process.env.SOCIAL_REPO || 'troymukwaya-create/troys-footy-iq';
export const ALLOWED_WORKFLOWS = new Set(['social-matchday.yml', 'social-ledger.yml', 'social-picks.yml']);

/** Whether a GitHub token is configured (so callers can no-op cleanly). */
export function hasGithubToken() { return !!process.env.GITHUB_TOKEN; }

/**
 * Dispatch a workflow on the given ref.
 * @returns {Promise<{ok:boolean, status:number, message:string}>}
 */
export async function dispatchWorkflow(workflow, inputs = {}, ref = 'main') {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, status: 0, message: 'GITHUB_TOKEN not set' };
  if (!ALLOWED_WORKFLOWS.has(workflow)) return { ok: false, status: 0, message: `unknown workflow: ${workflow}` };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'oddyessa-backend',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs }),
    });
    if (r.status === 204) return { ok: true, status: 204, message: 'dispatched' };
    const body = await r.text();
    return { ok: false, status: r.status, message: `github ${r.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, status: 0, message: err.message };
  }
}

export default { dispatchWorkflow, hasGithubToken, ALLOWED_WORKFLOWS, REPO };
