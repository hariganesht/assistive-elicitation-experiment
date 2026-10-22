// Study 1: what do people learn about their own preferences from seeing rooms?
// Design as of 21 Oct 2026 (changes from the 15 Oct meeting). Same events as the model code.
//
// Flow:  welcome -> instructions -> comprehension check -> slider practice
//        -> the options, one screen per feature (4 options each)
//        -> warm-up: 8 example rooms, seen and rated (builds and measures each person's prior)
//        -> 20 tasks in a random order:
//             8 single rooms   rate from text -> see the room, rate again -> rate 3 similar rooms from text
//             8 feature tasks  see a room seen earlier, rate it -> read 3 versions that change one feature, rate them
//                              -> see all of them side by side, rate the versions again, pick the best
//             4 comparisons    two rooms: rate from text -> see both, rate again -> rate 1 similar room
//        -> comments, save
//
// Ratings are ranges on a -50 (strongly dislike) to +50 (strongly like) scale. When a room is rated again,
// the earlier answer is shown faintly.
//
// URL options:
//   ?debug=1   short version (2 warm-up rooms, one task of each kind, no waiting)
//   ?viz=1     split screen: the task on the left; on the right, the model follows your answers
//              (starts at the warm-up; add &full=1 to include the introduction)
//   ?seed=123  fixes the randomisation
import { Room, FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES } from "./room.js";

// ---------------------------------------------------------------- settings
const CONFIG = {
  saveUrl: "",             // if set, the data are POSTed here as JSON at the end
  completionUrl: "",       // if set, a link back to the recruitment site is shown at the end
  minFeatureViewMs: 5000,  // each feature screen must be looked at for at least this long
  minRoomViewMs: 3000,     // each screen with room images must be looked at for at least this long
};
const QUESTION = "How much do you think you like this room?";
const HINT = "Give the lowest and highest rating you think you could end up giving it.";
const SCALE = [[-50, "Strongly dislike"], [-25, "Dislike"], [0, "Neutral"], [25, "Like"], [50, "Strongly like"]];

// Rooms are written as option labels 1-4 for (furniture, lighting, wall, decor). Which real option
// is "1", "2", ... is shuffled for each participant below.
const SEEN = ["1111", "1223", "2343", "2431", "3312", "3424", "4144", "4232"];
const OA16 = ["1111", "1223", "1334", "1442", "2122", "2214", "2343", "2431", "3133", "3241", "3312", "3424", "4144", "4232", "4321", "4413"];
// Warm-up rooms: each option appears twice, any two share at most one option, none appears in the tasks.
const WARMUP = ["1444", "2332", "3123", "4211", "1313", "2224", "3431", "4142"];

// The room `code` moved on by `step` options in the features `feats` (0-based). Same as shift() in Julia.
function change(code, feats, step) { return code.split("").map((d, f) => (feats.includes(f) ? String(((Number(d) - 1 + step) % 4) + 1) : d)).join(""); }
const shared = (a, b) => [...a].filter((d, i) => d === b[i]).length;

// The 20 tasks, in design order. t is 0-based.
function singleQuery(code, t) {
  const f = t % 4, g = (k) => (f + k) % 4;
  return { kind: "single", design: t + 1, shown: [code], neighbours: [change(code, [f], 1), change(code, [g(1), g(2)], 2), change(code, [f, g(1), g(2)], 3)] };
}
function featureQuery(code, t) {
  const f = t % 4;
  const variants = [1, 2, 3, 4].filter((v) => String(v) !== code[f]).map((v) => code.slice(0, f) + v + code.slice(f + 1));
  return { kind: "feature", design: t + 1, feature: FEATURES[f], f, base: code, variants, shown: [code, ...variants], neighbours: [] };
}
function pairQuery(t) {
  const a = OA16[2 * t], b = OA16[2 * t + 1];
  return { kind: "pair", design: t + 1, shown: [a, b], neighbours: [change(a, [t % 4], 1)] };
}

