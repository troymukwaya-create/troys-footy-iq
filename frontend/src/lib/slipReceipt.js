// ─── SLIP RECEIPT (canvas → PNG) ─────────────────────────────────────
// Renders a slip as the brand's thermal-receipt card: cream paper, mono
// type, torn edges, oxblood accent, QR back to the live slip link. This
// is the share object for WhatsApp groups and IG stories — a screenshot
// that carries the picks AND a scannable way back to oddyessa.com.
// Same visual family as the Morning Ledger receipts.

import QRCode from 'qrcode';

const PAPER = '#F5F0E6';
const INK = '#17171B';
const INK_MUTED = '#6E6A61';
const ACCENT = '#A8344A';
const GREEN = '#15803D';

const W = 1080;            // canvas width
const PAD_X = 84;          // paper side inset on canvas
const PX = 64;             // text inset inside the paper
const TEAR = 14;           // zigzag amplitude

function tearPath(ctx, left, right, top, bottom) {
  const step = 26;
  ctx.beginPath();
  ctx.moveTo(left, top + TEAR);
  for (let x = left, up = true; x < right; x += step, up = !up) {
    ctx.lineTo(Math.min(x + step / 2, right), up ? top : top + TEAR);
    ctx.lineTo(Math.min(x + step, right), top + TEAR);
  }
  ctx.lineTo(right, bottom - TEAR);
  for (let x = right, up = true; x > left; x -= step, up = !up) {
    ctx.lineTo(Math.max(x - step / 2, left), up ? bottom : bottom - TEAR);
    ctx.lineTo(Math.max(x - step, left), bottom - TEAR);
  }
  ctx.closePath();
}

