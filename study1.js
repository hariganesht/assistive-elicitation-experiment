// Study 1: what do people learn about their own preferences from seeing rooms?
// Design as of 28 Oct 2026 (changes from the 22 Oct meeting).
//
// Flow:  welcome -> instructions -> comprehension check -> slider practice
//        -> the options, one screen per feature (4 options each) -> a short check on the options
//        -> three blocks, in a random order (one kind of task per block):
//             single rooms   rate from text -> see the room, rate again -> rate 4 other rooms from text
//                            (sharing 3, 2, 1 and 0 options with it)
//             comparisons    see a room, rate it -> read 1 or 2 other rooms, rate them
//                            -> see them all, including the first room again, rate them again
//             feature tasks  see a room, rate it -> read 3 versions that change one feature, rate them
//                            -> see the room with pictures of the three options, rate the versions again, pick the best
//        -> comments, save
// The block structure, the comparison task and the feature task's third step follow the 22 Oct meeting:
// tasks of one kind together, and the same information as in Study 2 (a room already seen, then alternatives).
// The 8-room warm-up was removed (the tutorial is enough).
//
// Ratings are ranges on a -50 (strongly dislike) to +50 (strongly like) scale. When a room is rated again,
// the earlier answer is shown faintly.
//
// URL options:
//   ?debug=1   short version (one task per block, no waiting)
//   ?viz=1     split screen: the task on the left; on the right, the model follows your answers
//              (starts at the first block; add &full=1 to include the introduction)
//   ?seed=123  fixes the randomisation
import { Room, FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES } from "./room.js";

// ---------------------------------------------------------------- settings
const CONFIG = {
  saveUrl: "",             // if set, the data are POSTed here as JSON at the end
  completionUrl: "",       // if set, a link back to the recruitment site is shown at the end
  minFeatureViewMs: 5000,  // each feature screen must be looked at for at least this long
  minRoomViewMs: 3000,     // each screen with room images must be looked at for at least this long
  // Tasks per block. To be fixed after the pilot (22 Oct). At most 4 single, 4 comparison, 8 feature.
  counts: { single: 4, preference: 4, feature: 8 },
  prefAlternatives: [1, 1, 2, 2],  // other rooms per comparison task: 1 = two rooms in all, 2 = three rooms
  featureStep3: "options",         // "options": the original room and pictures of the three options;
                                   // "rooms": the original room and the three changed rooms in full
  featurePick: true,               // feature tasks end with "which do you like best?"
  blockOrder: "random",            // "random", or a fixed order such as "preference,feature,single"
  optionCheck: true,               // after the options screens, name one option per feature
};
const QUESTION = "How much do you think you like this room?";
const HINT = "Give the lowest and highest rating you think you could end up giving it.";
const SCALE = [[-50, "Strongly dislike"], [-25, "Dislike"], [0, "Neutral"], [25, "Like"], [50, "Strongly like"]];

// Rooms are written as option labels 1-4 for (furniture, lighting, wall, decor). Which real option
// is "1", "2", ... is shuffled for each participant below.
// Each set of 4 rooms uses every option once; no room is used in two blocks.
const SINGLE_ROOMS = ["1111", "2343", "3424", "4232"];
const PREF_ROOMS = ["1334", "2122", "3241", "4413"];
const FEATURE_ROOMS = ["1223", "2431", "3312", "4144", "1442", "2214", "3133", "4321"];   // each option twice

// The room `code` moved on by `step` options in the features `feats` (0-based). Same as shift() in Julia.
function change(code, feats, step) { return code.split("").map((d, f) => (feats.includes(f) ? String(((Number(d) - 1 + step) % 4) + 1) : d)).join(""); }
const shared = (a, b) => [...a].filter((d, i) => d === b[i]).length;

