'use strict';

/* ---------- Speicher ---------- */
const KEY = 'lifedash.v1';
const uid = () => Math.random().toString(36).slice(2, 10);

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());

const SETTINGS_DEFAULT = { waterGoal: 2500, glass: 250, weightGoal: null, trainingGoal: 3, sleepGoal: 8 };
const TRAININGS = ['Kraft', 'Laufen', 'Rad', 'Schwimmen', 'Kampfsport', 'Yoga', 'Mobility', 'Sonstiges'];

function normalize(d) {
  d.settings = { ...SETTINGS_DEFAULT, ...(d.settings || {}) };
  return d;
}

function defaults() {
  const t = todayKey();
  return {
    version: 1,
    habits: [
      'Vor 7 Uhr aufstehen',
      '30 Min. Bewegung',
      '10 Seiten lesen',
      'Kein Handy nach 22 Uhr',
    ].map((name) => ({ id: uid(), name, created: t })),
    days: {},
    settings: { ...SETTINGS_DEFAULT },
  };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.habits) && d.days && typeof d.days === 'object') return normalize(d);
  } catch (e) { /* ignorieren, Standard nutzen */ }
  return defaults();
}

let data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { toast('Speichern fehlgeschlagen. Ist der Speicher voll oder blockiert?'); }
}

function day(k, create = false) {
  let d = data.days[k];
  if (!d && create) {
    d = data.days[k] = { habits: {}, focus: [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }], mood: null, note: '' };
  }
  if (d) {
    if (d.water == null) d.water = 0;
    if (d.weight === undefined) d.weight = null;
    if (!Array.isArray(d.training)) d.training = [];
  }
  return d || { habits: {}, focus: [], mood: null, note: '', water: 0, weight: null, training: [] };
}

/* ---------- Berechnungen ---------- */
const isDone = (k, id) => !!(data.days[k] && data.days[k].habits[id]);
const activeOn = (h, k) => h.created <= k || isDone(k, h.id);

function streak(id, from = todayKey()) {
  let k = from;
  if (!isDone(k, id)) k = shift(k, -1); // heute noch offen? Serie zählt bis gestern
  let n = 0;
  while (isDone(k, id)) { n++; k = shift(k, -1); }
  return n;
}

function bestStreak(id) {
  const keys = Object.keys(data.days).filter((k) => isDone(k, id)).sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) {
    cur = prev && shift(prev, 1) === k ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = k;
  }
  return best;
}

function dayRate(k) {
  const hs = data.habits.filter((h) => activeOn(h, k));
  if (!hs.length) return null;
  return hs.filter((h) => isDone(k, h.id)).length / hs.length;
}

function habitRate(h, days) {
  let on = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const k = shift(todayKey(), -i);
    if (!activeOn(h, k)) continue;
    total++;
    if (isDone(k, h.id)) on++;
  }
  return total ? on / total : null;
}

