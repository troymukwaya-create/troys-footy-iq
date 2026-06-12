// ─── TRANSFER SHEET ──────────────────────────────────────────────────
// The answer to "how do I get this parlay OUT of Oddyessa?" — one sheet,
// three exits, every one of them carrying the actual picks:
//   1. Share / copy — slip text with legs FIRST and a link that reloads
//      the exact slip for whoever opens it (the viral loop).
//   2. Receipt PNG — the brand's thermal-receipt card with a QR back to
//      the slip; made for WhatsApp groups and IG stories.
//   3. Bookmaker hand-off — the slip rewritten in YOUR book's own market
//      names + a button to open it. Honest that auto-fill needs an
//      official partnership; when one lands, this same button becomes
//      the deep link.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share2, Copy, ImageDown, ExternalLink, Check, Link2, Ticket } from 'lucide-react';
import { getShareUrl, buildSlipText } from '../lib/slipCodec.js';
import { BOOKMAKERS, getPreferredBookmaker, setPreferredBookmaker, formatForBookmaker } from '../lib/bookmakers.js';
import { renderSlipReceipt } from '../lib/slipReceipt.js';
import { track } from '../lib/analytics.js';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function TransferSheet({ open, onClose, legs, totals }) {
  const [share, setShare] = useState(null);        // { url, code, kind }
  const [receipt, setReceipt] = useState(null);    // { blob, dataUrl }
  const [copied, setCopied] = useState(null);      // 'slip' | 'link' | 'book'
  const [book, setBook] = useState(() => getPreferredBookmaker());
  const flashTimer = useRef(null);

  const flash = (which) => {
    setCopied(which);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setCopied(null), 1800);
  };

  // Build the share link + receipt when the sheet opens.
  useEffect(() => {
    if (!open || !legs?.length) return;
    let cancelled = false;
    setShare(null);
    setReceipt(null);
    (async () => {
      let visitor = null;
      try { visitor = localStorage.getItem('fiq_visitor'); } catch { /* private mode */ }
      const s = await getShareUrl(legs, { evPct: totals?.expectedValuePct ?? null, visitor });
      if (cancelled) return;
      setShare(s);
      track('slip_link_created', { legs: legs.length, kind: s?.kind || 'none' });
      try {
        const r = await renderSlipReceipt(legs, totals, s?.url || 'https://oddyessa.com');
        if (!cancelled) setReceipt(r);
      } catch { /* canvas/fonts blocked — sheet still works without the image */ }
    })();
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !legs?.length) return null;

  const slipText = buildSlipText(legs, totals, share?.url);

  const handleShare = async () => {
    track('slip_shared', { legs: legs.length, method: 'native' });
    // Best case: share the receipt image + the text together.
    if (receipt?.blob && navigator.canShare) {
      const file = new File([receipt.blob], 'oddyessa-slip.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: slipText, title: 'My Oddyessa slip' }); return; } catch { /* dismissed or unsupported combo */ }
      }
    }
    if (navigator.share) {
      // text only, deliberately no url field — some targets keep ONLY the
      // url and drop the picks, which is the bug this sheet exists to fix.
      try { await navigator.share({ title: 'My Oddyessa slip', text: slipText }); return; } catch { /* dismissed */ }
    }
    if (await copyText(slipText)) flash('slip');
  };

  const handleCopySlip = async () => {
    if (await copyText(slipText)) { flash('slip'); track('slip_shared', { legs: legs.length, method: 'copy' }); }
  };

  const handleCopyLink = async () => {
    if (share?.url && await copyText(share.url)) { flash('link'); track('slip_shared', { legs: legs.length, method: 'link' }); }
  };

  const handleSaveImage = () => {
    if (!receipt?.dataUrl) return;
    const a = document.createElement('a');
    a.href = receipt.dataUrl;
    a.download = `oddyessa-slip${share?.code ? '-' + share.code : ''}.png`;
    a.click();
    track('slip_shared', { legs: legs.length, method: 'image' });
  };

  const selectBook = (b) => {
    setBook(b);
    setPreferredBookmaker(b.id);
    track('slip_bookie_selected', { bookie: b.id });
  };

  const handleCopyForBook = async () => {
    if (await copyText(formatForBookmaker(legs, totals, book))) {
      flash('book');
      track('slip_shared', { legs: legs.length, method: 'bookie_copy', bookie: book?.id });
    }
  };

  const handleOpenBook = () => {
    if (!book?.url) return;
    track('slip_bookie_opened', { bookie: book.id, legs: legs.length, odds: totals?.combinedOdds });
    window.open(book.url, '_blank', 'noopener,noreferrer');
  };

  const btn = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '10px 4px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
  };

  // Portal to <body>: the sheet is opened from deep inside the right panel,
  // where ancestor stacking contexts (motion opacity/will-change) would trap
  // a fixed overlay underneath unrelated page content.
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="ts-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="ts-overlay"
        style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(8,8,10,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <motion.div
          initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={e => e.stopPropagation()}
          className="ts-panel"
          style={{ width: '100%', maxWidth: 430, maxHeight: '88vh', overflowY: 'auto', background: 'linear-gradient(160deg,#14161B,#0B0B0D)', border: '1px solid var(--border-subtle)', borderRadius: 22, padding: '20px 20px 16px' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Ticket size={16} style={{ color: 'var(--accent)' }} /> Transfer slip
            </h2>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 14px', lineHeight: 1.5 }}>
            {legs.length} leg{legs.length > 1 ? 's' : ''}{totals?.combinedOdds ? ` @ ${totals.combinedOdds.toFixed(2)}×` : ''} — send it to a friend or take it to your bookmaker.
          </p>

          {/* Receipt preview */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            {receipt ? (
              <motion.img
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                src={receipt.dataUrl} alt="Slip receipt"
                style={{ width: 210, borderRadius: 8, transform: 'rotate(-1.2deg)', boxShadow: '0 18px 40px rgba(0,0,0,0.5)' }}
              />
            ) : (
              <div style={{ width: 210, height: 270, borderRadius: 8, background: 'var(--bg-raised)', border: '1px dashed var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                printing receipt…
              </div>
            )}
          </div>

          {/* Primary actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button onClick={handleShare} style={{ ...btn, background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }}>
              <Share2 size={15} /> Share
            </button>
            <button onClick={handleCopySlip} style={btn}>
              {copied === 'slip' ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
              {copied === 'slip' ? 'Copied' : 'Copy slip'}
            </button>
            <button onClick={handleSaveImage} disabled={!receipt} style={{ ...btn, opacity: receipt ? 1 : 0.5 }}>
              <ImageDown size={15} /> Save image
            </button>
          </div>

          {/* Share link row */}
          <button
            onClick={handleCopyLink}
            disabled={!share?.url}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', cursor: share?.url ? 'pointer' : 'default' }}
          >
            <Link2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {share?.url ? share.url.replace(/^https?:\/\//, '') : 'creating your slip link…'}
            </span>
            {copied === 'link'
              ? <Check size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
              : <Copy size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
          </button>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '6px 2px 0', lineHeight: 1.5 }}>
            Anyone who opens this link gets your exact slip loaded — picks, odds and our read on each leg.
          </p>

          {/* Bookmaker hand-off */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>PLACE IT WHERE YOU PLAY</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {BOOKMAKERS.map(b => (
              <button
                key={b.id}
                onClick={() => selectBook(b)}
                style={{
                  padding: '8px 6px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  background: book?.id === b.id ? 'var(--accent-muted)' : 'var(--bg-raised)',
                  border: `1px solid ${book?.id === b.id ? 'rgba(168,52,74,0.45)' : 'var(--border-subtle)'}`,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: book?.id === b.id ? 'var(--accent)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                {b.region && <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginTop: 1 }}>{b.region}</div>}
              </button>
            ))}
          </div>

          {book && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10 }}>
              <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', fontSize: 10.5, lineHeight: 1.55, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: 170, overflowY: 'auto' }}>
                {formatForBookmaker(legs, totals, book)}
              </pre>
              <div style={{ display: 'grid', gridTemplateColumns: book.url ? '1fr 1fr' : '1fr', gap: 8, marginTop: 8 }}>
                <button onClick={handleCopyForBook} style={{ ...btn, flexDirection: 'row', padding: '10px 8px' }}>
                  {copied === 'book' ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                  {copied === 'book' ? 'Copied' : `Copy for ${book.id === 'other' ? 'your book' : book.name}`}
                </button>
                {book.url && (
                  <button onClick={handleOpenBook} style={{ ...btn, flexDirection: 'row', padding: '10px 8px', background: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid rgba(168,52,74,0.3)' }}>
                    <ExternalLink size={13} /> Open {book.name}
                  </button>
                )}
              </div>
              {book.bookingCodes && (
                <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '8px 2px 0', lineHeight: 1.5 }}>
                  Tip: rebuild it once at {book.name}, then share their <strong style={{ color: 'var(--text-secondary)' }}>booking code</strong> back to your group — friends load it in one tap.
                </p>
              )}
            </motion.div>
          )}

          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '14px 2px 0', lineHeight: 1.55 }}>
            Straight answer: no bookmaker accepts an outside slip directly — auto-fill needs an official partnership, and we'll add one-tap transfer the day we sign one. Until then this sheet makes the rebuild ~30 seconds. We don't take bets. 18+, bet responsibly.
          </p>
        </motion.div>

        <style>{`
          @media (max-width: 640px) {
            .ts-overlay { align-items: flex-end !important; padding: 0 !important; }
            .ts-panel { max-width: 100% !important; border-radius: 22px 22px 0 0 !important; max-height: 92dvh !important; }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default TransferSheet;