// ---------------------------------------------------------------- participant and randomisation
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const VIZ = params.has("viz");
const FULL = !VIZ || params.has("full");
const seed = Number(params.get("seed")) || Math.floor(Math.random() * 2 ** 31);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = mulberry32(seed);
function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const mapping = Object.fromEntries(FEATURES.map((f) => [f, shuffle(LEVELS[f])]));
const roomOptions = (code) => Object.fromEntries(FEATURES.map((f, i) => [f, mapping[f][Number(code[i]) - 1]]));

// Random order, except that each feature task comes after the single task that showed its base room.
function makeOrder() {
  let all = [...SEEN.map(singleQuery), ...SEEN.map(featureQuery), ...[0, 1, 2, 3].map(pairQuery)];
  if (DEBUG) all = [all[0], all[8], all[16]];
  const order = shuffle(all);
  for (const q of order.filter((x) => x.kind === "feature")) {
    const iSingle = order.findIndex((x) => x.kind === "single" && x.shown[0] === q.base);
    const iFeat = order.indexOf(q);
    if (iSingle > iFeat) {
      order.splice(iFeat, 1);
      const at = iSingle + Math.floor(random() * (order.length - iSingle + 1));   // anywhere after the single task
      order.splice(Math.max(at, iSingle), 0, q);
    }
  }
  return order;
}
const warmupOrder = shuffle(WARMUP).slice(0, DEBUG ? 2 : WARMUP.length);
const queryOrder = makeOrder();

// The same sequence as "events" (what is on screen, what gives a new impression), for the simulated person
// and for the model code: a feature task is two events, the base room seen again and then the versions.
const EVENTS = [
  ...warmupOrder.map((x) => ({ kind: "warmup", shown: [x], read: [true], neighbours: [] })),
  ...queryOrder.flatMap((q) => q.kind === "feature"
    ? [{ kind: "base", shown: [q.base], read: [true], neighbours: [] },
       { kind: "feature", feature: q.feature, shown: q.shown, read: [false, true, true, true], neighbours: [] }]
    : [{ kind: q.kind, shown: q.shown, read: q.shown.map(() => true), neighbours: q.neighbours }]),
];

const data = {
  study: "study1", version: 4, seed, debug: DEBUG, viz: VIZ, config: CONFIG, scale: [-50, 50],
  participant: params.get("PROLIFIC_PID") || params.get("pid") || `anon-${seed}`,
  urlParams: Object.fromEntries(params), userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(), mapping,
  practice: null, check: [], features: [], events: [], records: [], comments: "", finishedAt: null,
};
const backupKey = `study1-${data.participant}`;
function backup() { try { localStorage.setItem(backupKey, JSON.stringify(data)); } catch (e) { /* carry on */ } }

// ---------------------------------------------------------------- helpers
const screenEl = document.querySelector("#screen");
let openRooms = [];
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, v); }
  node.append(...children);
  return node;
}
function newCard(step, { wide = false } = {}) {
  openRooms.forEach((r) => r.dispose()); openRooms = [];
  screenEl.replaceChildren();
  const card = el("div", { class: wide ? "card wide" : "card" });
  if (step) card.append(el("div", { class: "step", text: step }));
  screenEl.append(card); if (!VIZ) window.scrollTo(0, 0);
  return card;
}
function setProgress(x) { document.querySelector("#progressFill").style.width = `${Math.round(100 * x)}%`; }
function nextButton(card, { label = "Next", minMs = 0, ready = () => true, hint = "" } = {}) {
  const error = el("div", { class: "error" });
  const button = el("button", { class: "button", text: label });
  card.append(error, el("div", { class: "actions" }, el("span", { class: "hint", text: hint }), button));
  const shown = performance.now(); const wait = DEBUG || VIZ ? 0 : minMs;
  if (wait > 0) { button.disabled = true; setTimeout(() => { button.disabled = false; }, wait); }
  return new Promise((resolve) => { button.onclick = () => { const p = ready(); if (p !== true) { error.textContent = p; return; } resolve(Math.round(performance.now() - shown)); }; });
}

