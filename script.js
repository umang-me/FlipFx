/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
const state = {
  showSec: true,
  theme: 'dark',
  offset: 0,          // ms offset for manual time override
  alarmTime: null,       // "HH:MM" 24h string
  alarmFired: false,
  snoozedUntil: null,
};

const $ = id => document.getElementById(id);

/* ─── FlipClock instance ─────────────────────── */
// FlipClock.js v1 exposes its API on window.FlipClock (UMD build)
const FC = window.FlipClock;
let clockInstance = null;

function getFormat() {
  const s = state.showSec ? ':[ss]' : '';
  return `[HH]:[mm]${s}`;
}

function buildClock() {
  // Destroy previous instance if it exists
  if (clockInstance) {
    try { clockInstance.stop(); } catch (_) { }
    $('clockFace').innerHTML = '';
    clockInstance = null;
  }

  const startDate = new Date(Date.now() + state.offset);

  clockInstance = FC.flipClock({
    parent: $('clockFace'),
    face: FC.clock({
      date: startDate,
      format: getFormat(),
    }),
    theme: FC.theme({
      // No built-in dividers text — we render CSS dots via pseudo-elements
      dividers: ':',
      css: FC.css({
        fontSize: `${getComputedStyle(document.documentElement)
          .getPropertyValue('--card-font').trim() || '120px'}`,
        animationDuration: '300ms',
        fontFamily: '"Bebas Neue", sans-serif',
      }),
    }),
  });

  // Wrap the clock in a container for centering
  requestAnimationFrame(() => {
    const clockEl = $('clockFace').querySelector('.flip-clock');
    if (clockEl && !clockEl.parentElement.classList.contains('clock-container')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'clock-container';
      clockEl.parentNode.insertBefore(wrapper, clockEl);
      wrapper.appendChild(clockEl);
    }

    // Inject group labels (hours / minutes / seconds) after the library renders
    const groups = $('clockFace').querySelectorAll('.flip-clock-group');
    const labels = getLabels();
    groups.forEach((g, i) => {
      let lbl = g.querySelector('.flip-clock-label');
      if (!lbl) {
        lbl = document.createElement('div');
        lbl.className = 'flip-clock-label';
        g.appendChild(lbl);
      }
      lbl.textContent = labels[i] || '';
    });
  });
}

/* Re-sync the FlipClock date when there is a manual time offset */
function syncOffset() {
  if (!clockInstance || state.offset === 0) return;
  try {
    // FlipClock v1: update the face date
    const newDate = new Date(Date.now() + state.offset);
    clockInstance.face.date = newDate;
  } catch (_) { }
}

/* ─── Theme ──────────────────────────────────── */
function applyTheme(t) {
  state.theme = t;
  document.documentElement.dataset.theme = t;
  $('themeBtn').textContent = t === 'dark' ? '☀' : '☾';
  try { localStorage.setItem('fc-theme', t); } catch (_) { }
}
function loadTheme() {
  try { const s = localStorage.getItem('fc-theme'); if (s) return s; } catch (_) { }
  return matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark';
}
$('themeBtn').onclick = () => applyTheme(state.theme === 'dark' ? 'light' : 'dark');

/* ─── Settings panel ─────────────────────────── */
$('settingsBtn').onclick = () => $('settingsOverlay').classList.add('open');
$('closePanel').onclick = () => $('settingsOverlay').classList.remove('open');
$('settingsOverlay').onclick = e => {
  if (e.target === $('settingsOverlay')) $('settingsOverlay').classList.remove('open');
};

$('toggleSec').onchange = e => { state.showSec = e.target.checked; buildClock(); };

/* ─── Manual time override ───────────────────── */
$('applyTime').onclick = () => {
  const v = $('manualTime').value; if (!v) return;
  const [h, m] = v.split(':').map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  state.offset = t - Date.now();
  buildClock();   // rebuild with new start date
  toast('Time overridden ✓');
};
$('resetTime').onclick = () => {
  state.offset = 0;
  $('manualTime').value = '';
  buildClock();
  toast('Reset to real time');
};

/* ─── Alarm ──────────────────────────────────── */
function fmtAlarm(hhmm) {
  return hhmm;
}

$('setAlarm').onclick = () => {
  const v = $('alarmTime').value; if (!v) return;
  state.alarmTime = v; state.alarmFired = false; state.snoozedUntil = null;
  $('alarmStatus').textContent = `⏰ Alarm set for ${fmtAlarm(v)}`;
  toast(`Alarm set for ${fmtAlarm(v)}`);
};
$('dismissAlarm').onclick = () => {
  $('alarmAlert').classList.remove('ringing');
  state.alarmTime = null; state.alarmFired = true;
  $('alarmStatus').textContent = 'No alarm set';
  stopSound();
};
$('snoozeAlarm').onclick = () => {
  $('alarmAlert').classList.remove('ringing');
  state.snoozedUntil = new Date(Date.now() + state.offset + 5 * 60 * 1000);
  state.alarmFired = false;
  $('alarmStatus').textContent = '💤 Snoozed 5 minutes';
  stopSound(); toast('Snoozed 5 minutes 💤');
};

/* ─── Alarm check (run every second) ────────────── */
function checkAlarm() {
  if (!state.alarmTime || state.alarmFired) return;
  const n = new Date(Date.now() + state.offset);
  const pad = v => String(v).padStart(2, '0');
  const hhmm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  const snoozeOk = !state.snoozedUntil || n >= state.snoozedUntil;
  if (hhmm === state.alarmTime && snoozeOk && n.getSeconds() === 0) {
    $('alarmAlert').classList.add('ringing');
    $('alarmTimeDisplay').textContent = fmtAlarm(state.alarmTime);
    state.alarmFired = true;
    playAlarm();
  }
}
setInterval(checkAlarm, 1000);

/* ─── Audio ──────────────────────────────────── */
let actx, alarmIDs = [];
function getCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}
function playAlarm() {
  try {
    const c = getCtx();
    function beep() {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'square';
      o.frequency.setValueAtTime(880, c.currentTime);
      o.frequency.setValueAtTime(660, c.currentTime + .25);
      g.gain.setValueAtTime(.16, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .5);
      o.start(); o.stop(c.currentTime + .5);
    }
    beep();
    const id = setInterval(beep, 900);
    alarmIDs.push({ stop: () => clearInterval(id) });
  } catch (_) { }
}
function stopSound() {
  alarmIDs.forEach(n => { try { n.stop?.(); } catch (_) { } });
  alarmIDs = [];
}

/* ─── Snackbar ───────────────────────────────── */
let snackT;
function toast(msg) {
  const s = $('snack'); s.textContent = msg; s.classList.add('show');
  clearTimeout(snackT); snackT = setTimeout(() => s.classList.remove('show'), 2600);
}

/* ─── Init ───────────────────────────────────── */
applyTheme(loadTheme());
buildClock();