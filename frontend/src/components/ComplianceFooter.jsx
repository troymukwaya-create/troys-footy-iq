import React from 'react';

// Quiet compliance line at the foot of every app view. The landing page had
// the only 18+/not-advice copy on the site, while the pages actually showing
// odds had none — required before any affiliate conversation, and basic trust
// hygiene besides.
export function ComplianceFooter() {
  return (
    <footer style={{
      padding: '20px 16px calc(24px + env(safe-area-inset-bottom))',
      textAlign: 'center', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)',
    }}>
      Oddyessa is for the love of the game and the numbers behind it — we don’t take bets.
      <br />
      Everything here is information, not advice. 18+ · Please gamble responsibly ·{' '}
      <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>
        BeGambleAware.org
      </a>
    </footer>
  );
}