// ---------------------------------------------------------------- the range slider
// One line from -50 to +50 with two handles, lowest and highest. Press on the line and drag to set the
// range in one go; afterwards, pressing on the line moves the nearer handle, and the handles can be dragged.
// prev() shows the person's earlier answer faintly. onChange(value) is called as the range changes.
const fmt = (v) => (v > 0 ? `+${v}` : `${v}`);
const clampScale = (v) => Math.max(-50, Math.min(50, Math.round(v)));
const pos = (v) => `${v + 50}%`;
function rangeSlider(question, onChange) {
  const lo = el("input", { type: "range", min: "-50", max: "50", step: "1", value: "0", "aria-label": "lowest" });
  const hi = el("input", { type: "range", min: "-50", max: "50", step: "1", value: "0", "aria-label": "highest" });
  const fill = el("div", { class: "fill" });
  const prevBand = el("div", { class: "prev", hidden: "" });
  const track = el("div", { class: "track" }, prevBand, fill, lo, hi);
  const scale = el("div", { class: "scale" }, ...SCALE.map(([v, word], i) =>
    el("span", { class: i === 0 ? "first" : i === SCALE.length - 1 ? "last" : "", style: `left:${pos(v)}` }, el("b", { text: fmt(v) }), el("br"), word)));
  const readout = el("div", { class: "readout" });
  const prevText = el("div", { class: "prev-text", hidden: "" });
  const node = el("div", { class: "range untouched" }, question ? el("div", { class: "question", text: question }) : "", track, scale, readout, prevText);
  let touched = false, anchor = 0, dragging = false;
  const draw = () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { [a, b] = [b, a]; lo.value = a; hi.value = b; }
    fill.style.left = pos(a); fill.style.width = `${b - a}%`;
    readout.textContent = touched ? (a === b ? `Exactly ${fmt(a)}` : `Lowest ${fmt(a)}  ·  Highest ${fmt(b)}`) : "Press on the line and drag to set your range";
  };
  const changed = () => { draw(); if (touched) onChange?.({ low: Number(lo.value), high: Number(hi.value) }); };
  const setRange = (p, q) => { lo.value = Math.min(p, q); hi.value = Math.max(p, q); touched = true; node.classList.remove("untouched"); changed(); };
  const valueAt = (x) => { const box = track.getBoundingClientRect(); return clampScale(-50 + (100 * (x - box.left)) / box.width); };
  track.addEventListener("pointerdown", (e) => {
    if (e.target === lo || e.target === hi) return;               // dragging a handle: the browser does it
    e.preventDefault();
    const v = valueAt(e.clientX);
    if (!touched) anchor = v;
    else { const a = Number(lo.value), b = Number(hi.value); anchor = Math.abs(v - a) <= Math.abs(v - b) ? b : a; }
    setRange(anchor, v); dragging = true; track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => { if (dragging) setRange(anchor, valueAt(e.clientX)); });
  const stop = () => { dragging = false; };
  track.addEventListener("pointerup", stop); track.addEventListener("pointercancel", stop);
  lo.addEventListener("input", changed); hi.addEventListener("input", changed);
  draw();
  const band = (bandEl, textEl, r, label) => {
    const a = clampScale(r[0]), b = clampScale(r[1]);
    bandEl.hidden = false; bandEl.style.left = pos(a); bandEl.style.width = `${Math.max(b - a, 0.8)}%`;
    textEl.hidden = false; textEl.textContent = `${label}: ${fmt(a)} to ${fmt(b)}`;
  };
  return {
    node,
    value: () => (touched ? { low: Number(lo.value), high: Number(hi.value) } : null),
    prev(r) { if (r) band(prevBand, prevText, [r.low, r.high], "Your earlier answer"); },
  };
}
const answered = (...s) => () => (s.every((x) => x.value() !== null) ? true : "Please answer every question by pressing on its line.");
function describe(options, only = FEATURES) {
  return el("ul", { class: "description" }, ...only.map((f) =>
    el("li", {}, el("span", { class: "feature", text: FEATURE_NAMES[f] }), el("span", { text: DESCRIPTIONS[options[f]] }))));
}
function roomView(parent) { const v = el("div", { class: "room-view" }); parent.append(v); return v; }
const LETTERS = ["A", "B", "C"];