// Tasks in design order. t is 0-based.
function singleQuery(code, t) {
  const f = t % 4, g = (k) => (f + k) % 4;
  return { kind: "single", design: t + 1, shown: [code],
    neighbours: [change(code, [f], 1), change(code, [g(1), g(2)], 2), change(code, [f, g(1), g(2)], 3), change(code, [0, 1, 2, 3], 2)] };
}
// A comparison: the original room, then 1 or 2 other rooms, each sharing 2 options with it.
function prefQuery(code, t) {
  const f = t % 4, g = (k) => (f + k) % 4, k = CONFIG.prefAlternatives[t % CONFIG.prefAlternatives.length];
  const alternatives = [change(code, [f, g(1)], 1), change(code, [g(2), g(3)], 1)].slice(0, k);
  return { kind: "preference", design: t + 1, original: code, alternatives, shown: [code, ...alternatives] };
}
function featureQuery(code, t) {
  const f = t % 4;
  const variants = [1, 2, 3, 4].filter((v) => String(v) !== code[f]).map((v) => code.slice(0, f) + v + code.slice(f + 1));
  return { kind: "feature", design: t + 1, feature: FEATURES[f], f, base: code, variants, shown: [code, ...variants] };
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

// Blocks: one kind of task each, tasks in a random order within the block, blocks in a random order.
const BLOCK_KINDS = ["single", "preference", "feature"];
function makeBlocks() {
  const n = (kind) => (DEBUG ? 1 : CONFIG.counts[kind]);
  const tasks = {
    single: shuffle(SINGLE_ROOMS.map(singleQuery)).slice(0, n("single")),
    preference: shuffle(PREF_ROOMS.map(prefQuery)).slice(0, n("preference")),
    feature: shuffle(FEATURE_ROOMS.map(featureQuery)).slice(0, n("feature")),
  };
  const order = CONFIG.blockOrder === "random" ? shuffle(BLOCK_KINDS) : CONFIG.blockOrder.split(",").map((x) => x.trim());
  return order.filter((kind) => tasks[kind]?.length).map((kind) => ({ kind, tasks: tasks[kind] }));
}
const blocks = makeBlocks();

// The same sequence as "events" (what is on screen, what gives a new impression), for the graphs and the model
// code. A comparison or a feature task is two events: the first room on its own, then the rest of the task,
// where the first room is on screen again but is not a new impression (read = false).
const EVENTS = blocks.flatMap((b) => b.tasks.flatMap((q) => {
  if (q.kind === "single") return [{ kind: "single", block: b.kind, shown: q.shown, read: [true], neighbours: q.neighbours }];
  const first = q.shown[0], rest = q.shown.slice(1);
  return [{ kind: "base", block: b.kind, shown: [first], read: [true], neighbours: [] },
          { kind: q.kind, block: b.kind, feature: q.feature, shown: q.shown, read: [false, ...rest.map(() => true)], neighbours: [] }];
}));

const data = {
  study: "study1", version: 5, seed, debug: DEBUG, viz: VIZ, config: CONFIG, scale: [-50, 50],
  participant: params.get("PROLIFIC_PID") || params.get("pid") || `anon-${seed}`,
  urlParams: Object.fromEntries(params), userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(), mapping,
  blockOrder: blocks.map((b) => b.kind),
  practice: null, check: [], features: [], optionCheck: [], events: [], records: [], comments: "", finishedAt: null,
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
function describeText(options) {
  const parts = FEATURES.map((f) => DESCRIPTIONS[options[f]]);
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
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

const PARTS = 1 + blocks.length;   // part 1: the options; then one part per block
async function features() {
  const intro = newCard(`Part 1 of ${PARTS}`);
  intro.append(el("h2", { text: "The choices" }),
    el("p", { text: "First you will see the four choices for each part of the room, shown in a plain grey room. Please look at them carefully. There is nothing to answer." }));
  await nextButton(intro);
  for (const [i, f] of shuffle(FEATURES).entries()) {
    setProgress(0.03 + 0.1 * (i / 4));
    const card = newCard(`Part 1 of ${PARTS} · ${i + 1} of 4`, { wide: true });
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

// A short check that the options were looked at (people skimmed these screens on 15 Oct): one option per feature,
// shown on its own; which one is it? A wrong answer is corrected and the next question follows.
async function optionCheck() {
  for (const [i, f] of shuffle(FEATURES).entries()) {
    const option = LEVELS[f][Math.floor(random() * 4)];
    const card = newCard(`Part 1 of ${PARTS} · Check ${i + 1} of 4`);
    card.append(el("h2", { text: `Which kind of ${FEATURE_NAMES[f].toLowerCase()} is this?` }));
    const room = new Room(roomView(card)); room.showOption(f, option); openRooms.push(room);
    const box = el("div", { class: "choices" });
    for (const o of shuffle(LEVELS[f])) box.append(el("label", {}, el("input", { type: "radio", name: "opt", value: o }), ` ${DESCRIPTIONS[o]}`));
    card.append(box);
    const pick = () => box.querySelector("input:checked")?.value ?? null;
    const ms = await nextButton(card, { ready: () => (pick() ? true : "Please choose one.") });
    const ok = pick() === option;
    data.optionCheck.push({ feature: f, option, answer: pick(), ok, ms }); backup();
    if (!ok) {
      const again = newCard(`Part 1 of ${PARTS} · Check ${i + 1} of 4`);
      again.append(el("p", { text: `Not quite: that was ${DESCRIPTIONS[option]}.` }));
      const r2 = new Room(roomView(again)); r2.showOption(f, option); openRooms.push(r2);
      await nextButton(again);
    }
  }
}

// ---------------------------------------------------------------- recording
// One record per rated room per event, in the layout the model code reads (fromrecords in study1_short.jl).
// Roles: "shown" (a new impression on this screen), "original" (the first room of a comparison or feature task,
// on screen again), "neighbour" (rated from text after a single room).
function record(ev, kind, rows, picked, onScreen) {
  const block = EVENTS[ev]?.block ?? kind;
  for (const r of rows) data.records.push({ event: ev + 1, block, kind, room: r.room, role: r.role, read: r.read, onScreen, before: r.before, after: r.after, picked });
  data.events.push({ event: ev + 1, block, kind, rows, picked, onScreen }); backup();
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

// The first room of a comparison or feature task: seen as an image, rated once.
async function firstRoom(code, step, hint, heading) {
  const options = roomOptions(code), ev = nextEvent();
  viz?.goTo(ev, "see");
  const card = newCard(step);
  card.append(el("h2", { text: heading }));
  const room = new Room(roomView(card), options); openRooms.push(room);
  card.append(describe(options), el("p", { class: "hint-line", text: HINT }));
  const s = slider(card, code);
  const ms = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s), hint });
  const after = remember(code, s.value());
  record(ev, "base", [{ room: code, role: "shown", read: true, before: null, after, msAfter: ms }], code, 1);
  return after;
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

async function preferenceTask(q, step, hint) {
  const orig = q.original, alts = q.alternatives, k = alts.length;
  const origOpts = roomOptions(orig), altOpts = alts.map(roomOptions);
  const label = (i) => (k === 1 ? "The other room" : `Room ${LETTERS[i]}`);

  // 1. One room, as an image.
  const first = await firstRoom(orig, step, hint, "A room");

  // 2. The other room(s), as text only, all at once.
  const ev = nextEvent(); viz?.goTo(ev, "before");
  let card = newCard(`${step} · ${k === 1 ? "Another room" : "Other rooms"}`, { wide: k > 1 });
  card.append(el("h2", { text: k === 1 ? "Here is another room" : `Here are ${k} other rooms` }),
    el("p", { class: "hint-line", text: `For comparison, the room you just rated had ${describeText(origOpts)}.` }),
    el("p", { class: "hint-line", text: HINT }));
  let grid = el("div", { class: k === 1 ? "" : "row-grid two" }); card.append(grid);
  let sliders = alts.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: label(i) }), describe(altOpts[i]));
    grid.append(cell); return slider(cell, code);
  });
  const msBefore = await nextButton(card, { ready: answered(...sliders), hint, label: k === 1 ? "See it" : "See them" });
  const before = sliders.map((s, i) => remember(alts[i], s.value()));

  // 3. All of them as images, the first room included; every room rated again.
  viz?.goTo(ev, "see");
  card = newCard(`${step} · The rooms`, { wide: true });
  card.append(el("h2", { text: k === 1 ? "The two rooms" : `The ${k + 1} rooms` }), el("p", { class: "hint-line", text: HINT }));
  grid = el("div", { class: `row-grid ${k === 1 ? "two" : "three"}` }); card.append(grid);
  const cellFor = (code, opts, name) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: name }));
    const room = new Room(roomView(cell), opts); openRooms.push(room);
    cell.append(describe(opts)); grid.append(cell); return slider(cell, code);
  };
  const sOrig = cellFor(orig, origOpts, "The first room");
  sliders = alts.map((code, i) => cellFor(code, altOpts[i], label(i)));
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(sOrig, ...sliders), hint });
  const rows = [{ room: orig, role: "original", shared: 4, read: false, before: first, after: remember(orig, sOrig.value()), msAfter },
    ...alts.map((code, i) => ({ room: code, role: "shown", shared: shared(code, orig), read: true, before: before[i], after: remember(code, sliders[i].value()), msBefore, msAfter }))];
  const mids = rows.map((r) => (r.after[0] + r.after[1]) / 2);
  record(ev, "preference", rows, rows[mids.indexOf(Math.max(...mids))].room, k + 1);   // picked: the one rated highest
}

