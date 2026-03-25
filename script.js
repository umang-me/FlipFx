/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
const state = {
  use24h: false, showSec: true, theme: 'dark',
  offset: 0,           // ms added to Date.now()
  alarmTime: null,     // "HH:MM" 24h
  alarmFired: false,
  snoozedUntil: null,
  prev: {},            // last rendered value per slot
};

const $  = id => document.getElementById(id);
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

/* ─── Theme ──────────────────────────────────── */
function applyTheme(t) {
  state.theme = t;
  document.documentElement.dataset.theme = t;
  $('themeBtn').textContent = t === 'dark' ? '☀' : '☾';
  try { localStorage.setItem('fc-theme', t); } catch(_){}
}
function loadTheme() {
  try { const s = localStorage.getItem('fc-theme'); if (s) return s; } catch(_){}
  return matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark';
}
$('themeBtn').onclick = () => applyTheme(state.theme === 'dark' ? 'light' : 'dark');

/* ─── Settings ───────────────────────────────── */
$('settingsBtn').onclick = () => $('settingsOverlay').classList.add('open');
$('closePanel').onclick  = () => $('settingsOverlay').classList.remove('open');
$('settingsOverlay').onclick = e => { if (e.target === $('settingsOverlay')) $('settingsOverlay').classList.remove('open'); };

$('toggle24h').onchange = e => { state.use24h  = e.target.checked; rebuild(); };
$('toggleSec').onchange = e => { state.showSec = e.target.checked; rebuild(); };

$('applyTime').onclick = () => {
  const v = $('manualTime').value; if (!v) return;
  const [h, m] = v.split(':').map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  state.offset = t - Date.now();
  toast('Time overridden ✓');
};
$('resetTime').onclick = () => { state.offset = 0; $('manualTime').value = ''; toast('Reset to real time'); };

$('setAlarm').onclick = () => {
  const v = $('alarmTime').value; if (!v) return;
  state.alarmTime = v; state.alarmFired = false; state.snoozedUntil = null;
  $('alarmStatus').textContent = `⏰ Alarm set for ${fmtAlarm(v)}`;
  toast(`Alarm set for ${fmtAlarm(v)}`);
};
$('dismissAlarm').onclick = () => { $('alarmAlert').classList.remove('ringing'); state.alarmTime = null; state.alarmFired = true; $('alarmStatus').textContent = 'No alarm set'; stopSound(); };
$('snoozeAlarm').onclick  = () => {
  $('alarmAlert').classList.remove('ringing');
  state.snoozedUntil = new Date(now().getTime() + 5*60*1000);
  state.alarmFired = false;
  $('alarmStatus').textContent = '💤 Snoozed 5 minutes';
  stopSound(); toast('Snoozed 5 minutes 💤');
};

function fmtAlarm(hhmm) {
  if (state.use24h) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

/* ─── Audio ──────────────────────────────────── */
let actx, alarmIDs = [];
function getCtx() { if (!actx) actx = new (window.AudioContext||window.webkitAudioContext)(); return actx; }

function playTick() {
  try {
    const c = getCtx();
    const b = c.createBuffer(1, c.sampleRate*.04, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length)*.1;
    const s = c.createBufferSource(); s.buffer=b; s.connect(c.destination); s.start();
  } catch(_){}
}

function playAlarm() {
  try {
    const c = getCtx();
    function beep(){
      const o=c.createOscillator(), g=c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type='square'; o.frequency.setValueAtTime(880,c.currentTime); o.frequency.setValueAtTime(660,c.currentTime+.25);
      g.gain.setValueAtTime(.16,c.currentTime); g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.5);
      o.start(); o.stop(c.currentTime+.5);
    }
    beep(); const id=setInterval(beep,900); alarmIDs.push({stop:()=>clearInterval(id)});
  } catch(_){}
}
function stopSound() { alarmIDs.forEach(n=>{ try{n.stop?.();}catch(_){} }); alarmIDs=[]; }

/* ─── Time ───────────────────────────────────── */
function now() { return new Date(Date.now() + state.offset); }

/* ─── Build face ─────────────────────────────── */
const face = $('clockFace');
let digitKeys = [];

function seg(id, lbl) {
  const w = mk('div','segment-wrap');
  const g = mk('div','digit-group'); g.id='grp-'+id;
  const l = mk('div','segment-label'); l.textContent = lbl;
  w.append(g, l); return w;
}