// The latest answer for each room, shown faintly when the room is rated again.
const lastAnswer = {};
function slider(card, room, question = QUESTION) {
  const s = rangeSlider(question, (v) => viz?.live(room, v)); s.prev(lastAnswer[room]); card.append(s.node); return s;
}
const asRange = (v) => (v ? [v.low, v.high] : null);
const remember = (room, v) => { if (v) lastAnswer[room] = v; return asRange(v); };

// ---------------------------------------------------------------- the graphs of your answers (viz mode only)
let viz = null;
let eventIndex = -1;
const nextEvent = () => ++eventIndex;

// ---------------------------------------------------------------- screens: introduction
async function welcome() {
  const card = newCard();
  card.append(el("h1", { text: "Room Design Study" }),
    el("p", { text: "In this study you will read about designs for a living room, see some of them, and tell us how much you think you like them. It takes about 20 minutes." }),
    el("p", { text: "There are no right or wrong answers. We are interested in your own taste." }),
    el("p", { text: "[Consent information goes here.]" }));   // TODO: approved consent text
  await nextButton(card, { label: "Begin" });
}

async function instructions() {
  const card = newCard();
  card.append(el("h2", { text: "How you will answer" }),
    el("p", { text: "Each room has four things that can vary: the furniture, the lighting, the walls and the wall decor." }),
    el("p", { text: `For every room we ask: "${QUESTION}" You answer on a scale from −50 (strongly dislike) through 0 (neutral) to +50 (strongly like).` }),
    el("p", { text: "Give the lowest and highest rating you think you could end up giving the room. If you are unsure, give a wide range, for example −20 to +30. If you are sure, give a narrow one, or put both handles on the same point." }),
    el("p", { text: "Sometimes you will only read a description, and sometimes you will also see the room. When you rate a room again, your earlier answer is shown faintly. Keep it or change it: answer with what you think now." }));
  await nextButton(card);
}

async function check() {
  const qs = [
    { q: "You are completely sure you would rate a room +20. What do you do?", a: ["Put both handles on +20", "Put one handle on −50 and one on +50", "Put one handle on +20 and leave the other"], right: 0 },
    { q: "You have no idea whether you would like a room. What do you do?", a: ["Put both handles on 0", "Give a wide range, for example −40 to +40", "Give a narrow range around 0"], right: 1 },
  ];
  for (let attempt = 1; ; attempt++) {
    const card = newCard("Quick check");
    const groups = qs.map((item, i) => {
      const box = el("div", { class: "choices" }, el("p", { text: item.q }));
      item.a.forEach((txt, j) => box.append(el("label", {}, el("input", { type: "radio", name: `q${i}`, value: String(j) }), ` ${txt}`)));
      card.append(box); return box;
    });
    const pick = (i) => { const c = groups[i].querySelector("input:checked"); return c ? Number(c.value) : null; };
    await nextButton(card, { ready: () => (qs.every((_, i) => pick(i) !== null) ? true : "Please answer both questions.") });
    const ok = qs.every((item, i) => pick(i) === item.right);
    data.check.push({ attempt, answers: qs.map((_, i) => pick(i)), ok });
    if (ok) return;
    const again = newCard("Quick check");
    again.append(el("p", { text: "Not quite. The lowest and highest show how sure you are: the same point if you are certain, a wide range if you are unsure. Please try again." }));
    await nextButton(again);
  }
}

async function practice() {
  const card = newCard("Practice");
  card.append(el("h2", { text: "Try the slider" }), el("p", { text: "Press on the line and drag to set your lowest and highest. You can then drag either handle." }));
  const s = rangeSlider("How much do you like rainy days?");
  card.append(s.node);
  const ms = await nextButton(card, { ready: answered(s) });
  data.practice = { ...s.value(), ms };
}

