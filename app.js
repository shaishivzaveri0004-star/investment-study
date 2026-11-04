(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Settings. ENDPOINT is the only one you must change before launch.
     ------------------------------------------------------------------ */
  const CONFIG = {
    ENDPOINT: 'https://script.google.com/macros/s/AKfycbzy73umtlvqMXE_c2VPM9P0xO7eoREaaQyUztq6RR0dNqXvMKs-RfK79EdErLrTz6tr/exec',                 // Paste the NEW Google Apps Script web app URL here (see README)
    ERROR_ROUNDS: [2, 3, 4],      // error month drawn at random from these, per participant
    REQUIRED_ROUNDS: 7,           // months everyone plays; data and survey are sent after these
    MAX_ROUNDS: 25,               // optional bonus months go up to this
    ATTENTION_AFTER_ROUND: 5,     // quick reading check after this month (keep it after the last error month)
    DECIDE_SECONDS: 20,           // soft timer for the first decision
    SWITCH_SECONDS: 10,           // soft timer for keep or switch
    THINK_MS: 1400,               // "Kosha is analyzing" delay
    PRIZE_TEXT: '',               // e.g. 'Top 3 account values after month 7 win a small prize.'
    CONTACT_TEXT: '',             // e.g. 'Questions? Contact Group 4, Behavioral Finance.'
    DONE_KEY: 'trade_taranga_done_v2',
    VERSION: '2.2'
  };

  const SET = STUDY.setup;
  const CO = STUDY.company;
  const ROUNDS = STUDY.rounds;
  const AI_NAME = 'Kosha';
  const LABEL = { BUY: 'Buy', SELL: 'Sell', HOLD: 'Hold' };
  const ACTIONS = ['BUY', 'SELL', 'HOLD'];

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  const app = document.getElementById('app');
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const now = () => performance.now();

  function rand() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  function rid(n) { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(rand() * c.length)]; return s; }
  function inr(n, dec) {
    const v = dec ? Math.round(n * 10) / 10 : Math.round(n);
    const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec ? 1 : 0, maximumFractionDigits: dec ? 1 : 0 });
    return (v < 0 ? '−' : '') + '₹' + s;
  }
  function signedInr(n) { const v = Math.round(n); return (v > 0 ? '+' : '') + inr(v); }
  function pct(x, d) { const dd = d === undefined ? 1 : d; const s = x > 0 ? '+' : x < 0 ? '−' : ''; return s + Math.abs(x).toFixed(dd) + '%'; }
  function cls(x) { return x >= 0 ? 'up' : 'down'; }
  function bindGroup(sel, cb) {
    const btns = $$(sel);
    btns.forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      btns.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      cb(b.dataset.v);
    }));
  }
  function scale(name, n, from) {
    let o = '';
    for (let i = 0; i < n; i++) o += `<button type="button" class="pill num" data-g="${name}" data-v="${(from || 1) + i}" aria-pressed="false">${(from || 1) + i}</button>`;
    return o;
  }
  function render(html) {
    stopTimer();
    redrawCharts = null;
    app.innerHTML = html;
    window.scrollTo(0, 0);
    const h = app.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    syncDock();
  }
  function syncDock() {
    const d = $('.dock');
    const h = d && getComputedStyle(d).position === 'fixed' ? d.offsetHeight : 0;
    document.documentElement.style.setProperty('--dock-h', h + 'px');
  }
  window.addEventListener('resize', () => { syncDock(); if (redrawCharts) redrawCharts(); });
  let redrawCharts = null;

  const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 20c4 0 4-6 8.5-6S16 22 20.5 22 25 12 29 12" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M3 26c4 0 4-3 8.5-3S16 26 20.5 26 25 21 29 21" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/></svg>';

  /* ------------------------------------------------------------------
     Assignment and state
     ------------------------------------------------------------------ */
  const params = new URLSearchParams(location.search);
  const uG = (params.get('g') || '').toLowerCase();
  const uE = Number(params.get('e'));
  const gFromUrl = ['error', 'control'].includes(uG);
  const eFromUrl = CONFIG.ERROR_ROUNDS.includes(uE);

  const S = {
    pid: 'P-' + rid(6),
    group: gFromUrl ? uG : (rand() < 0.5 ? 'error' : 'control'),
    k: eFromUrl ? uE : CONFIG.ERROR_ROUNDS[Math.floor(rand() * CONFIG.ERROR_ROUNDS.length)],
    assignedBy: (gFromUrl ? 'url' : 'random') + '/' + (eFromUrl ? 'url' : 'random'),
    test: params.get('test') === '1',
    repeatFlag: false,
    startedAt: '', finishedAt: '', tStart: 0, totalMs: 0,
    compAttempts: 0, aiTrustBefore: null, attention: null, survey: {},
    idx: 0, price: SET.price, shares: SET.shares, cash: SET.cash,
    acct: [SET.price * SET.shares + SET.cash],
    rounds: [], rec: { n: 0, hits: 0, miss: 0 },
    requiredEndValue: null, mainStatus: '', bonusFails: 0
  };
  const START_VALUE = S.acct[0];

  ROUNDS.forEach((r) => {
    if (CONFIG.ERROR_ROUNDS.includes(r.round) && !r.wrong) console.error(`Round ${r.round} can be the error round but has no wrong advice.`);
  });

  function adviceFor(r) {
    if (S.group === 'error' && r.round === S.k && r.wrong) return Object.assign({}, r.wrong);
    return Object.assign({}, r.ai);
  }
  function value() { return S.shares * S.price + S.cash; }
  function canDo(a) {
    if (a === 'BUY') return S.cash >= SET.lot * S.price * (1 + SET.fee);
    if (a === 'SELL') return S.shares >= SET.lot;
    return true;
  }
  function tradeCost() { return SET.lot * S.price; }

  /* ------------------------------------------------------------------
     Timer (soft: shows pace, never decides for the player)
     ------------------------------------------------------------------ */
  let timer = null;
  function startTimer(seconds) {
    stopTimer();
    const el = $('.timer'); if (!el) return;
    const bar = el.querySelector('.bar'), txt = el.querySelector('b');
    const C = 2 * Math.PI * 18;
    bar.style.strokeDasharray = C;
    el.classList.remove('idle', 'warn', 'over');
    const t0 = now();
    const tick = () => {
      const left = seconds - (now() - t0) / 1000;
      if (left > 0) {
        bar.style.strokeDashoffset = C * (1 - left / seconds);
        txt.textContent = Math.ceil(left);
        el.classList.toggle('warn', left <= 5);
      } else {
        bar.style.strokeDashoffset = 0;
        el.classList.remove('warn'); el.classList.add('over');
        txt.textContent = '+' + Math.floor(-left);
      }
    };
    tick();
    timer = { id: setInterval(tick, 200), t0, seconds };
  }
  function stopTimer() {
    if (!timer) return null;
    clearInterval(timer.id);
    const ms = Math.round(now() - timer.t0);
    const over = Math.max(0, ms - timer.seconds * 1000);
    timer = null;
    const el = $('.timer'); if (el) el.classList.add('idle');
    return { ms, over };
  }

  /* ------------------------------------------------------------------
     Charts (plain SVG)
     ------------------------------------------------------------------ */
  function seriesUpTo(completed) {
    const pts = [];
    STUDY.historyMonths.forEach((m, i) => m.forEach((p, j) => { if (!(j === 0 && i > 0)) pts.push([-3 + i + j / (m.length - 1), p]); }));
    for (let r = 1; r <= completed; r++) {
      const path = ROUNDS[r - 1].path;
      path.forEach((p, j) => { if (j > 0) pts.push([r - 1 + j / (path.length - 1), p]); });
    }
    return pts;
  }
  function drawPriceChart(el, opt) {
    if (!el) return;
    const W = Math.max(280, el.clientWidth || 340), H = W < 420 ? 170 : 230;
    const padL = 6, padR = 46, padT = 12, padB = 22;
    const completed = opt.completed;
    const pts = seriesUpTo(completed);
    const xEnd = completed + 1, xStart = Math.max(-3, xEnd - 11);
    const vis = pts.filter((p) => p[0] >= xStart - 0.05);
    const fcs = [];
    S.rounds.forEach((r) => {
      if (r.round > completed) return;
      const pb = ROUNDS[r.round - 1].priceBefore;
      fcs.push({ x0: r.round - 1, y0: pb, x1: r.round, y1: pb * (1 + r.ai_pred_pct / 100), miss: !r.ai_correct });
    });
    let live = null;
    if (opt.live) live = { x0: completed, y0: S.price, x1: completed + 1, y1: S.price * (1 + opt.live.pred / 100) };
    const ys = vis.map((p) => p[1]).concat(fcs.filter((f) => f.x1 >= xStart).map((f) => f.y1));
    if (live) ys.push(live.y1);
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    const pad = (hi - lo) * 0.12 + 2; lo -= pad; hi += pad;
    const X = (x) => padL + (x - xStart) / (xEnd - xStart) * (W - padL - padR);
    const Y = (y) => padT + (hi - y) / (hi - lo) * (H - padT - padB);
    const up = S.price >= SET.price;
    const tone = up ? 'up' : 'down';
    let g = '';
    for (let i = 0; i <= 3; i++) {
      const v = lo + (hi - lo) * i / 3, y = Y(v);
      g += `<line class="grid" x1="${padL}" x2="${W - padR + 4}" y1="${y}" y2="${y}"/><text class="axis-t" x="${W - padR + 8}" y="${y + 3.5}">${Math.round(v)}</text>`;
    }
    const step = (xEnd - xStart) > 8 ? 2 : 1;
    for (let m = Math.ceil(xStart); m <= xEnd; m++) {
      if (m < 0 || (m % step && m !== xEnd)) continue;
      g += `<text class="axis-t" x="${X(m)}" y="${H - 6}" text-anchor="middle">${m === 0 ? 'Start' : 'M' + m}</text>`;
    }
    const nx = X(completed);
    g += `<line class="now" x1="${nx}" x2="${nx}" y1="${padT}" y2="${H - padB}"/>`;
    const animFrom = opt.animate ? completed - 1 : null;
    const base = vis.filter((p) => animFrom === null || p[0] <= animFrom + 1e-9);
    const anim = animFrom === null ? [] : vis.filter((p) => p[0] >= animFrom - 1e-9);
    const toPath = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const all = toPath(vis);
    const area = all + ` L ${X(vis[vis.length - 1][0]).toFixed(1)} ${H - padB} L ${X(vis[0][0]).toFixed(1)} ${H - padB} Z`;
    g += `<path d="${area}" class="area ${tone}" fill-opacity=".09" stroke="none"/>`;
    g += `<path d="${toPath(base)}" class="price ${tone}" fill="none" stroke-width="2" stroke-linejoin="round"/>`;
    if (anim.length > 1) g += `<path d="${toPath(anim)}" class="price ${tone} draw" id="animseg" fill="none" stroke-width="2.4" stroke-linejoin="round"/>`;
    fcs.filter((f) => f.x1 >= xStart).forEach((f) => {
      g += `<path class="fc" d="M${X(f.x0)} ${Y(f.y0)} L${X(f.x1)} ${Y(f.y1)}" stroke-opacity=".45"/>`;
      g += f.miss ? `<circle class="fc-miss" cx="${X(f.x1)}" cy="${Y(f.y1)}" r="4.5"/>` : `<circle class="fc-dot" cx="${X(f.x1)}" cy="${Y(f.y1)}" r="4"/>`;
    });
    if (live) {
      g += `<path class="fc" d="M${X(live.x0)} ${Y(live.y0)} L${X(live.x1)} ${Y(live.y1)}"/>`;
      g += `<circle class="fc-live" cx="${X(live.x1)}" cy="${Y(live.y1)}" r="5.5"/>`;
      g += `<text class="axis-t" x="${X(live.x1) - 8}" y="${Y(live.y1) + (live.y1 >= live.y0 ? -10 : 18)}" text-anchor="end" style="fill:var(--kosha);font-weight:600">${AI_NAME} ${pct(opt.live.pred)}</text>`;
    }
    const last = vis[vis.length - 1];
    g += `<circle cx="${X(last[0])}" cy="${Y(last[1])}" r="3.5" class="area ${tone}"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Taranga share price chart with ${AI_NAME}'s forecasts">${g}</svg>`;
    const seg = el.querySelector('#animseg');
    if (seg) { const L = seg.getTotalLength(); seg.style.strokeDasharray = L; seg.style.strokeDashoffset = L; }
  }
  function drawSpark(el) {
    if (!el) return;
    const W = Math.max(120, el.clientWidth || 140), H = 48, p = 4;
    const v = S.acct, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    const span = Math.max(hi - lo, START_VALUE * 0.01);
    const mid = (hi + lo) / 2;
    const X = (i) => p + (v.length < 2 ? 0.5 : i / (v.length - 1)) * (W - 2 * p);
    const Y = (y) => H / 2 - (y - mid) / span * (H - 2 * p);
    const tone = v[v.length - 1] >= START_VALUE ? 'up' : 'down';
    const d = v.map((y, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1)).join(' ');
    const by = Y(START_VALUE);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <line x1="0" x2="${W}" y1="${by}" y2="${by}" stroke="var(--line)" stroke-dasharray="3 3"/>
      <path d="${d}" fill="none" class="price ${tone}" stroke="${tone === 'up' ? 'var(--up)' : 'var(--down)'}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${X(v.length - 1)}" cy="${Y(v[v.length - 1])}" r="3" fill="${tone === 'up' ? 'var(--up)' : 'var(--down)'}"/></svg>`;
  }

  /* ------------------------------------------------------------------
     Screens: welcome and briefing
     ------------------------------------------------------------------ */
  function testBanner() {
    return S.test ? `<div class="test-banner">Test mode: group <b>${S.group}</b>, error round <b>${S.k}</b>. Data is flagged as test.</div>` : '';
  }

  function start() {
    let done = false;
    try { done = localStorage.getItem(CONFIG.DONE_KEY) === '1'; } catch (e) { /* storage unavailable */ }
    if (done && !S.test) return screenRepeat();
    screenWelcome();
  }

  function screenRepeat() {
    render(`<div class="page"><h1 style="font-size:24px;margin-bottom:12px">This device has already completed the challenge</h1>
      <div class="card"><p>Each person should take part only once. If someone else used this device before you, you can still continue.</p></div>
      <button class="btn" id="go">Continue anyway</button></div>`);
    $('#go').onclick = () => { S.repeatFlag = true; screenWelcome(); };
  }

  function screenWelcome() {
    render(`${testBanner()}<div class="page">
      <header class="hero">
        <p class="kicker">Investing challenge</p>
        <h1>You’re now a ${CO.name} shareholder</h1>
        <p>Manage a ₹15 lakh portfolio for ${CONFIG.REQUIRED_ROUNDS} months. Each month brings news. Read it, make your call, and grow your money. After that, keep trading as long as you like.</p>
      </header>
      <div class="card">
        <div class="stake">
          <div><span class="label">Shares</span><strong class="num">${SET.shares.toLocaleString('en-IN')}</strong></div>
          <div><span class="label">Cash</span><strong class="num">${inr(SET.cash)}</strong></div>
        </div>
        <p class="muted small" style="margin-top:8px">About 4 to 5 minutes. Fictional company, virtual money.</p>
      </div>
      <div class="card">
        <h2>Before you start</h2>
        <ul class="plain">
          <li>Taking part is voluntary, and you can stop at any time.</li>
          <li>No names or contact details are collected.</li>
          <li>Responses are used only for a class research project.</li>
          <li>Please play once, on one device, and don’t discuss it with others until the study closes.</li>
        </ul>
        ${CONFIG.PRIZE_TEXT ? `<p class="prize">${CONFIG.PRIZE_TEXT}</p>` : ''}
      </div>
      <div class="card">
        <div class="q"><p>How much do you trust AI tools for investment advice in general?</p>
          <div class="seg c7">${scale('base', 7)}</div><div class="ends"><span>Not at all</span><span>Completely</span></div></div>
        <label class="check"><input type="checkbox" id="agree"> I am 18 or older and agree to take part.</label>
      </div>
      <button class="btn brand" id="go" disabled>Start</button></div>`);
    const refresh = () => { $('#go').disabled = !($('#agree').checked && S.aiTrustBefore); };
    bindGroup('[data-g="base"]', (v) => { S.aiTrustBefore = Number(v); refresh(); });
    $('#agree').onchange = refresh;
    $('#go').onclick = () => { S.startedAt = new Date().toISOString(); S.tStart = now(); screenBriefing(); };
  }

  function screenBriefing() {
    render(`${testBanner()}<div class="page">
      <h1 style="font-size:24px;margin-bottom:14px">Your briefing</h1>
      <div class="card">
        <div class="company-head"><div class="logo lg">${LOGO}</div>
          <div><h2>${CO.legal}</h2><span class="muted small">${CO.ticker}, share price ${inr(SET.price)}</span></div></div>
        <p>${CO.about}</p>
        <div class="stats">${CO.stats.map((s) => `<div><span class="label">${s[0]}</span><span>${s[1]}</span></div>`).join('')}</div>
        <div class="chart" id="brief-chart" style="margin-top:12px"></div>
      </div>
      <div class="card kosha">
        <div class="kosha-head"><div class="kosha-mark">K</div><div><strong>${AI_NAME} AI</strong><span>Your market analyst</span></div></div>
        <p>${AI_NAME} reads company news, order data and market signals, and forecasts next month’s price move. You’ll see its call after you make your own.</p>
      </div>
      <div class="card">
        <h2>Each month</h2>
        <ol class="steps">
          <li><span>Read the news and make your call: <b>buy 100 shares</b>, <b>sell 100</b>, or <b>hold</b>.</span></li>
          <li><span>${AI_NAME} shows its forecast and advice.</span></li>
          <li><span>Keep your decision, or switch to ${AI_NAME}’s.</span></li>
          <li><span>See what the market did, and how accurate ${AI_NAME} was.</span></li>
        </ol>
        <p class="muted small" style="margin-top:10px">A clock shows your pace: ${CONFIG.DECIDE_SECONDS} seconds to decide, ${CONFIG.SWITCH_SECONDS} to keep or switch. Each trade costs ${(SET.fee * 100).toFixed(1)}%, so small moves aren’t worth trading. Play at least ${CONFIG.REQUIRED_ROUNDS} months; after that you can finish and submit any time.</p>
      </div>
      <div class="card">
        <h2>Quick check</h2>
        <p style="margin-bottom:10px">When do you see ${AI_NAME}’s advice?</p>
        <div class="seg">
          <button type="button" class="pill" data-g="comp" data-v="before" aria-pressed="false">Before I decide</button>
          <button type="button" class="pill" data-g="comp" data-v="after" aria-pressed="false">After I make my own call</button>
          <button type="button" class="pill" data-g="comp" data-v="never" aria-pressed="false">Only at the end</button>
        </div>
        <p class="feedback" id="fb" role="status"></p>
      </div>
      <button class="btn brand" id="go" disabled>Start month 1</button></div>`);
    const bc = $('#brief-chart');
    redrawCharts = () => drawPriceChart(bc, { completed: 0 });
    redrawCharts();
    bindGroup('[data-g="comp"]', (v) => {
      S.compAttempts++;
      const ok = v === 'after';
      $('#fb').textContent = ok ? `Right. You decide first, then ${AI_NAME} shows its view, and you can keep or switch.` : `Not quite. You always make your own call first. Try again.`;
      $('#fb').className = 'feedback ' + (ok ? 'ok' : 'bad');
      $('#go').disabled = !ok;
    });
    $('#go').onclick = () => screenRound();
  }

  /* ------------------------------------------------------------------
     Round screen
     ------------------------------------------------------------------ */
  function holdingsHTML() {
    const v = value(), ch = v - START_VALUE;
    return `<div class="portfolio">
        <div><span class="label">Account value</span><div class="value num">${inr(v)}</div><div class="chg num ${cls(ch)}">${signedInr(ch)} (${pct(ch / START_VALUE * 100, 2)})</div></div>
        <div class="spark" id="spark"></div>
      </div>
      <div class="holdings">
        <div><span class="label">Shares</span><span class="num">${S.shares.toLocaleString('en-IN')}</span></div>
        <div><span class="label">Cash</span><span class="num">${inr(S.cash)}</span></div>
      </div>`;
  }
  function recordLine() {
    if (!S.rec.n) return 'No track record yet';
    return `Direction right in ${S.rec.hits} of ${S.rec.n} months, average miss ${(S.rec.miss / S.rec.n).toFixed(1)} points`;
  }

  function screenRound() {
    const r = ROUNDS[S.idx];
    const bonus = r.round > CONFIG.REQUIRED_ROUNDS;
    const adv = adviceFor(r);
    const dayChg = (S.price / (S.idx ? ROUNDS[S.idx - 1].priceBefore : STUDY.historyMonths[2][0]) - 1) * 100;
    const opts = {}; ACTIONS.forEach((a) => { opts[a] = canDo(a); });
    const constrained = !opts.BUY || !opts.SELL;

    render(`${testBanner()}
      <header class="topbar">
        <div class="logo">${LOGO}</div>
        <div class="tk"><strong>${CO.name}</strong><span>${CO.ticker}</span></div>
        <div class="quote"><strong class="num">${inr(S.price, true)}</strong><span class="num ${cls(dayChg)}">${pct(dayChg)} last month</span></div>
        <div class="timer idle" aria-hidden="true"><svg viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18" fill="none" stroke-width="4"/><circle class="bar" cx="22" cy="22" r="18" fill="none" stroke-width="4" stroke-linecap="round"/></svg><b></b></div>
      </header>
      <div class="layout">
        <div class="month"><h1>${bonus ? 'Bonus month' : 'Month'} ${r.round}<span class="muted" style="font-weight:500;font-size:15px"> of ${bonus ? CONFIG.MAX_ROUNDS : CONFIG.REQUIRED_ROUNDS}</span></h1>
          ${bonus ? '<button class="finish" id="finish">Finish and see results</button>' : ''}</div>
        <aside class="side">
          <section class="card" id="holdings">${holdingsHTML()}</section>
          <div class="dock" id="dock"></div>
        </aside>
        <div class="main">
          <section class="card chart-card">
            <div class="chart-head"><h2>Share price</h2><span class="label">Daily prices, by month</span></div>
            <div class="chart" id="chart"></div>
            <div class="legend"><span><i class="lg-line"></i>Price</span><span><i class="lg-dot"></i>${AI_NAME} forecast</span>${S.rounds.some((x) => !x.ai_correct) ? '<span><i class="lg-miss"></i>Wrong-direction forecast</span>' : ''}</div>
          </section>
          <section class="card news">
            <span class="tag">Breaking news</span>
            <h2>${r.headline}</h2>
            <ul class="facts">${r.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
          </section>
          <section id="kosha-slot"></section>
          <section id="result-slot"></section>
        </div>
      </div>`);

    const chartEl = $('#chart');
    let chartOpt = { completed: S.idx };
    redrawCharts = () => { drawPriceChart(chartEl, chartOpt); drawSpark($('#spark')); };
    redrawCharts();
    const fin = $('#finish'); if (fin) fin.onclick = finishGame;

    const rec = {
      round: r.round, phase: bonus ? 'bonus' : 'main',
      initial_choice: '', initial_ms: 0, initial_overtime_ms: 0,
      ai_rec: adv.rec, ai_pred_pct: adv.pred, ai_conf: adv.conf, ai_correct: adv.rec === (r.actual / 100 > SET.fee ? 'BUY' : r.actual / 100 < -SET.fee ? 'SELL' : 'HOLD'),
      agreed: false, final_choice: '', switched: false, final_follows_ai: false, final_ms: 0,
      ai_blocked: false, constrained: constrained, confidence: null,
      actual_pct: r.actual, price_after: r.priceAfter, shares_after: 0, cash_after: 0, account_after: 0
    };

    // Stage 1: own decision
    const dock = $('#dock');
    let choice = null;
    dock.innerHTML = `<div class="prompt">Your call this month<span>${SET.lot} shares ≈ ${inr(tradeCost())}</span></div>
      <div class="acts">${ACTIONS.map((a) => `<button type="button" class="act ${a}" data-v="${a}" aria-pressed="false"${opts[a] ? '' : ' disabled'}>
        <b>${LABEL[a]}</b><small>${a === 'HOLD' ? 'No trade' : (opts[a] ? (a === 'BUY' ? '+' : '−') + SET.lot + ' shares' : (a === 'BUY' ? 'Not enough cash' : 'No shares left'))}</small></button>`).join('')}</div>
      <button class="btn" id="lock" disabled>Lock in my decision</button>`;
    syncDock();
    startTimer(CONFIG.DECIDE_SECONDS);
    bindGroup('.act', (v) => { choice = v; $('#lock').disabled = false; });
    $('#lock').onclick = () => {
      const t = stopTimer();
      rec.initial_choice = choice; rec.initial_ms = t ? t.ms : 0; rec.initial_overtime_ms = t ? t.over : 0;
      rec.agreed = choice === adv.rec;
      stageKosha();
    };

    // Stage 2: Kosha's view, then keep or switch
    function stageKosha() {
      dock.innerHTML = `<div class="prompt">You chose <span class="tag-act ${choice}">${LABEL[choice]}</span></div><p class="muted small">Waiting for ${AI_NAME}…</p>`;
      syncDock();
      const slot = $('#kosha-slot');
      slot.innerHTML = `<div class="card kosha pop"><div class="kosha-head"><div class="kosha-mark">K</div><div><strong>${AI_NAME} AI</strong><span>${recordLine()}</span></div></div>
        <p class="thinking"><span class="dots"><span></span><span></span><span></span></span>Analyzing news and market data</p></div>`;
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => {
        const target = S.price * (1 + adv.pred / 100);
        slot.innerHTML = `<div class="card kosha pop"><div class="kosha-head"><div class="kosha-mark">K</div><div><strong>${AI_NAME} AI</strong><span>Forecast for next month</span></div></div>
          <div class="call"><span class="tag-act ${adv.rec}">${LABEL[adv.rec]}</span>
            <span class="forecast num">Expects <strong class="${cls(adv.pred)}">${pct(adv.pred)}</strong> to ${inr(target, true)}</span>
            <span class="label num">${adv.conf}% confidence</span></div>
          <p>${adv.why}</p>
          <p class="record">${recordLine()}</p></div>`;
        chartOpt = { completed: S.idx, live: { pred: adv.pred } };
        redrawCharts();
        const blocked = !rec.agreed && !canDo(adv.rec);
        rec.ai_blocked = blocked;
        if (rec.agreed) {
          dock.innerHTML = `<div class="prompt">You and ${AI_NAME} agree</div>
            <button class="btn" id="keep">Confirm ${LABEL[choice]}</button>`;
        } else {
          dock.innerHTML = `<div class="prompt">${AI_NAME} disagrees<span>Keep or switch?</span></div>
            <div class="two"><button class="btn quiet" id="keep">Keep ${LABEL[choice]}</button>
            <button class="btn switch" id="switch"${blocked ? ' disabled' : ''}>Switch to ${LABEL[adv.rec]}</button></div>
            ${blocked ? `<p class="muted small" style="margin-top:6px">You can’t ${LABEL[adv.rec].toLowerCase()} right now (${adv.rec === 'BUY' ? 'not enough cash' : 'no shares left'}).</p>` : ''}`;
        }
        syncDock();
        startTimer(CONFIG.SWITCH_SECONDS);
        $('#keep').onclick = () => finalize(choice);
        const sw = $('#switch'); if (sw) sw.onclick = () => finalize(adv.rec);
      }, CONFIG.THINK_MS);
    }

    // Stage 3: record the final decision and execute it straight away
    // (the per-month confidence question was removed in v2.2; the confidence field is sent blank)
    function finalize(finalChoice) {
      const t = stopTimer();
      rec.final_ms = t ? t.ms : 0;
      rec.final_choice = finalChoice;
      rec.switched = !rec.agreed && finalChoice === adv.rec;
      rec.final_follows_ai = finalChoice === adv.rec;
      dock.innerHTML = '';
      execute();
    }

    function execute() {
      const p0 = S.price, a = rec.final_choice, lot = SET.lot;
      if (a === 'BUY') { S.shares += lot; S.cash -= lot * p0 * (1 + SET.fee); }
      if (a === 'SELL') { S.shares -= lot; S.cash += lot * p0 * (1 - SET.fee); }
      const before = value();
      S.price = r.priceAfter;
      const after = value();
      S.acct.push(after);
      const effect = a === 'HOLD' ? 0 : (a === 'BUY' ? 1 : -1) * lot * (S.price - p0) - lot * p0 * SET.fee;
      rec.shares_after = S.shares; rec.cash_after = Math.round(S.cash); rec.account_after = Math.round(after);
      const miss = Math.abs(adv.pred - r.actual);
      const dirOk = rec.ai_correct;
      S.rec.n++; if (dirOk) S.rec.hits++; S.rec.miss += miss;
      S.rounds.push(rec);
      if (r.round === CONFIG.REQUIRED_ROUNDS) S.requiredEndValue = Math.round(after);

      chartOpt = { completed: S.idx + 1, animate: true };
      redrawCharts();
      if (!rec.ai_correct && !$('.lg-miss')) $('.legend').insertAdjacentHTML('beforeend', '<span><i class="lg-miss"></i>Wrong-direction forecast</span>');
      $('#kosha-slot').innerHTML = '';
      const res = $('#result-slot');
      res.innerHTML = `<div class="card result pop">
          <span class="label">What happened in month ${r.round}</span>
          <p class="move num ${cls(r.actual)}">${pct(r.actual)}</p>
          <p class="note">${r.note}</p>
          <div class="verdict ${dirOk ? 'ok' : 'bad'}"><b>${!dirOk ? `${AI_NAME} got it wrong` : miss > 2.5 ? `${AI_NAME} got the direction right, but missed the size` : `${AI_NAME} got it right`}</b>
            <span class="num">Forecast ${pct(adv.pred)}, actual ${pct(r.actual)}: direction ${dirOk ? '✓' : '✗'}, off by ${miss.toFixed(1)} points</span>
            <span class="why-line">${adv.review}</span></div>
          <dl class="ledger num">
            <div><dt>Your decision</dt><dd><span class="tag-act ${a}">${LABEL[a]}</span>${rec.switched ? ` <span class="label">(switched to ${AI_NAME})</span>` : ''}</dd></div>
            <div><dt>Effect of your trade</dt><dd class="${effect > 0 ? 'up' : effect < 0 ? 'down' : ''}">${a === 'HOLD' ? 'No trade' : signedInr(effect) + ' vs holding'}</dd></div>
            <div><dt>Account value</dt><dd>${inr(after)}</dd></div>
            <div><dt>${AI_NAME}’s record</dt><dd class="label" style="font-weight:500">${S.rec.hits} of ${S.rec.n} right</dd></div>
          </dl></div>`;
      res.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#holdings').innerHTML = holdingsHTML(); drawSpark($('#spark'));
      $('.quote strong').textContent = inr(S.price, true);
      const qs = $('.quote span'); qs.textContent = pct(r.actual) + ' this month'; qs.className = 'num ' + cls(r.actual);

      const last = r.round === CONFIG.MAX_ROUNDS;
      const label = r.round === CONFIG.REQUIRED_ROUNDS ? 'Continue' : last ? 'See your results' : `Next month`;
      dock.innerHTML = `<button class="btn brand" id="next">${label}</button>${bonus && !last ? '<button class="btn quiet" id="finish2" style="margin-top:8px">Finish and submit</button>' : ''}`;
      syncDock();
      const f2 = $('#finish2'); if (f2) f2.onclick = finishGame;
      if (bonus) sendBonus(rec);
      $('#next').onclick = () => {
        S.idx++;
        if (r.round === CONFIG.ATTENTION_AFTER_ROUND && !S.attention) return screenAttention();
        if (r.round === CONFIG.REQUIRED_ROUNDS) return screenSurvey();
        if (last) return finishGame();
        screenRound();
      };
    }
  }

  function screenAttention() {
    render(`${testBanner()}<div class="page"><h1 style="font-size:22px;margin-bottom:12px">Quick check</h1>
      <div class="card"><p>To show you’re reading carefully, tap <b>Hold</b>. This doesn’t affect your portfolio.</p></div>
      <div class="acts">${ACTIONS.map((a) => `<button type="button" class="act ${a}" data-v="${a}" aria-pressed="false"><b>${LABEL[a]}</b></button>`).join('')}</div>
      <button class="btn" id="go" disabled>Continue</button></div>`);
    let c = null;
    bindGroup('.act', (v) => { c = v; $('#go').disabled = false; });
    $('#go').onclick = () => { S.attention = { choice: c, pass: c === 'HOLD' }; screenRound(); };
  }

  /* ------------------------------------------------------------------
     Survey after the required rounds, then checkpoint
     ------------------------------------------------------------------ */
  const SURVEY = [
    { id: 'trust_end', text: `How much do you trust ${AI_NAME} now?`, scale: 7, lo: 'Not at all', hi: 'Completely' },
    { id: 'mistakes_seen', text: `So far, how many times was ${AI_NAME} wrong about the direction?`, options: ['0', '1', '2', '3 or more', 'Not sure'] },
    { id: 'believed_ai', text: `While playing, did you believe ${AI_NAME}’s advice came from an AI analyzing each month?`, options: ['Yes', 'No', 'Not sure'] },
    { id: 'heard_before', text: 'Before you started, had anyone told you how this challenge works?', options: ['No', 'Yes, a little', 'Yes, in detail'] }
  ];
  function screenSurvey() {
    render(`${testBanner()}<div class="page"><h1 style="font-size:24px;margin-bottom:6px">Four quick questions</h1>
      <p class="muted" style="margin-bottom:14px">Then your results are saved.</p>
      <div class="card">${SURVEY.map((q) => `<div class="q"><p>${q.text}</p>${q.scale
        ? `<div class="seg c7">${scale(q.id, q.scale)}</div><div class="ends"><span>${q.lo}</span><span>${q.hi}</span></div>`
        : `<div class="seg wrap">${q.options.map((o) => `<button type="button" class="pill" data-g="${q.id}" data-v="${o}" aria-pressed="false">${o}</button>`).join('')}</div>`}</div>`).join('')}</div>
      <button class="btn brand" id="go" disabled>Save my results</button></div>`);
    SURVEY.forEach((q) => bindGroup(`[data-g="${q.id}"]`, (v) => {
      S.survey[q.id] = q.scale ? Number(v) : v;
      $('#go').disabled = SURVEY.some((x) => S.survey[x.id] === undefined);
    }));
    $('#go').onclick = async () => {
      $('#go').disabled = true; $('#go').textContent = 'Saving…';
      S.finishedAt = new Date().toISOString();
      S.totalMs = Math.round(now() - S.tStart);
      if (!S.test) { try { localStorage.setItem(CONFIG.DONE_KEY, '1'); } catch (e) { /* ignore */ } }
      S.mainStatus = await sendMain();
      screenCheckpoint();
    };
  }

  function statusText(st) {
    if (st === 'sent') return { c: 'ok', t: 'Your results are saved. Thank you.' };
    if (st === 'no-endpoint') return { c: 'warn', t: 'Data collection isn’t connected yet (setup or test run).' };
    return { c: 'bad', t: 'Your results couldn’t be sent. Try again below, or download them and send the file to the research team.' };
  }

  function screenCheckpoint() {
    const st = statusText(S.mainStatus);
    const v = S.requiredEndValue, ch = v - START_VALUE;
    render(`${testBanner()}<div class="page">
      <h1 style="font-size:26px;margin-bottom:12px">${CONFIG.REQUIRED_ROUNDS} months done</h1>
      <div class="card"><span class="label">Account value after month ${CONFIG.REQUIRED_ROUNDS}</span>
        <p class="num" style="font-size:32px;font-weight:700;letter-spacing:-0.02em">${inr(v)}</p>
        <p class="num ${cls(ch)}">${signedInr(ch)} (${pct(ch / START_VALUE * 100, 2)}) since you started</p></div>
      <p class="status ${st.c}" role="status">${st.t}</p>
      <div class="card"><h2>Keep trading?</h2>
        <p>The story continues for up to ${CONFIG.MAX_ROUNDS - CONFIG.REQUIRED_ROUNDS} more months. It’s optional: every month is saved as you go, and a Finish button is always there.${CONFIG.PRIZE_TEXT ? ` Prizes use your month-${CONFIG.REQUIRED_ROUNDS} value.` : ''}</p></div>
      <div class="stack">
        ${S.mainStatus === 'failed' ? '<button class="btn quiet" id="retry">Try saving again</button>' : ''}
        <button class="btn brand" id="more">Keep trading</button>
        <button class="btn quiet" id="stop">Finish and submit</button>
      </div></div>`);
    $('#more').onclick = () => screenRound();
    $('#stop').onclick = finishGame;
    const rt = $('#retry'); if (rt) rt.onclick = async () => { rt.disabled = true; S.mainStatus = await sendMain(); screenCheckpoint(); };
  }

  function finishGame() {
    const st = statusText(S.mainStatus);
    const saved = S.mainStatus === 'sent'
      ? (S.bonusFails ? { c: 'warn', t: `Your first ${CONFIG.REQUIRED_ROUNDS} months are saved, but ${S.bonusFails} bonus month(s) couldn’t be sent. Download your responses below as a backup.` } : { c: 'ok', t: 'All your responses are saved and submitted.' })
      : st;
    const v = value(), ch = v - START_VALUE;
    const played = S.rounds.length;
    render(`${testBanner()}<div class="page">
      <h1 style="font-size:26px;margin-bottom:12px">Thanks for playing</h1>
      <div class="card"><span class="label">Final account value after ${played} months</span>
        <p class="num" style="font-size:32px;font-weight:700;letter-spacing:-0.02em">${inr(v)}</p>
        <p class="num ${cls(ch)}">${signedInr(ch)} (${pct(ch / START_VALUE * 100, 2)})</p>
        <p class="muted small" style="margin-top:6px">${AI_NAME} was right about the direction in ${S.rec.hits} of ${S.rec.n} months.</p></div>
      <div class="card"><h2>About this study</h2>
        <p style="margin-bottom:8px">${AI_NAME} isn’t a real AI. Its forecasts and advice were written in advance by the research team, and ${CO.legal} is fictional.</p>
        <p style="margin-bottom:8px">Players were randomly assigned to one of two versions. In one, ${AI_NAME} got the direction right in every one of the first ${CONFIG.REQUIRED_ROUNDS} months. In the other, it made one deliberate mistake early on. In the bonus months it made occasional mistakes for everyone. We’re studying how people’s willingness to follow AI advice changes after it gets something wrong.</p>
        <p style="margin-bottom:8px">Please don’t share details with classmates until the study closes, because that would affect the results.</p>
        <p>If you’d prefer your responses not be used, give the research team your code: <span class="code">${S.pid}</span></p>
        ${CONFIG.CONTACT_TEXT ? `<p class="muted small" style="margin-top:8px">${CONFIG.CONTACT_TEXT}</p>` : ''}</div>
      <p class="status ${saved.c}" role="status">${saved.t}</p>
      <div class="card"><h2>Your decisions</h2>
        <div class="table-wrap"><table class="summary num">
          <thead><tr><th>Month</th><th>You</th><th>${AI_NAME}</th><th>Final</th><th>Market</th></tr></thead>
          <tbody>${S.rounds.map((x) => `<tr><td>${x.round}</td><td>${LABEL[x.initial_choice]}</td>
            <td><span class="${x.ai_correct ? '' : 'down'}">${LABEL[x.ai_rec]}${x.ai_correct ? '' : ' ✗'}</span></td>
            <td><b>${LABEL[x.final_choice]}</b>${x.switched ? ' <span class="label">switched</span>' : ''}</td>
            <td class="${cls(x.actual_pct)}">${pct(x.actual_pct)}</td></tr>`).join('')}</tbody></table></div></div>
      <button class="btn quiet" id="dl">Download my responses</button></div>`);
    $('#dl').onclick = download;
  }

  /* ------------------------------------------------------------------
     Data
     ------------------------------------------------------------------ */
  function participantRecord() {
    return {
      pid: S.pid, group: S.group, error_round: S.k, assigned_by: S.assignedBy, test: S.test, repeat_flag: S.repeatFlag,
      started_at: S.startedAt, finished_at: S.finishedAt, total_ms: S.totalMs, comprehension_attempts: S.compAttempts,
      attention_choice: S.attention ? S.attention.choice : '', attention_pass: S.attention ? S.attention.pass : '',
      required_end_value: S.requiredEndValue, ai_trust_before: S.aiTrustBefore,
      trust_end: S.survey.trust_end, mistakes_seen: S.survey.mistakes_seen, believed_ai: S.survey.believed_ai,
      heard_before: S.survey.heard_before, app_version: CONFIG.VERSION
    };
  }
  async function post(payload) {
    if (!CONFIG.ENDPOINT) return 'no-endpoint';
    try {
      // no-cors + text/plain avoids a cross-origin preflight; the reply can't be read, so "sent" isn't "confirmed".
      await fetch(CONFIG.ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      return 'sent';
    } catch (e) { return 'failed'; }
  }
  function sendMain() {
    return post({ type: 'main', participant: participantRecord(), rounds: S.rounds.filter((r) => r.phase === 'main') });
  }
  async function sendBonus(rec) {
    const st = await post({ type: 'bonus', participant: { pid: S.pid, group: S.group, error_round: S.k, test: S.test }, rounds: [rec] });
    if (st === 'failed') S.bonusFails++;
  }
  const RKEYS = ['round', 'phase', 'initial_choice', 'initial_ms', 'initial_overtime_ms', 'ai_rec', 'ai_pred_pct', 'ai_conf', 'ai_correct', 'agreed',
    'final_choice', 'switched', 'final_follows_ai', 'final_ms', 'ai_blocked', 'constrained', 'confidence', 'actual_pct', 'price_after', 'shares_after', 'cash_after', 'account_after'];
  function download() {
    const p = participantRecord(), pk = Object.keys(p), head = pk.concat(RKEYS);
    const esc = (v) => { const s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [head.join(',')].concat(S.rounds.map((r) => head.map((k) => esc(k in r ? r[k] : p[k])).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${S.pid}${S.test ? '-test' : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  start();
})();