function digit(key) {
  const d = mk('div','flip-digit'); d.id='d-'+key;
  // Static card
  const card=mk('div','card'), ct=mk('div','card-top'), cb=mk('div','card-bot'), cl=mk('div','card-line');
  const tt=mk('span','digit-text'); tt.id='st-'+key;
  const tb=mk('span','digit-text'); tb.id='sb-'+key;
  ct.append(tt); cb.append(tb); card.append(ct,cl,cb);
  // Flip panels
  const ft=mk('div','flip-top'); ft.id='ft-'+key;
  const fb=mk('div','flip-bot'); fb.id='fb-'+key;
  const ftt=mk('span','digit-text'); ftt.id='ftt-'+key;
  const fbt=mk('span','digit-text'); fbt.id='fbt-'+key;
  ft.append(ftt); fb.append(fbt);
  d.append(card, ft, fb);
  return d;
}

function colon(blink) {
  const c = mk('div','colon'+(blink?' blink':''));
  c.append(mk('div','colon-dot'), mk('div','colon-dot'));
  return c;
}

function rebuild() {
  face.innerHTML = ''; state.prev = {}; digitKeys = [];

  const hSeg = seg('h','hours');
  hSeg.querySelector('#grp-h').append(digit('h0'), digit('h1'));
  digitKeys.push('h0','h1');

  face.append(hSeg, colon(true));

  const mSeg = seg('m','minutes');
  mSeg.querySelector('#grp-m').append(digit('m0'), digit('m1'));
  digitKeys.push('m0','m1');
  face.append(mSeg);

  if (state.showSec) {
    const sSeg = seg('s','seconds');
    sSeg.querySelector('#grp-s').append(digit('s0'), digit('s1'));
    digitKeys.push('s0','s1');
    face.append(colon(false), sSeg);
  }

  if (!state.use24h) {
    const ap = mk('div','ampm-badge'); ap.id='ampm'; face.append(ap);
  }

  tick(true);
}

/* ─── Flip a digit ───────────────────────────── */
function flip(key, val) {
  const old = state.prev[key] ?? val;
  $('ftt-'+key).textContent = old;
  $('fbt-'+key).textContent = val;
  $('st-' +key).textContent = val;
  $('sb-' +key).textContent = val;

  const ft=$('ft-'+key), fb=$('fb-'+key);
  ft.classList.remove('animating'); fb.classList.remove('animating');
  void ft.offsetWidth;
  ft.classList.add('animating'); fb.classList.add('animating');
  playTick();
  setTimeout(()=>{ ft.classList.remove('animating'); fb.classList.remove('animating'); }, 660);
  state.prev[key] = val;
}

/* ─── Tick ───────────────────────────────────── */
function tick(force=false) {
  const n = now();
  const H = n.getHours(), M = n.getMinutes(), S = n.getSeconds();
  const dispH = state.use24h ? H : (H%12||12);
  const ampm  = H >= 12 ? 'PM' : 'AM';

  const pad = v => String(v).padStart(2,'0');
  const vals = {
    h0: pad(dispH)[0], h1: pad(dispH)[1],
    m0: pad(M)[0],     m1: pad(M)[1],
    s0: pad(S)[0],     s1: pad(S)[1],
  };

  digitKeys.forEach(k => {
    if (!vals[k]) return;
    if (force) {
      ['st-','sb-','ftt-','fbt-'].forEach(p => { const e=$(`${p}${k}`); if(e) e.textContent=vals[k]; });
      state.prev[k] = vals[k];
    } else if (vals[k] !== state.prev[k]) {
      flip(k, vals[k]);
    }
  });

  const ap = $('ampm'); if (ap) ap.textContent = state.use24h ? '' : ampm;

  // Alarm check (fires on second 0 of that minute)
  if (state.alarmTime && !state.alarmFired) {
    const hhmm = `${pad(H)}:${pad(M)}`;
    const snoozeOk = !state.snoozedUntil || n >= state.snoozedUntil;
    if (hhmm === state.alarmTime && snoozeOk && S === 0) {
      $('alarmAlert').classList.add('ringing');
      $('alarmTimeDisplay').textContent = fmtAlarm(state.alarmTime);
      playAlarm();
    }
  }
}

/* ─── Snackbar ───────────────────────────────── */
let snackT;
function toast(msg) {
  const s=$('snack'); s.textContent=msg; s.classList.add('show');
  clearTimeout(snackT); snackT=setTimeout(()=>s.classList.remove('show'),2600);
}

/* ─── Init ───────────────────────────────────── */
applyTheme(loadTheme());
rebuild();
setInterval(()=>tick(false), 1000);