async function features() {
  const intro = newCard("Part 1 of 3");
  intro.append(el("h2", { text: "The choices" }),
    el("p", { text: "First you will see the four choices for each part of the room, shown in a plain grey room. Please look at them carefully. There is nothing to answer." }));
  await nextButton(intro);
  for (const [i, f] of shuffle(FEATURES).entries()) {
    setProgress(0.03 + 0.1 * (i / 4));
    const card = newCard(`Part 1 of 3 · ${i + 1} of 4`, { wide: true });
    card.append(el("h2", { text: `Here are the four kinds of ${FEATURE_NAMES[f].toLowerCase()}` }));
    const grid = el("div", { class: "row-grid" }); card.append(grid);
    const order = shuffle(LEVELS[f]);
    for (const option of order) {
      const cell = el("div", {}); grid.append(cell);
      const room = new Room(roomView(cell)); room.showOption(f, option); openRooms.push(room);
      cell.append(el("div", { class: "option-name", text: DESCRIPTIONS[option] }));
    }
    const ms = await nextButton(card, { minMs: CONFIG.minFeatureViewMs });
    data.features.push({ feature: f, order, ms }); backup();
  }
}

// ---------------------------------------------------------------- recording
// One record per rated room per event, in the layout the model code reads (fromrecords in study1_short.jl).
function record(ev, kind, rows, picked, onScreen) {
  for (const r of rows) data.records.push({ event: ev + 1, kind, room: r.room, role: r.role, read: r.read, onScreen, before: r.before, after: r.after, picked });
  data.events.push({ event: ev + 1, kind, rows, picked, onScreen }); backup();
}

// ---------------------------------------------------------------- warm-up
async function warmup() {
  const intro = newCard("Part 2 of 3");
  intro.append(el("h2", { text: "Some example rooms" }),
    el("p", { text: `To start, here are ${warmupOrder.length} example rooms. For each one, look at it and say how much you think you like it.` }));
  await nextButton(intro);
  for (const [i, code] of warmupOrder.entries()) {
    setProgress(0.13 + 0.1 * (i / warmupOrder.length));
    const ev = nextEvent(); viz?.goTo(ev, "see");
    const options = roomOptions(code);
    const card = newCard(`Part 2 of 3 · Example ${i + 1} of ${warmupOrder.length}`);
    const room = new Room(roomView(card), options); openRooms.push(room);
    card.append(describe(options), el("p", { class: "hint-line", text: HINT }));
    const s = slider(card, code);
    const ms = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s) });
    record(ev, "warmup", [{ room: code, role: "shown", read: true, before: null, after: remember(code, s.value()), msAfter: ms }], code, 1);
  }
}

// ---------------------------------------------------------------- the three kinds of task
async function rateNeighbours(q, step, hint, ev, rows) {
  for (const n of shuffle(q.neighbours)) {
    viz?.goTo(ev, "neighbours", n);
    const card = newCard(`${step} · A similar room`);
    card.append(el("h2", { text: "A room with:" }), describe(roomOptions(n)), el("p", { class: "hint-line", text: HINT }));
    const s = slider(card, n);
    const ms = await nextButton(card, { ready: answered(s), hint });
    rows.push({ room: n, role: "neighbour", shared: shared(n, q.shown[0]), read: false, before: null, after: remember(n, s.value()), msAfter: ms });
  }
}

async function singleRoom(q, step, hint) {
  const code = q.shown[0], options = roomOptions(code), ev = nextEvent();
  viz?.goTo(ev, "before");
  let card = newCard(step);
  card.append(el("h2", { text: "A room with:" }), describe(options), el("p", { class: "hint-line", text: HINT }));
  let s = slider(card, code);
  const msBefore = await nextButton(card, { ready: answered(s), hint, label: "See the room" });
  const before = remember(code, s.value());

  viz?.goTo(ev, "see");
  card = newCard(`${step} · The room`);
  const room = new Room(roomView(card), options); openRooms.push(room);
  card.append(describe(options));
  s = slider(card, code);
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s), hint });
  const rows = [{ room: code, role: "shown", shared: 4, read: true, before, after: remember(code, s.value()), msBefore, msAfter }];
  await rateNeighbours(q, step, hint, ev, rows);
  record(ev, "single", rows, code, 1);
}