/* ---------- Gesundheit ---------- */
const num = (n, max = 1, min = 0) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
const liters = (ml) => num(ml / 1000, 2);
const parseNum = (v) => { const n = parseFloat(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? n : null; };
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + num(Math.abs(n), 1, 1);

function lastWeightBefore(k) {
  let best = null;
  for (const [dk, d] of Object.entries(data.days)) {
    if (dk < k && d.weight != null && (!best || dk > best.k)) best = { k: dk, w: d.weight };
  }
  return best;
}

/* Schlaf: gilt für die Nacht, die an diesem Tag endet */
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
function sleepMin(sl) {
  if (!sl || !sl.bed || !sl.wake) return null;
  let d = toMin(sl.wake) - toMin(sl.bed);
  if (d <= 0) d += 1440;
  return d;
}
const dur = (m) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
const durShort = (m) => num(m / 60, 1);
function avgClock(times, aroundMidnight) {
  if (!times.length) return null;
  const ms = times.map((t) => { const m = toMin(t); return aroundMidnight && m < 720 ? m + 1440 : m; });
  return fromMin(ms.reduce((a, b) => a + b, 0) / ms.length);
}

function weekStart(k) { return shift(k, -((dateOf(k).getDay() + 6) % 7)); } // Montag

function sessionsBetween(a, b) {
  const out = [];
  for (let k = a; k <= b; k = shift(k, 1)) (day(k).training || []).forEach((t) => out.push({ ...t, k }));
  return out;
}

function weightChart(t) {
  const keys = Array.from({ length: 30 }, (_, i) => shift(t, i - 29));
  const pts = keys.map((k, i) => ({ i, k, w: day(k).weight })).filter((p) => p.w != null);
  if (pts.length < 2) {
    return `<p class="empty">${pts.length ? `Bisher ein Eintrag: ${num(pts[0].w)} kg. ` : ''}Trag an mindestens zwei Tagen dein Gewicht ein, dann erscheint hier der Verlauf.</p>`;
  }
  const goal = data.settings.weightGoal;
  const vals = pts.map((p) => p.w);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (goal != null && goal >= lo - 3 && goal <= hi + 3) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  lo -= 0.5; hi += 0.5;
  const W = 320, H = 130, L = 34, R = 8, T = 10, B = 22;
  const x = (i) => L + (i / 29) * (W - L - R);
  const y = (w) => T + (1 - (w - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
  const first = pts[0], last = pts[pts.length - 1];
  const fmtD = (k) => dateOf(k).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  return `
    <div class="w-summary">
      <div><span class="n">${num(last.w)}</span> kg <span class="muted">aktuell</span></div>
      <div class="muted">${signed(last.w - first.w)} kg seit ${fmtD(first.k)}${goal != null ? ` · Ziel ${num(goal)} kg (${Math.abs(last.w - goal) < 0.05 ? 'erreicht 🎉' : `noch ${num(Math.abs(last.w - goal), 1, 1)} kg`})` : ''}</div>
    </div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gewichtsverlauf der letzten 30 Tage">
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(hi - 0.5)}" y2="${y(hi - 0.5)}"/>
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(lo + 0.5)}" y2="${y(lo + 0.5)}"/>
      <text class="ax" x="${L - 6}" y="${y(hi - 0.5) + 3}" text-anchor="end">${num(hi - 0.5)}</text>
      <text class="ax" x="${L - 6}" y="${y(lo + 0.5) + 3}" text-anchor="end">${num(lo + 0.5)}</text>
      ${goal != null && goal >= lo && goal <= hi ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/>` : ''}
      <polyline class="wline" points="${line}"/>
      ${pts.map((p) => `<circle class="wdot" cx="${x(p.i)}" cy="${y(p.w)}" r="${p === last ? 4 : 2.5}"><title>${fmtD(p.k)}: ${num(p.w)} kg</title></circle>`).join('')}
      <text class="ax" x="${L}" y="${H - 6}">${fmtD(keys[0])}</text>
      <text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">heute</text>
    </svg>`;
}

/* ---------- Helfer ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (r) => (r == null ? '–' : `${Math.round(r * 100)}%`);
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};
const MOODS = [['😞', 'mies'], ['😕', 'meh'], ['😐', 'okay'], ['🙂', 'gut'], ['😄', 'super']];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  return 'Guten Abend';
}

/* ---------- Ansichten ---------- */
let tab = 'today';
let viewKey = todayKey();

function renderToday() {
  const k = viewKey;
  const isToday = k === todayKey();
  const d = day(k);
  const label = dateOf(k).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const hs = data.habits; // alle zeigen, damit man auch nachtragen kann
  const done = hs.filter((h) => isDone(k, h.id)).length;
  const r = hs.length ? done / hs.length : 0;
  const C = 2 * Math.PI * 42;
  const focus = [0, 1, 2].map((i) => d.focus[i] || { text: '', done: false });
  const focusDone = focus.filter((f) => f.text && f.done).length;

  let msg;
  if (!hs.length) msg = 'Leg unter „Habits“ deine ersten Gewohnheiten an.';
  else if (done === hs.length) msg = 'Alles erledigt. Stark! 🔥';
  else if (r >= 0.5) msg = `Noch ${hs.length - done} – du bist auf Kurs.`;
  else msg = isToday ? 'Ein Haken nach dem anderen.' : 'Trag nach, was du geschafft hast.';

  return `
    <header class="head">
      <div class="grow">
        <h1>${isToday ? greeting() : esc(label)}</h1>
        <p class="sub">${isToday ? esc(label) : 'Rückblick'}</p>
      </div>
      <div class="daynav">
        ${isToday ? '' : '<button class="chip-btn" data-act="go-today">Heute</button>'}
        <button class="icon-btn" data-act="prev" aria-label="Vorheriger Tag">${ICON.left}</button>
        <button class="icon-btn" data-act="next" aria-label="Nächster Tag" ${isToday ? 'disabled' : ''}>${ICON.right}</button>
      </div>
    </header>

    <section class="card hero">
      <div class="ring" role="img" aria-label="${Math.round(r * 100)} Prozent der Habits erledigt">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="42"/><circle class="bar" cx="50" cy="50" r="42" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - r)}"/></svg>
        <div class="pct">${Math.round(r * 100)}%</div>
      </div>
      <div>
        <p class="msg">${esc(msg)}</p>
        <p class="meta">${done}/${hs.length} Habits · ${focusDone}/3 Fokus</p>
      </div>
    </section>

    <section class="card">
      <h2>Top 3 Fokus <span class="count">Was macht heute den Unterschied?</span></h2>
      ${focus.map((f, i) => `
        <div class="focus-row ${f.done && f.text ? 'done' : ''}">
          <span class="num">${i + 1}</span>
          <input type="text" data-focus="${i}" value="${esc(f.text)}" placeholder="${['Wichtigste Aufgabe', 'Zweite Priorität', 'Dritte Priorität'][i]}" maxlength="120" enterkeyhint="done">
          <button class="check" data-act="focus-done" data-i="${i}" aria-pressed="${!!f.done}" aria-label="Fokus ${i + 1} erledigt">${CHECK}</button>
        </div>`).join('')}
    </section>

    <section class="card">
      <h2>Habits <span class="count">${done}/${hs.length}</span></h2>
      ${hs.length ? hs.map((h) => {
        const on = isDone(k, h.id);
        const s = streak(h.id, k);
        return `<button class="habit ${on ? 'on' : ''}" data-act="habit" data-id="${h.id}" aria-pressed="${on}">
          <span class="check">${CHECK}</span>
          <span class="name">${esc(h.name)}</span>
          <span class="streak">${s ? `🔥 ${s}` : ''}</span>
        </button>`;
      }).join('') : '<p class="empty">Noch keine Habits.</p>'}
    </section>

${renderHealth(k, d)}

    <section class="card">
      <h2>Abend-Check-in</h2>
      <span class="label">Wie war ${isToday ? 'dein Tag' : 'der Tag'}?</span>
      <div class="moods">
        ${MOODS.map(([e, l], i) => `<button class="mood" data-act="mood" data-v="${i + 1}" aria-pressed="${d.mood === i + 1}" aria-label="${l}">${e}<small>${l}</small></button>`).join('')}
      </div>
      <label class="label" for="note">Was lief gut? Was machst du morgen besser?</label>
      <textarea id="note" data-note placeholder="Kurze Notiz …">${esc(d.note || '')}</textarea>
    </section>`;
}

function renderHealth(k, d) {
  const S = data.settings;
  const water = d.water || 0;
  const prev = lastWeightBefore(k);
  const ws = weekStart(k);
  const weekSessions = sessionsBetween(ws, k);
  const sessions = d.training || [];
  const diff = d.weight != null && prev ? d.weight - prev.w : null;
  const sl = d.sleep || {};
  const sm = sleepMin(sl);
  const goalM = S.sleepGoal * 60;
  return `
    <section class="card">
      <h2>Gesundheit</h2>

      <div class="h-block">
        <div class="h-top">
          <span class="h-title">😴 Schlaf <small class="muted">letzte Nacht</small></span>
          <span class="h-val ${sm != null && sm >= goalM ? 'ok' : ''}">${sm != null ? `<b>${dur(sm)}</b> / ${num(S.sleepGoal)} h` : `Ziel ${num(S.sleepGoal)} h`}</span>
        </div>
        ${sm != null ? `<div class="meter sleep ${sm >= goalM ? 'met' : ''}"><div style="width:${Math.min(100, (sm / goalM) * 100)}%"></div></div>` : ''}
        <div class="sleep-row">
          <label><span class="label">Ins Bett</span><input class="field" type="time" data-sleep="bed" value="${esc(sl.bed || '')}"></label>
          <label><span class="label">Aufgestanden</span><input class="field" type="time" data-sleep="wake" value="${esc(sl.wake || '')}"></label>
        </div>
        <span class="label" style="margin-top:10px">Wie erholt fühlst du dich?</span>
        <div class="seg">
          ${[1, 2, 3, 4, 5].map((v) => `<button class="seg-btn" data-act="sleep-q" data-v="${v}" aria-pressed="${sl.q === v}">${v}</button>`).join('')}
        </div>
      </div>

      <div class="h-block">
        <div class="h-top">
          <span class="h-title">💧 Wasser</span>
          <span class="h-val"><b>${liters(water)}</b> / ${liters(S.waterGoal)} L</span>
        </div>
        <div class="meter ${water >= S.waterGoal ? 'met' : ''}"><div style="width:${Math.min(100, (water / S.waterGoal) * 100)}%"></div></div>
        <div class="water-btns">
          <button class="btn ghost" data-act="water" data-v="-1" ${water <= 0 ? 'disabled' : ''} aria-label="Ein Glas abziehen">− ${S.glass} ml</button>
          <button class="btn" data-act="water" data-v="1">+ ${S.glass} ml</button>
        </div>
      </div>

      <div class="h-block">
        <div class="h-top">
          <label class="h-title" for="weight">⚖️ Gewicht</label>
          <span class="h-val">${diff != null ? `${signed(diff)} kg seit ${dateOf(prev.k).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}` : prev ? `zuletzt ${num(prev.w)} kg` : ''}</span>
        </div>
        <div class="weight-row">
          <input id="weight" class="field" data-weight type="text" inputmode="decimal" placeholder="z. B. 78,4" value="${d.weight != null ? num(d.weight) : ''}" autocomplete="off">
          <span class="unit">kg</span>
        </div>
      </div>

      <div class="h-block">
        <div class="h-top">
          <span class="h-title">🏋️ Training</span>
          <span class="h-val ${weekSessions.length >= S.trainingGoal ? 'ok' : ''}">Diese Woche <b>${weekSessions.length}/${S.trainingGoal}</b></span>
        </div>
        ${sessions.map((t, i) => `
          <div class="session">
            <span>${esc(t.type)}${t.min ? ` · ${t.min} Min.` : ''}</span>
            <button class="icon-btn sm" data-act="del-training" data-i="${i}" aria-label="Training entfernen">${ICON.trash}</button>
          </div>`).join('')}
        <form class="add training-form" data-form="training">
          <select class="field" name="type" aria-label="Art des Trainings">${TRAININGS.map((t) => `<option>${t}</option>`).join('')}</select>
          <input class="field min" name="min" type="number" inputmode="numeric" min="1" max="600" placeholder="Min." aria-label="Dauer in Minuten">
          <button class="btn" type="submit">Eintragen</button>
        </form>
      </div>
    </section>`;
}

function renderWeek() {
  const t = todayKey();
  const keys = Array.from({ length: 7 }, (_, i) => shift(t, i - 6));
  const rates = keys.map(dayRate);
  const valid = rates.filter((x) => x != null);
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  const moods = keys.map((k) => day(k).mood).filter(Boolean);
  const moodAvg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
  const focusDone = keys.reduce((n, k) => n + day(k).focus.filter((f) => f.text && f.done).length, 0);
  const perfect = rates.filter((x) => x === 1).length;

  return `
    <header class="head"><div class="grow"><h1>Deine Woche</h1><p class="sub">Die letzten 7 Tage</p></div></header>

    <section class="card">
      <div class="stats">
        <div class="stat"><div class="n">${pct(avg)}</div><div class="t">Habits erfüllt</div></div>
        <div class="stat"><div class="n">${perfect}</div><div class="t">Perfekte Tage</div></div>
        <div class="stat"><div class="n">${moodAvg ? MOODS[Math.round(moodAvg) - 1][0] : '–'}</div><div class="t">Ø Stimmung</div></div>
      </div>
      <p class="hint">${focusDone} von 21 Fokus-Aufgaben erledigt.</p>
    </section>

    <section class="card">
      <h2>Habits pro Tag</h2>
      <div class="bars">
        ${keys.map((k, i) => {
          const r = rates[i];
          return `<div class="bar-col ${k === t ? 'today' : ''}">
            <span class="v">${pct(r)}</span>
            <div class="bar-wrap"><div class="bar-fill" style="height:${r == null ? 0 : Math.max(r * 100, r ? 4 : 0)}%"></div></div>
            <span class="d">${WD[dateOf(k).getDay()]}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="card">
      <h2>Pro Habit <span class="count">Serie · Rekord · 30 Tage</span></h2>
      ${data.habits.length ? data.habits.map((h) => `
        <div class="hrow">
          <span class="name">${esc(h.name)}</span>
          <span class="info">🔥 ${streak(h.id)} · 🏆 ${bestStreak(h.id)} · ${pct(habitRate(h, 30))}</span>
          <div class="dots">${keys.map((k) => `<span class="dot ${!activeOn(h, k) ? 'na' : isDone(k, h.id) ? 'on' : ''}" title="${WD[dateOf(k).getDay()]}"></span>`).join('')}</div>
        </div>`).join('') : '<p class="empty">Noch keine Habits.</p>'}
    </section>

    ${renderWeekHealth(t, keys)}`;
}

function renderWeekSleep(t, keys) {
  const goal = data.settings.sleepGoal;
  const sls = keys.map((k) => day(k).sleep || null);
  const mins = sls.map(sleepMin);
  const valid = mins.filter((m) => m != null);
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  const beds = sls.filter((x) => x && x.bed && x.wake).map((x) => x.bed);
  const wakes = sls.filter((x) => x && x.bed && x.wake).map((x) => x.wake);
  const scale = Math.max(goal * 60 * 1.25, ...valid);
  return `
    <section class="card">
      <h2>Schlaf <span class="count">Ziel ${num(goal)} h</span></h2>
      <div class="stats">
        <div class="stat"><div class="n">${avg == null ? '–' : durShort(avg)}</div><div class="t">Ø Stunden</div></div>
        <div class="stat"><div class="n">${avgClock(beds, true) || '–'}</div><div class="t">Ø ins Bett</div></div>
        <div class="stat"><div class="n">${avgClock(wakes, false) || '–'}</div><div class="t">Ø aufgestanden</div></div>
      </div>
      <div class="bars" style="margin-top:14px">
        ${keys.map((k, i) => {
          const m = mins[i];
          return `<div class="bar-col ${k === t ? 'today' : ''}">
            <span class="v">${m == null ? '–' : durShort(m)}</span>
            <div class="bar-wrap"><div class="bar-fill sleep ${m != null && m >= goal * 60 ? 'met' : ''}" style="height:${m == null ? 0 : (m / scale) * 100}%"></div></div>
            <span class="d">${WD[dateOf(k).getDay()]}</span>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderWeekHealth(t, keys) {
  const S = data.settings;
  const waters = keys.map((k) => day(k).water || 0);
  const waterDays = waters.filter((w) => w > 0);
  const waterAvg = waterDays.length ? waterDays.reduce((a, b) => a + b, 0) / waterDays.length : null;
  const sessions = sessionsBetween(keys[0], t);
  const minutes = sessions.reduce((n, s) => n + (s.min || 0), 0);
  const ws = keys.map((k) => day(k).weight).filter((w) => w != null);
  const wDiff = ws.length >= 2 ? ws[ws.length - 1] - ws[0] : null;
  return `
    <section class="card">
      <h2>Gesundheit <span class="count">letzte 7 Tage</span></h2>
      <div class="stats">
        <div class="stat"><div class="n">${waterAvg == null ? '–' : liters(waterAvg)}</div><div class="t">Ø Liter Wasser</div></div>
        <div class="stat"><div class="n">${sessions.length}</div><div class="t">Trainings${minutes ? ` · ${minutes} Min.` : ''}</div></div>
        <div class="stat"><div class="n">${wDiff == null ? '–' : signed(wDiff)}</div><div class="t">kg Gewicht</div></div>
      </div>
    </section>

    ${renderWeekSleep(t, keys)}

    <section class="card">
      <h2>Wasser pro Tag <span class="count">Ziel ${liters(S.waterGoal)} L</span></h2>
      <div class="bars">
        ${keys.map((k, i) => {
          const w = waters[i];
          return `<div class="bar-col ${k === t ? 'today' : ''}">
            <span class="v">${w ? liters(w) : '–'}</span>
            <div class="bar-wrap"><div class="bar-fill water ${w >= S.waterGoal ? 'met' : ''}" style="height:${Math.min(100, (w / S.waterGoal) * 100)}%"></div></div>
            <span class="d">${WD[dateOf(k).getDay()]}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="card">
      <h2>Training</h2>
      <div class="train-week">
        ${keys.map((k) => {
          const ss = day(k).training || [];
          const m = ss.reduce((n, s) => n + (s.min || 0), 0);
          return `<div class="tw ${ss.length ? 'on' : ''} ${k === t ? 'today' : ''}" title="${esc(ss.map((s) => s.type).join(', '))}">
            <span class="d">${WD[dateOf(k).getDay()]}</span>
            <span class="tw-box">${ss.length ? (ss.length > 1 ? ss.length + '×' : '✓') : ''}</span>
            <span class="v">${m ? m + "'" : ''}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="card">
      <h2>Gewicht <span class="count">30 Tage</span></h2>
      ${weightChart(t)}
    </section>`;
}

function renderSettings() {
  return `
    <header class="head"><div class="grow"><h1>Habits & Ziele</h1><p class="sub">Wenige, klare Gewohnheiten schlagen viele vage.</p></div></header>

    <section class="card">
      <h2>Deine Gewohnheiten <span class="count">${data.habits.length}</span></h2>
      ${data.habits.map((h, i) => `
        <div class="edit-row">
          <span class="name">${esc(h.name)}</span>
          <button class="icon-btn" data-act="up" data-id="${h.id}" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn" data-act="down" data-id="${h.id}" aria-label="Nach unten" ${i === data.habits.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button class="icon-btn" data-act="del" data-id="${h.id}" aria-label="Löschen">${ICON.trash}</button>
        </div>`).join('') || '<p class="empty">Noch keine Habits.</p>'}
      <form class="add" data-form="add">
        <input class="field" name="name" placeholder="Neue Gewohnheit, z. B. „2 L Wasser“" maxlength="60" autocomplete="off" required>
        <button class="btn" type="submit">Hinzufügen</button>
      </form>
      <p class="hint">Tipp: Formuliere konkret und messbar („20 Min. lesen“ statt „mehr lesen“). 3–6 Habits sind ein guter Start.</p>
    </section>

    <section class="card">
      <h2>Gesundheitsziele</h2>
      <div class="goal-grid">
        <label><span class="label">Wasser pro Tag (L)</span><input class="field" data-setting="waterGoal" inputmode="decimal" value="${num(data.settings.waterGoal / 1000, 2)}"></label>
        <label><span class="label">Glasgröße (ml)</span><input class="field" data-setting="glass" inputmode="numeric" value="${data.settings.glass}"></label>
        <label><span class="label">Zielgewicht (kg)</span><input class="field" data-setting="weightGoal" inputmode="decimal" placeholder="optional" value="${data.settings.weightGoal != null ? num(data.settings.weightGoal) : ''}"></label>
        <label><span class="label">Schlaf pro Nacht (h)</span><input class="field" data-setting="sleepGoal" inputmode="decimal" value="${num(data.settings.sleepGoal)}"></label>
        <label><span class="label">Trainings pro Woche</span><input class="field" data-setting="trainingGoal" inputmode="numeric" value="${data.settings.trainingGoal}"></label>
      </div>
    </section>

    <section class="card">
      <h2>Daten</h2>
      <div class="btn-row">
        <button class="btn ghost" data-act="export">Backup exportieren</button>
        <label class="btn ghost" style="cursor:pointer">Backup importieren<input type="file" accept="application/json,.json" data-import hidden></label>
        <button class="btn danger" data-act="reset">Alles löschen</button>
      </div>
      <p class="hint">Deine Daten liegen nur in diesem Browser. Exportiere ab und zu ein Backup.</p>
    </section>`;
}

function render() {
  const app = $('#app');
  app.innerHTML = tab === 'today' ? renderToday() : tab === 'week' ? renderWeek() : renderSettings();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

/* ---------- Interaktion ---------- */
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  if (tab === 'today') viewKey = todayKey();
  render();
  window.scrollTo(0, 0);
});

$('#app').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  switch (act) {
    case 'prev': viewKey = shift(viewKey, -1); break;
    case 'next': if (viewKey < todayKey()) viewKey = shift(viewKey, 1); break;
    case 'go-today': viewKey = todayKey(); break;
    case 'habit': {
      const d = day(viewKey, true);
      if (d.habits[id]) delete d.habits[id]; else d.habits[id] = true;
      save();
      if (navigator.vibrate && d.habits[id]) navigator.vibrate(10);
      break;
    }
    case 'focus-done': {
      const d = day(viewKey, true);
      const f = d.focus[b.dataset.i];
      if (!f.text.trim()) { toast('Trag zuerst eine Aufgabe ein.'); return; }
      f.done = !f.done;
      save();
      break;
    }
    case 'mood': {
      const d = day(viewKey, true);
      const v = Number(b.dataset.v);
      d.mood = d.mood === v ? null : v;
      save();
      break;
    }
    case 'water': {
      const d = day(viewKey, true);
      d.water = Math.max(0, (d.water || 0) + Number(b.dataset.v) * data.settings.glass);
      save();
      if (Number(b.dataset.v) > 0 && d.water >= data.settings.waterGoal && d.water - data.settings.glass < data.settings.waterGoal) toast('Wasserziel erreicht 💧');
      break;
    }
    case 'sleep-q': {
      const d = day(viewKey, true);
      d.sleep = d.sleep || {};
      const v = Number(b.dataset.v);
      d.sleep.q = d.sleep.q === v ? null : v;
      save();
      break;
    }
    case 'del-training': {
      const d = day(viewKey, true);
      d.training.splice(Number(b.dataset.i), 1);
      save();
      break;
    }
    case 'up': case 'down': {
      const i = data.habits.findIndex((h) => h.id === id);
      const j = act === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= data.habits.length) return;
      [data.habits[i], data.habits[j]] = [data.habits[j], data.habits[i]];
      save();
      break;
    }
    case 'del': {
      const h = data.habits.find((x) => x.id === id);
      if (!h || !confirm(`„${h.name}“ löschen? Der bisherige Verlauf dieser Gewohnheit geht verloren.`)) return;
      data.habits = data.habits.filter((x) => x.id !== id);
      Object.values(data.days).forEach((d) => delete d.habits[id]);
      save();
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `life-dashboard-${todayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    case 'reset':
      if (!confirm('Wirklich alle Daten löschen? Das lässt sich nicht rückgängig machen.')) return;
      data = defaults();
      save();
      toast('Zurückgesetzt.');
      break;
    default: return;
  }
  render();
});

// Texteingaben speichern, ohne neu zu rendern (Fokus bleibt erhalten)
$('#app').addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.focus != null) {
    const d = day(viewKey, true);
    d.focus[el.dataset.focus].text = el.value;
    if (!el.value.trim()) d.focus[el.dataset.focus].done = false;
    save();
  } else if (el.hasAttribute('data-weight')) {
    const d = day(viewKey, true);
    const v = el.value.trim();
    if (!v) { d.weight = null; save(); return; }
    const n = parseNum(v);
    if (n != null && n >= 20 && n <= 400) { d.weight = Math.round(n * 10) / 10; save(); }
  } else if (el.hasAttribute('data-note')) {
    day(viewKey, true).note = el.value;
    save();
  }
});

$('#app').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.focus != null) e.target.blur();
});

$('#app').addEventListener('submit', (e) => {
  if (e.target.dataset.form === 'training') {
    e.preventDefault();
    const f = e.target;
    const min = parseInt(f.min.value, 10);
    if (!(min > 0 && min <= 600)) { toast('Wie viele Minuten? (1–600)'); f.min.focus(); return; }
    day(viewKey, true).training.push({ type: f.type.value, min });
    save();
    render();
    toast('Training eingetragen 💪');
    return;
  }
  if (e.target.dataset.form !== 'add') return;
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  data.habits.push({ id: uid(), name, created: todayKey() });
  save();
  render();
  $('.add .field').focus();
});

$('#app').addEventListener('change', (e) => {
  const el = e.target;
  if (el.hasAttribute('data-weight')) { render(); return; }
  if (el.dataset.sleep) {
    const d = day(viewKey, true);
    d.sleep = d.sleep || {};
    d.sleep[el.dataset.sleep] = /^\d{2}:\d{2}$/.test(el.value) ? el.value : null;
    save();
    render();
    return;
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    const n = parseNum(el.value);
    const rules = {
      waterGoal: () => n >= 0.25 && n <= 10 && Math.round(n * 1000),
      glass: () => n >= 50 && n <= 2000 && Math.round(n),
      weightGoal: () => (el.value.trim() === '' ? null : n >= 20 && n <= 400 && Math.round(n * 10) / 10),
      trainingGoal: () => n >= 1 && n <= 21 && Math.round(n),
      sleepGoal: () => n >= 4 && n <= 12 && Math.round(n * 4) / 4,
    };
    const v = rules[key]();
    if (v === false || v === undefined || Number.isNaN(v)) { toast('Ungültiger Wert'); render(); return; }
    data.settings[key] = v;
    save();
    toast('Gespeichert');
    return;
  }
  if (!el.hasAttribute('data-import')) return;
  const file = e.target.files[0];
  if (!file) return;
  file.text().then((txt) => {
    const d = JSON.parse(txt);
    if (!d || !Array.isArray(d.habits) || typeof d.days !== 'object') throw new Error('format');
    data = normalize(d);
    save();
    render();
    toast('Backup importiert.');
  }).catch(() => toast('Datei konnte nicht gelesen werden.'));
});

// Um Mitternacht oder beim Zurückkehren in die App auf den neuen Tag springen
let lastToday = todayKey();
function checkDayChange() {
  const t = todayKey();
  if (t !== lastToday) {
    if (viewKey === lastToday) viewKey = t;
    lastToday = t;
    const active = document.activeElement;
    if (!active || !['INPUT', 'TEXTAREA'].includes(active.tagName)) render();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
setInterval(checkDayChange, 60 * 1000);

try { if (!localStorage.getItem(KEY)) save(); } catch (e) { /* kein Speicher verfügbar */ }
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