function dashedRule(ctx, x1, x2, y) {
  ctx.save();
  ctx.strokeStyle = INK_MUTED;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function dottedLeader(ctx, x1, x2, y) {
  ctx.save();
  ctx.fillStyle = INK_MUTED;
  for (let x = x1; x < x2; x += 14) ctx.fillRect(x, y - 2, 3, 3);
  ctx.restore();
}

const mono = (weight, size) => `${weight} ${size}px "IBM Plex Mono", ui-monospace, monospace`;

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

export async function renderSlipReceipt(legs, totals, url) {
  try { await document.fonts.load(mono(600, 40)); await document.fonts.load(mono(500, 30)); } catch { /* fall back to system mono */ }

  const hasModel = totals?.modelImpliedPct != null;
  const legBlock = 118;
  const headerH = 250;
  const metaH = 78;
  const totalsH = hasModel ? 220 : 170;
  const qrSize = url ? 232 : 0;
  const footerH = (url ? qrSize + 70 : 40) + 96;
  const paperH = headerH + metaH + legs.length * legBlock + totalsH + footerH;
  const H = paperH + 120;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Backdrop — the brand's near-black, so the receipt pops in any feed.
  ctx.fillStyle = '#0B0B0D';
  ctx.fillRect(0, 0, W, H);

  // Paper with torn top/bottom + soft shadow.
  const pL = PAD_X, pR = W - PAD_X, pT = 60, pB = 60 + paperH;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  tearPath(ctx, pL, pR, pT, pB);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();

  const xL = pL + PX, xR = pR - PX;
  let y = pT + 100;

  // ─── Header: wordmark + tagline ───
  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(600, 52);
  const zeroW = ctx.measureText('0 ').width;
  ctx.fillStyle = ACCENT;
  ctx.fillText('0', xL, y);
  ctx.fillStyle = INK;
  ctx.fillText('ODDYESSA', xL + zeroW, y);
  ctx.font = mono(500, 26);
  ctx.fillStyle = INK_MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('READ THE GAME.', xR, y);
  ctx.textAlign = 'left';
  y += 44;
  dashedRule(ctx, xL, xR, y);
  y += 58;

  // ─── Meta row ───
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  ctx.font = mono(500, 26);
  ctx.fillStyle = INK_MUTED;
  ctx.fillText(dateStr, xL, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = mono(600, 26);
  ctx.fillText(`${legs.length}-LEG SLIP`, xR, y);
  ctx.textAlign = 'left';
  y += metaH - 24;

  // ─── Legs ───
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    ctx.font = mono(600, 30);
    ctx.fillStyle = INK;
    const idx = `${i + 1}.`;
    ctx.fillText(idx, xL, y);
    ctx.fillText(truncate(ctx, String(l.matchLabel || '').toUpperCase(), xR - xL - 70), xL + 54, y);
    y += 44;

    const oddsTxt = Number(l.odds).toFixed(2);
    ctx.font = mono(600, 32);
    const oddsW = ctx.measureText(oddsTxt).width;
    ctx.font = mono(500, 28);
    ctx.fillStyle = ACCENT;
    const pick = truncate(ctx, l.outcome, xR - xL - oddsW - 200);
    ctx.fillText(pick, xL + 54, y);
    const pickW = ctx.measureText(pick).width;
    dottedLeader(ctx, xL + 54 + pickW + 18, xR - oddsW - 18, y - 8);
    ctx.font = mono(600, 32);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(oddsTxt, xR, y);
    ctx.textAlign = 'left';
    y += legBlock - 44;
  }

  dashedRule(ctx, xL, xR, y - 18);
  y += 48;

  // ─── Totals ───
  ctx.font = mono(600, 34);
  ctx.fillStyle = INK;
  ctx.fillText('COMBINED', xL, y);
  ctx.textAlign = 'right';
  ctx.font = mono(600, 52);
  ctx.fillStyle = ACCENT;
  ctx.fillText(`${totals?.combinedOdds ? totals.combinedOdds.toFixed(2) : '—'}×`, xR, y + 4);
  ctx.textAlign = 'left';
  y += 64;

  if (hasModel) {
    ctx.font = mono(500, 26);
    ctx.fillStyle = INK_MUTED;
    ctx.fillText(`MODEL ${totals.modelImpliedPct.toFixed(1)}% · MARKET ${totals.marketImpliedPct.toFixed(1)}%`, xL, y);
    if (totals.expectedValuePct != null) {
      const pos = totals.expectedValuePct > 0;
      ctx.textAlign = 'right';
      ctx.fillStyle = pos ? GREEN : INK_MUTED;
      ctx.font = mono(600, 26);
      ctx.fillText(`${pos ? '+' : ''}${totals.expectedValuePct.toFixed(0)}% EDGE`, xR, y);
      ctx.textAlign = 'left';
    }
    y += 50;
  }

  dashedRule(ctx, xL, xR, y);
  y += 52;

  // ─── Footer: QR + link ───
  if (url) {
    const qrData = await QRCode.toDataURL(url, {
      margin: 0, width: qrSize, color: { dark: INK, light: PAPER },
    });
    const qrImg = new Image();
    await new Promise((resolve, reject) => { qrImg.onload = resolve; qrImg.onerror = reject; qrImg.src = qrData; });
    ctx.drawImage(qrImg, xL, y - 28, qrSize, qrSize);

    const tx = xL + qrSize + 44;
    let ty = y + 30;
    ctx.font = mono(600, 28);
    ctx.fillStyle = INK;
    ctx.fillText('SCAN TO LOAD', tx, ty);
    ctx.fillText('THIS SLIP', tx, ty + 38);
    ty += 92;
    ctx.font = mono(500, 22);
    ctx.fillStyle = INK_MUTED;
    const shortUrl = url.replace(/^https?:\/\//, '').replace(/#.*$/, m => (m.length > 18 ? '#…' : m));
    ctx.fillText(truncate(ctx, shortUrl, xR - tx), tx, ty);
    y += qrSize + 28;
  }

  ctx.font = mono(500, 21);
  ctx.fillStyle = INK_MUTED;
  ctx.fillText('DATA, NOT BETTING ADVICE · 18+ · WE PUBLISH OUR ERROR RATE', xL, y);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { blob, dataUrl, width: W, height: H };
}