async function pairRooms(q, step, hint) {
  const opts = q.shown.map(roomOptions), ev = nextEvent();
  viz?.goTo(ev, "before");
  let card = newCard(step, { wide: true });
  card.append(el("h2", { text: "Two rooms" }), el("p", { class: "hint-line", text: HINT }));
  let grid = el("div", { class: "row-grid two" }); card.append(grid);
  let sliders = q.shown.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Room ${i === 0 ? "A" : "B"}` }), describe(opts[i]));
    grid.append(cell); return slider(cell, code);
  });
  const msBefore = await nextButton(card, { ready: answered(...sliders), hint, label: "See the rooms" });
  const before = sliders.map((s, i) => remember(q.shown[i], s.value()));

  viz?.goTo(ev, "see");
  card = newCard(`${step} · The rooms`, { wide: true });
  grid = el("div", { class: "row-grid two" }); card.append(grid);
  sliders = q.shown.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Room ${i === 0 ? "A" : "B"}` }));
    const room = new Room(roomView(cell), opts[i]); openRooms.push(room);
    cell.append(describe(opts[i])); grid.append(cell); return slider(cell, code);
  });
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(...sliders), hint });
  const rows = q.shown.map((code, i) => ({ room: code, role: "shown", shared: shared(code, q.shown[0]), read: true, before: before[i], after: remember(code, sliders[i].value()), msBefore, msAfter }));
  const mids = rows.map((r) => (r.after[0] + r.after[1]) / 2);
  await rateNeighbours(q, step, hint, ev, rows);
  record(ev, "pair", rows, q.shown[mids[1] > mids[0] ? 1 : 0], 2);    // picked: the one rated higher after seeing both
}

async function featureRooms(q, step, hint) {
  const f = q.feature, fname = FEATURE_NAMES[f].toLowerCase(), fixed = FEATURES.filter((x) => x !== f);
  const base = q.base, baseOpts = roomOptions(base);
  const versions = shuffle(q.variants), vOpts = versions.map(roomOptions);

  // 1. The base room again, as an image.
  let ev = nextEvent(); viz?.goTo(ev, "see");
  let card = newCard(step);
  card.append(el("h2", { text: "A room you saw earlier" }));
  const room0 = new Room(roomView(card), baseOpts); openRooms.push(room0);
  card.append(describe(baseOpts));
  const s0 = slider(card, base);
  const ms0 = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s0), hint });
  record(ev, "base", [{ room: base, role: "shown", read: true, before: null, after: remember(base, s0.value()), msAfter: ms0 }], base, 1);

  // 2. Three versions with a different option for one feature, as text.
  ev = nextEvent(); viz?.goTo(ev, "before");
  card = newCard(`${step} · Three versions`, { wide: true });
  card.append(el("h2", { text: `Three versions of this room with different ${fname}` }),
    el("p", { text: "Everything else stays the same:" }), describe(baseOpts, fixed), el("p", { class: "hint-line", text: HINT }));
  let grid = el("div", { class: "row-grid three" }); card.append(grid);
  let sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }), describe(vOpts[i], [f]));
    grid.append(cell); return slider(cell, code);
  });
  const msBefore = await nextButton(card, { ready: answered(...sliders), hint, label: "See them" });
  const before = sliders.map((s, i) => remember(versions[i], s.value()));

  // 3. All of them side by side: rate the versions again and pick the best.
  viz?.goTo(ev, "see");
  card = newCard(`${step} · The versions`, { wide: true });
  card.append(el("h2", { text: `The original room and three versions with different ${fname}` }));
  grid = el("div", { class: "row-grid four" }); card.append(grid);
  const orig = el("div", { class: "cell original" }, el("div", { class: "room-label", text: "Original" }));
  const r0 = new Room(roomView(orig), baseOpts); openRooms.push(r0);
  orig.append(describe(baseOpts, [f]), el("p", { class: "hint-line", text: "You just rated this room." }));
  grid.append(orig);
  sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }));
    const room = new Room(roomView(cell), vOpts[i]); openRooms.push(room);
    cell.append(describe(vOpts[i], [f])); grid.append(cell); return slider(cell, code, "");
  });
  const choice = el("div", { class: "choices pick" }, el("p", { class: "question", text: "Which of the four do you like best?" }));
  [base, ...versions].forEach((code, i) => choice.append(el("label", {}, el("input", { type: "radio", name: "best", value: code }), i === 0 ? " Original" : ` Version ${LETTERS[i - 1]}`)));
  choice.addEventListener("change", (e) => viz?.pick(e.target.value));
  card.append(choice);
  const picked = () => choice.querySelector("input:checked")?.value ?? null;
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, hint,
    ready: () => (answered(...sliders)() !== true ? answered(...sliders)() : picked() ? true : "Please pick the room you like best.") });
  const rows = versions.map((code, i) => ({ room: code, role: "shown", shared: 3, read: true, position: LETTERS[i], before: before[i], after: remember(code, sliders[i].value()), msBefore, msAfter }));
  record(ev, "feature", rows, picked(), 4);
}