async function featureRooms(q, step, hint) {
  const f = q.feature, fname = FEATURE_NAMES[f].toLowerCase(), fixed = FEATURES.filter((x) => x !== f);
  const base = q.base, baseOpts = roomOptions(base);
  const versions = shuffle(q.variants), vOpts = versions.map(roomOptions);

  // 1. One room, as an image.
  await firstRoom(base, step, hint, "A room");

  // 2. Three versions with a different option for one feature, as text.
  const ev = nextEvent(); viz?.goTo(ev, "before");
  let card = newCard(`${step} · Three versions`, { wide: true });
  card.append(el("h2", { text: `Three versions of this room with different ${fname}` }),
    el("p", { text: "Everything else stays the same:" }), describe(baseOpts, fixed), el("p", { class: "hint-line", text: HINT }));
  let grid = el("div", { class: "row-grid three" }); card.append(grid);
  let sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }), describe(vOpts[i], [f]));
    grid.append(cell); return slider(cell, code);
  });
  const msBefore = await nextButton(card, { ready: answered(...sliders), hint, label: "See them" });
  const before = sliders.map((s, i) => remember(versions[i], s.value()));

  // 3. The original room again, with pictures of the three options (or, with featureStep3 = "rooms", the three
  //    changed rooms in full). The versions are rated again; then, optionally, the best of the four is picked.
  viz?.goTo(ev, "see");
  const asOptions = CONFIG.featureStep3 === "options";
  card = newCard(`${step} · The versions`, { wide: true });
  card.append(el("h2", { text: asOptions ? `The room, and what the three other kinds of ${fname} look like` : `The original room and three versions with different ${fname}` }),
    el("p", { class: "hint-line", text: asOptions ? `Each version is the room on the left with that ${fname} instead. Rate each version again.` : "Rate each version again." }));
  grid = el("div", { class: "row-grid four" }); card.append(grid);
  const orig = el("div", { class: "cell original" }, el("div", { class: "room-label", text: "Original" }));
  const r0 = new Room(roomView(orig), baseOpts); openRooms.push(r0);
  orig.append(describe(baseOpts, [f]), el("p", { class: "hint-line", text: "You rated this room." }));
  grid.append(orig);
  sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }));
    const room = new Room(roomView(cell)); openRooms.push(room);
    if (asOptions) room.showOption(f, vOpts[i][f]); else room.set(vOpts[i]);
    cell.append(describe(vOpts[i], [f])); grid.append(cell); return slider(cell, code, "");
  });
  let picked = () => null;
  if (CONFIG.featurePick) {
    const choice = el("div", { class: "choices pick" }, el("p", { class: "question", text: "Which of the four do you like best?" }));
    [base, ...versions].forEach((code, i) => choice.append(el("label", {}, el("input", { type: "radio", name: "best", value: code }), i === 0 ? " Original" : ` Version ${LETTERS[i - 1]}`)));
    choice.addEventListener("change", (e) => viz?.pick(e.target.value));
    card.append(choice);
    picked = () => choice.querySelector("input:checked")?.value ?? null;
  }
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, hint,
    ready: () => (answered(...sliders)() !== true ? answered(...sliders)() : !CONFIG.featurePick || picked() ? true : "Please pick the room you like best.") });
  const rows = versions.map((code, i) => ({ room: code, role: "shown", shared: 3, read: true, position: LETTERS[i], before: before[i], after: remember(code, sliders[i].value()), msBefore, msAfter }));
  let best = picked();
  if (!best) { const mids = rows.map((r) => (r.after[0] + r.after[1]) / 2); best = rows[mids.indexOf(Math.max(...mids))].room; }
  record(ev, "feature", rows, best, 4);
}