async function tasks() {
  const intro = newCard("Part 3 of 3");
  intro.append(el("h2", { text: "The rooms" }),
    el("p", { text: `You will now go through ${queryOrder.length} short tasks. In each one you read about one or more rooms and answer, then see them and answer again. Sometimes you will then answer for a similar room from its description only.` }));
  await nextButton(intro);
  for (const [i, q] of queryOrder.entries()) {
    const hint = `Task ${i + 1} of ${queryOrder.length}`, step = "Part 3 of 3";
    setProgress(0.25 + 0.73 * (i / queryOrder.length));
    if (q.kind === "single") await singleRoom(q, step, hint);
    else if (q.kind === "pair") await pairRooms(q, step, hint);
    else await featureRooms(q, step, hint);
  }
}

async function finish() {
  setProgress(0.98);
  const card = newCard();
  const comments = el("textarea", { class: "comments", placeholder: "Optional" });
  card.append(el("h2", { text: "Almost done" }), el("p", { text: "Is there anything you would like to tell us about the study? For example, was anything unclear?" }), comments);
  await nextButton(card, { label: "Finish" });
  data.comments = comments.value.trim(); data.finishedAt = new Date().toISOString();
  backup();

  let saved = false;
  if (CONFIG.saveUrl) { try { saved = (await fetch(CONFIG.saveUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).ok; } catch (e) { saved = false; } }
  setProgress(1);
  const done = newCard(); done.append(el("h1", { text: "Thank you" }));
  const file = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const download = el("a", { class: "button", href: URL.createObjectURL(file), download: `study1-${data.participant}.json`, text: "Download my answers" });
  download.style.cssText = "display:inline-flex;align-items:center;justify-content:center;text-decoration:none;width:220px";
  if (saved) done.append(el("p", { text: "Your answers have been saved." }));
  else done.append(el("p", { text: CONFIG.saveUrl ? "Your answers could not be sent. Please download them and send the file to the researcher." : "Please download your answers and send the file to the researcher." }), download);
  if (CONFIG.completionUrl) done.append(el("p", {}, el("a", { href: CONFIG.completionUrl, text: "Click here to complete the study." })));
}

// ---------------------------------------------------------------- run
window.study1 = data;
if (VIZ) {
  document.body.classList.add("viz");
  const panel = document.querySelector("#vizPanel");
  const { createViz } = await import("./study1_viz.js?v=7");
  viz = createViz(panel, { queries: EVENTS, mapping });
}
if (FULL) {
  await welcome();
  await instructions();
  await check();
  await practice();
  await features();
}
await warmup();
await tasks();
await finish();