const BLOCK_INTRO = {
  single: { title: "Rooms one at a time",
    text: "In each task you read the description of a room and rate it, then see the room and rate it again. Then you rate a few other rooms from their descriptions only." },
  preference: { title: "Comparing rooms",
    text: "In each task you see a room and rate it. Then you read about one or two other rooms and rate them. Then you see all of them together, the first room included, and rate them again." },
  feature: { title: "Changing one thing",
    text: "In each task you see a room and rate it. Then you read about three versions of it that change one thing, for example the lighting, and rate them. Then you see what those options look like and rate the versions again." },
};
async function runBlocks() {
  const total = blocks.reduce((n, b) => n + b.tasks.length, 0);
  let done = 0;
  for (const [bi, b] of blocks.entries()) {
    const step = `Part ${bi + 2} of ${PARTS}`;
    const intro = newCard(step);
    intro.append(el("h2", { text: BLOCK_INTRO[b.kind].title }),
      el("p", { text: `${BLOCK_INTRO[b.kind].text} There are ${b.tasks.length} tasks in this part.` }));
    await nextButton(intro);
    for (const [i, q] of b.tasks.entries()) {
      const hint = `Task ${i + 1} of ${b.tasks.length}`;
      setProgress(0.15 + 0.83 * (done / total));
      if (q.kind === "single") await singleRoom(q, step, hint);
      else if (q.kind === "preference") await preferenceTask(q, step, hint);
      else await featureRooms(q, step, hint);
      done++;
    }
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
  const { createViz } = await import("./study1_viz.js?v=9");
  viz = createViz(panel, { queries: EVENTS, mapping });
}
if (FULL) {
  await welcome();
  await instructions();
  await check();
  await practice();
  await features();
  if (CONFIG.optionCheck) await optionCheck();
}
await runBlocks();
await finish();
