// Study 1: what do people learn about their own preferences from seeing rooms?
// Design as of 2 Nov 2026 (changes from the 22 Oct and 29 Oct meetings).
//
// Flow:  welcome -> instructions -> comprehension check -> slider practice
//        -> the options, one screen per feature (4 options each) -> a short check on the options
//        -> three blocks, in a random order (one kind of task per block):
//             single rooms   rate from text -> see the room, rate again -> rate 4 similar rooms from text
//                            (sharing 3, 2, 1 and 0 options with it), with the room seen kept on screen
//             comparisons    see a room, rate it -> read 1 or 2 other rooms, rate them (the first room on screen)
//                            -> see them all, including the first room again, rate them again
//             feature tasks  (a reminder of all the options first)
//                            see a room, rate it -> read 3 versions that change one feature, rate them
//                            -> the room again, with each of the three options shown on its own; rate the
//                               versions again (your rating of the room is marked on each scale); pick the best
//        -> comments, save
// 29 Oct meeting: keep the room already seen on screen, so people know where they are and what they said;
// show each option on its own (in the same place, everything else taken away) so the change is easy to picture;
// remind people of the options before the feature tasks; question above the scale, instructions below it;
// URL options to jump to a block; save the data to a server.
//
// Ratings are ranges on a -50 (strongly dislike) to +50 (strongly like) scale. When a room is rated again,
// the earlier answer is shown faintly.
//
// URL options:
//   ?block=feature        run only these blocks, in this order, without the introduction
//                         (e.g. ?block=preference,single; add &full=1 to keep the introduction)
//   ?tasks=2              tasks per block (for testing)
//   ?wording=90           ask for a range people are "90% sure" about, instead of "lowest and highest"
//   ?debug=1              short version (one task per block, no waiting)
//   ?viz=1                split screen: the task on the left; on the right, the model follows your answers
//                         (starts at the first block; add &full=1 to include the introduction)
//   ?seed=123             fixes the randomisation
//   ?PROLIFIC_PID=... or ?pid=...   the participant's ID (otherwise a random one is made)
import { FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES, ROOM_SETTINGS, roomPicture } from "./room.js";

// ---------------------------------------------------------------- settings
const CONFIG = {
  // Saving. dataPipeId: the experiment ID from pipe.jspsych.org (DataPipe saves each participant's file to an
  // OSF project). saveUrl: any other address that accepts the data as JSON (POST). With neither, or if saving
  // fails, people are asked to download their answers.
  dataPipeId: "",
  saveUrl: "",
  completionUrl: "",       // if set, a link back to the recruitment site is shown at the end
  minFeatureViewMs: 5000,  // each options screen must be looked at for at least this long
  minRoomViewMs: 3000,     // each screen with room pictures must be looked at for at least this long
  // Tasks per block. To be fixed after the pilot (22 Oct). At most 4 single, 4 comparison, 8 feature.
  counts: { single: 4, preference: 4, feature: 8 },
  prefAlternatives: [1, 1, 2, 2],  // other rooms per comparison task: 1 = two rooms in all, 2 = three rooms
  featureStep3: "options",         // "options": the original room and each of the three options on its own;
                                   // "rooms": the original room and the three changed rooms in full
  featurePick: true,               // feature tasks end with "which do you like best?" (29 Oct: reason to check)
  featureReminder: true,           // show all the options again before the feature tasks (29 Oct)
  blockOrder: "random",            // "random", or a fixed order such as "preference,feature,single"
  optionCheck: true,               // after the options screens, name one option per feature
  rangeWording: "range",           // "range": lowest and highest you could end up giving; "90": 90% sure
  roomWindow: false,               // a window in the complete rooms (29 Oct: it may distract)
  roomExposure: 0.9,               // brightness of the rooms (29 Oct: too bright at 1)
};

// ---------------------------------------------------------------- participant and randomisation
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const VIZ = params.has("viz");
const ONLY = params.get("block");                  // ?block=feature,single
const FULL = params.has("full") || (!VIZ && !ONLY);
if (params.get("wording")) CONFIG.rangeWording = params.get("wording");
ROOM_SETTINGS.window = CONFIG.roomWindow;
ROOM_SETTINGS.exposure = CONFIG.roomExposure;

const QUESTION = "How much do you think you would like this room?";
const HINT = CONFIG.rangeWording === "90"
  ? "Give a range you are 90% sure your rating would fall in."
  : "Give the lowest and highest rating you think you could end up giving it.";
const SCALE = [[-50, "Strongly dislike"], [-25, "Dislike"], [0, "Neutral"], [25, "Like"], [50, "Strongly like"]];

const seed = Number(params.get("seed")) || Math.floor(Math.random() * 2 ** 31);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = mulberry32(seed);
function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function newId() {
  const bytes = new Uint8Array(6); (window.crypto || window.msCrypto).getRandomValues(bytes);
  return "p-" + Date.now().toString(36) + "-" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

const mapping = Object.fromEntries(FEATURES.map((f) => [f, shuffle(LEVELS[f])]));
const roomOptions = (code) => Object.fromEntries(FEATURES.map((f, i) => [f, mapping[f][Number(code[i]) - 1]]));

// Blocks: one kind of task each, tasks in a random order within the block, blocks in a random order.
const BLOCK_KINDS = ["single", "preference", "feature"];
function makeBlocks() {
  const n = (kind) => (DEBUG ? 1 : Number(params.get("tasks")) || CONFIG.counts[kind]);
  const tasks = {
    single: shuffle(SINGLE_ROOMS.map(singleQuery)).slice(0, n("single")),
    preference: shuffle(PREF_ROOMS.map(prefQuery)).slice(0, n("preference")),
    feature: shuffle(FEATURE_ROOMS.map(featureQuery)).slice(0, n("feature")),
  };
  const order = ONLY ? ONLY.split(",").map((x) => x.trim())
    : CONFIG.blockOrder === "random" ? shuffle(BLOCK_KINDS) : CONFIG.blockOrder.split(",").map((x) => x.trim());
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
  study: "study1", version: 6, seed, debug: DEBUG, viz: VIZ, config: CONFIG, scale: [-50, 50],
  question: QUESTION, hint: HINT,
  participant: params.get("PROLIFIC_PID") || params.get("pid") || newId(),
  urlParams: Object.fromEntries(params), userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(), mapping,
  blockOrder: blocks.map((b) => b.kind),
  practice: null, check: [], features: [], optionCheck: [], reminders: [], events: [], records: [], comments: "", finishedAt: null,
};
const backupKey = `study1-${data.participant}`;
function backup() { try { localStorage.setItem(backupKey, JSON.stringify(data)); } catch (e) { /* carry on */ } }

// ---------------------------------------------------------------- helpers
const screenEl = document.querySelector("#screen");
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, v); }
  node.append(...children);
  return node;
}
// A new screen. `where` says where the person is in the study (shown at the top).
function newCard(where, { wide = false } = {}) {
  screenEl.replaceChildren();
  const card = el("div", { class: wide ? "card wide" : "card" });
  if (where) card.append(el("div", { class: "where", text: where }));
  screenEl.append(card); if (!VIZ) window.scrollTo(0, 0);
  return card;
}
function setProgress(x) { document.querySelector("#progressFill").style.width = `${Math.round(100 * x)}%`; }
function nextButton(card, { label = "Continue", minMs = 0, ready = () => true } = {}) {
  const error = el("div", { class: "error" });
  const button = el("button", { class: "button", text: label });
  card.append(error, el("div", { class: "actions" }, button));
  const shown = performance.now(); const wait = DEBUG || VIZ ? 0 : minMs;
  if (wait > 0) { button.disabled = true; setTimeout(() => { button.disabled = false; }, wait); }
  return new Promise((resolve) => { button.onclick = () => { const p = ready(); if (p !== true) { error.textContent = p; return; } resolve(Math.round(performance.now() - shown)); }; });
}

// A picture of a complete room (options) or of one option on its own ({feature, option}).
function picture(parent, what) {
  const v = el("div", { class: "room-view" }, el("img", { src: roomPicture(what), alt: "" }));
  parent.append(v); return v;
}

// ---------------------------------------------------------------- the range slider
// One line from -50 to +50 with two handles, lowest and highest. Press on the line and drag to set the
// range in one go; afterwards, pressing on the line moves the nearer handle, and the handles can be dragged.
// prev() shows the person's earlier answer faintly; ref() marks another answer (e.g. their rating of the original
// room) in a different colour. onChange(value) is called as the range changes.
const fmt = (v) => (v > 0 ? `+${v}` : `${v}`);
const clampScale = (v) => Math.max(-50, Math.min(50, Math.round(v)));
const pos = (v) => `${v + 50}%`;
function rangeSlider({ question = "", hint = "" } = {}, onChange) {
  const lo = el("input", { type: "range", min: "-50", max: "50", step: "1", value: "0", "aria-label": "lowest" });
  const hi = el("input", { type: "range", min: "-50", max: "50", step: "1", value: "0", "aria-label": "highest" });
  const fill = el("div", { class: "fill" });
  const prevBand = el("div", { class: "prev", hidden: "" });
  const refBand = el("div", { class: "ref", hidden: "" });
  const track = el("div", { class: "track" }, refBand, prevBand, fill, lo, hi);
  const scale = el("div", { class: "scale" }, ...SCALE.map(([v, word], i) =>
    el("span", { class: i === 0 ? "first" : i === SCALE.length - 1 ? "last" : "", style: `left:${pos(v)}` }, el("b", { text: fmt(v) }), el("br"), word)));
  const readout = el("div", { class: "readout" });
  const prevText = el("div", { class: "prev-text", hidden: "" });
  const refText = el("div", { class: "ref-text", hidden: "" });
  const node = el("div", { class: "range untouched" },
    question ? el("div", { class: "question", text: question }) : "", hint ? el("div", { class: "subtitle", text: hint }) : "",
    track, scale, readout, prevText, refText);
  let touched = false, anchor = 0, dragging = false;
  const draw = () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { [a, b] = [b, a]; lo.value = a; hi.value = b; }
    fill.style.left = pos(a); fill.style.width = `${b - a}%`;
    readout.textContent = touched ? (a === b ? `Exactly ${fmt(a)}` : `From ${fmt(a)} to ${fmt(b)}`) : "Press on the line and drag to set your range";
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
    ref(r, label) { if (r) band(refBand, refText, [r.low, r.high], label); },
  };
}
const answered = (...s) => () => (s.every((x) => x.value() !== null) ? true : "Please answer every question by pressing on its line.");
function describe(options, only = FEATURES) {
  return el("table", { class: "description" }, ...only.map((f) =>
    el("tr", {}, el("th", { text: FEATURE_NAMES[f] }), el("td", { text: DESCRIPTIONS[options[f]] }))));
}
const LETTERS = ["A", "B", "C"];
const rangeText = (v) => (v ? `${fmt(v.low)} to ${fmt(v.high)}` : "");

// The latest answer for each room, shown faintly when the room is rated again.
const lastAnswer = {};
function slider(parent, room, { question = QUESTION, hint = HINT } = {}) {
  const s = rangeSlider({ question, hint }, (v) => viz?.live(room, v)); s.prev(lastAnswer[room]); parent.append(s.node); return s;
}
// The question once, above several rooms that each have their own scale.
function questionOnce(card, question = QUESTION) {
  card.append(el("div", { class: "question-once" }, el("div", { class: "question", text: question }), el("div", { class: "subtitle", text: HINT })));
}
const asRange = (v) => (v ? [v.low, v.high] : null);
const remember = (room, v) => { if (v) lastAnswer[room] = v; return asRange(v); };

// The room seen earlier in a task, kept on screen beside what comes next (29 Oct).
function keptRoom(parent, code, label, note = "") {
  const box = el("div", { class: "kept" }, el("div", { class: "room-label", text: label }));
  picture(box, roomOptions(code)); box.append(describe(roomOptions(code)));
  const r = lastAnswer[code];
  if (r) box.append(el("p", { class: "small", text: `${note || "You rated it"} ${rangeText(r)}.` }));
  parent.append(box); return box;
}

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
  const how = CONFIG.rangeWording === "90"
    ? "Give a range that you are 90% sure your rating would fall in. If you are unsure, give a wide range, for example −20 to +30. If you are sure, give a narrow one, or put both handles on the same point."
    : "Give the lowest and highest rating you think you could end up giving the room. If you are unsure, give a wide range, for example −20 to +30. If you are sure, give a narrow one, or put both handles on the same point.";
  card.append(el("h2", { text: "How you will answer" }),
    el("p", { text: "Each room has four things that can vary: the furniture, the lighting, the walls and the wall decor." }),
    el("p", { text: `For every room we ask: "${QUESTION}" You answer on a scale from −50 (strongly dislike) through 0 (neutral) to +50 (strongly like).` }),
    el("p", { text: how }),
    el("p", { text: "Sometimes you will only read a description, and sometimes you will also see the room. When you rate a room again, your earlier answer is shown faintly. Keep it or change it: answer with what you think now." }));
  await nextButton(card);
}

async function check() {
  const qs = [
    { q: "You are completely sure you would rate a room +20. What do you do?", a: ["Put both handles on +20", "Put one handle on −50 and one on +50", "Put one handle on +20 and leave the other"], right: 0 },
    { q: "You have no idea whether you would like a room. What do you do?", a: ["Put both handles on 0", "Give a wide range, for example −40 to +40", "Give a narrow range around 0"], right: 1 },
  ];
  for (let attempt = 1; ; attempt++) {
    const card = newCard("Before you start: a quick check");
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
    const again = newCard("Before you start: a quick check");
    again.append(el("p", { text: "Not quite. The lowest and highest show how sure you are: the same point if you are certain, a wide range if you are unsure. Please try again." }));
    await nextButton(again);
  }
}

async function practice() {
  const card = newCard("Before you start: practice");
  card.append(el("h2", { text: "Try the scale" }), el("p", { text: "Press on the line and drag to set your range. You can then drag either end." }));
  const s = rangeSlider({ question: "How much do you like rainy days?", hint: HINT });
  card.append(s.node);
  const ms = await nextButton(card, { ready: answered(s) });
  data.practice = { ...s.value(), ms };
}

const PARTS = 1 + blocks.length;   // part 1: the options; then one part per block
async function features() {
  const intro = newCard(`Part 1 of ${PARTS}: the options`);
  intro.append(el("h2", { text: "The options" }),
    el("p", { text: "First you will see the four options for each part of the room. Each option is shown on its own, where it would be in the room. Please look at them carefully. There is nothing to answer." }));
  await nextButton(intro);
  for (const [i, f] of shuffle(FEATURES).entries()) {
    setProgress(0.03 + 0.1 * (i / 4));
    const card = newCard(`Part 1 of ${PARTS}: the options · ${i + 1} of 4`, { wide: true });
    card.append(el("h2", { text: `The four kinds of ${FEATURE_NAMES[f].toLowerCase()}` }));
    const grid = el("div", { class: "row-grid" }); card.append(grid);
    const order = shuffle(LEVELS[f]);
    for (const option of order) {
      const cell = el("div", {}); grid.append(cell);
      picture(cell, { feature: f, option });
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
    const card = newCard(`Part 1 of ${PARTS}: the options · check ${i + 1} of 4`);
    card.append(el("h2", { text: `Which kind of ${FEATURE_NAMES[f].toLowerCase()} is this?` }));
    picture(card, { feature: f, option });
    const box = el("div", { class: "choices" });
    for (const o of shuffle(LEVELS[f])) box.append(el("label", {}, el("input", { type: "radio", name: "opt", value: o }), ` ${DESCRIPTIONS[o]}`));
    card.append(box);
    const pick = () => box.querySelector("input:checked")?.value ?? null;
    const ms = await nextButton(card, { ready: () => (pick() ? true : "Please choose one.") });
    const ok = pick() === option;
    data.optionCheck.push({ feature: f, option, answer: pick(), ok, ms }); backup();
    if (!ok) {
      const again = newCard(`Part 1 of ${PARTS}: the options · check ${i + 1} of 4`);
      again.append(el("p", { text: `Not quite: that was ${DESCRIPTIONS[option]}.` }));
      picture(again, { feature: f, option });
      await nextButton(again);
    }
  }
}

// All sixteen options again, one row per feature (before the feature tasks; 29 Oct).
async function reminder(where) {
  const card = newCard(where, { wide: true });
  card.append(el("h2", { text: "A reminder of the options" }),
    el("p", { text: "In this part you will change one thing about a room at a time. Here are all the options again." }));
  const table = el("div", { class: "reminder" }); card.append(table);
  for (const f of FEATURES) {
    const row = el("div", { class: "reminder-row" }, el("div", { class: "reminder-name", text: FEATURE_NAMES[f] }));
    for (const option of LEVELS[f]) {
      const cell = el("div", {}); picture(cell, { feature: f, option });
      cell.append(el("div", { class: "option-name small", text: DESCRIPTIONS[option] })); row.append(cell);
    }
    table.append(row);
  }
  const ms = await nextButton(card, { minMs: CONFIG.minRoomViewMs });
  data.reminders.push({ ms }); backup();
}

// ---------------------------------------------------------------- recording
// One record per rated room per event, in the layout the model code reads (fit6.py).
// Roles: "shown" (a new impression on this screen), "original" (the first room of a comparison or feature task,
// on screen again), "neighbour" (rated from text after a single room).
function record(ev, kind, rows, picked, onScreen) {
  const block = EVENTS[ev]?.block ?? kind;
  for (const r of rows) data.records.push({ event: ev + 1, block, kind, room: r.room, role: r.role, read: r.read, onScreen, before: r.before, after: r.after, picked });
  data.events.push({ event: ev + 1, block, kind, rows, picked, onScreen }); backup();
}

// ---------------------------------------------------------------- the three kinds of task
// After a single room: similar rooms from text, with the room seen kept on screen beside them (29 Oct).
async function rateNeighbours(q, where, ev, rows) {
  const order = shuffle(q.neighbours);
  for (const [i, n] of order.entries()) {
    viz?.goTo(ev, "neighbours", n);
    const card = newCard(`${where} · similar room ${i + 1} of ${order.length}`, { wide: true });
    card.append(el("h2", { text: "A similar room" }),
      el("p", { text: `Now you will read about ${order.length} rooms that are similar to the one you just saw: each keeps some of its features and changes others. You only read about these rooms; you will not see them.` }));
    const cols = el("div", { class: "two-col" }); card.append(cols);
    keptRoom(cols, q.shown[0], "The room you saw");
    const right = el("div", {}, el("div", { class: "room-label", text: "A similar room" }), describe(roomOptions(n)));
    cols.append(right);
    const s = slider(right, n);
    const ms = await nextButton(card, { ready: answered(s) });
    rows.push({ room: n, role: "neighbour", shared: shared(n, q.shown[0]), read: false, before: null, after: remember(n, s.value()), msAfter: ms });
  }
}

// The first room of a comparison or feature task: seen as a picture, rated once.
async function firstRoom(code, where, heading) {
  const options = roomOptions(code), ev = nextEvent();
  viz?.goTo(ev, "see");
  const card = newCard(`${where} · step 1 of 3`);
  card.append(el("h2", { text: heading }));
  picture(card, options);
  card.append(describe(options));
  const s = slider(card, code);
  const ms = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s) });
  const after = remember(code, s.value());
  record(ev, "base", [{ room: code, role: "shown", read: true, before: null, after, msAfter: ms }], code, 1);
  return after;
}

async function singleRoom(q, where) {
  const code = q.shown[0], options = roomOptions(code), ev = nextEvent();
  viz?.goTo(ev, "before");
  let card = newCard(`${where} · the room`);
  card.append(el("h2", { text: "A room with:" }), describe(options));
  let s = slider(card, code);
  const msBefore = await nextButton(card, { ready: answered(s), label: "See the room" });
  const before = remember(code, s.value());

  viz?.goTo(ev, "see");
  card = newCard(`${where} · the room`);
  card.append(el("h2", { text: "Here is the room" }));
  picture(card, options);
  card.append(describe(options));
  s = slider(card, code);
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s) });
  const rows = [{ room: code, role: "shown", shared: 4, read: true, before, after: remember(code, s.value()), msBefore, msAfter }];
  await rateNeighbours(q, where, ev, rows);
  record(ev, "single", rows, code, 1);
}

async function preferenceTask(q, where) {
  const orig = q.original, alts = q.alternatives, k = alts.length;
  const origOpts = roomOptions(orig), altOpts = alts.map(roomOptions);
  const label = (i) => (k === 1 ? "The other room" : `Room ${LETTERS[i]}`);

  // 1. One room, as a picture.
  const first = await firstRoom(orig, where, "A room");

  // 2. The other room(s), as text only, all at once, with the first room kept on screen.
  const ev = nextEvent(); viz?.goTo(ev, "before");
  let card = newCard(`${where} · step 2 of 3`, { wide: true });
  card.append(el("h2", { text: k === 1 ? "Another room" : "Two other rooms" }),
    el("p", { text: `You will read about ${k === 1 ? "another room" : "two other rooms"} and rate ${k === 1 ? "it" : "them"}. Then you will see all the rooms together.` }));
  const cols = el("div", { class: "two-col" }); card.append(cols);
  keptRoom(cols, orig, "The room you saw");
  const right = el("div", {}); cols.append(right);
  questionOnce(right);
  let sliders = alts.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: label(i) }), describe(altOpts[i]));
    right.append(cell); return slider(cell, code, { question: "", hint: "" });
  });
  const msBefore = await nextButton(card, { ready: answered(...sliders), label: k === 1 ? "See it" : "See them" });
  const before = sliders.map((s, i) => remember(alts[i], s.value()));

  // 3. All of them as pictures, the first room included; every room rated again.
  viz?.goTo(ev, "see");
  card = newCard(`${where} · step 3 of 3`, { wide: true });
  card.append(el("h2", { text: k === 1 ? "The two rooms" : `The ${k + 1} rooms` }));
  questionOnce(card);
  const grid = el("div", { class: `row-grid ${k === 1 ? "two" : "three"}` }); card.append(grid);
  const cellFor = (code, opts, name) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: name }));
    picture(cell, opts); cell.append(describe(opts)); grid.append(cell); return slider(cell, code, { question: "", hint: "" });
  };
  const sOrig = cellFor(orig, origOpts, "The first room");
  sliders = alts.map((code, i) => cellFor(code, altOpts[i], label(i)));
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(sOrig, ...sliders) });
  const rows = [{ room: orig, role: "original", shared: 4, read: false, before: first, after: remember(orig, sOrig.value()), msAfter },
    ...alts.map((code, i) => ({ room: code, role: "shown", shared: shared(code, orig), read: true, before: before[i], after: remember(code, sliders[i].value()), msBefore, msAfter }))];
  const mids = rows.map((r) => (r.after[0] + r.after[1]) / 2);
  record(ev, "preference", rows, rows[mids.indexOf(Math.max(...mids))].room, k + 1);   // picked: the one rated highest
}

async function featureRooms(q, where) {
  const f = q.feature, fname = FEATURE_NAMES[f].toLowerCase(), fixed = FEATURES.filter((x) => x !== f);
  const base = q.base, baseOpts = roomOptions(base);
  const versions = shuffle(q.variants), vOpts = versions.map(roomOptions);

  // 1. One room, as a picture.
  await firstRoom(base, where, "A room");
  const baseRating = lastAnswer[base];

  // 2. Three versions with a different option for one feature, as text, with the room kept on screen.
  const ev = nextEvent(); viz?.goTo(ev, "before");
  let card = newCard(`${where} · step 2 of 3`, { wide: true });
  card.append(el("h2", { text: `Three versions of this room with different ${fname}` }));
  const cols = el("div", { class: "two-col" }); card.append(cols);
  keptRoom(cols, base, "The room you saw");
  const right = el("div", {}); cols.append(right);
  right.append(el("p", { text: `Each version is the room you saw with different ${fname}. Everything else stays the same.` }));
  questionOnce(right);
  let sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }), describe(vOpts[i], [f]));
    right.append(cell); return slider(cell, code, { question: "", hint: "" });
  });
  const msBefore = await nextButton(card, { ready: answered(...sliders), label: "See them" });
  const before = sliders.map((s, i) => remember(versions[i], s.value()));

  // 3. The original room again, large, and below it each of the three options on its own (29 Oct), or with
  //    featureStep3 = "rooms" the three changed rooms in full. The versions are rated again, with the rating of
  //    the original marked on each scale; then, optionally, the best of the four is picked.
  viz?.goTo(ev, "see");
  const asOptions = CONFIG.featureStep3 === "options";
  card = newCard(`${where} · step 3 of 3`, { wide: true });
  card.append(el("h2", { text: asOptions ? `The room, and the three other kinds of ${fname}` : `The room and three versions with different ${fname}` }));
  const top = el("div", { class: "original-top" }, el("div", { class: "room-label", text: "The room" }));
  picture(top, baseOpts);
  top.append(describe(baseOpts), el("p", { class: "small", text: `You rated it ${rangeText(baseRating)}.` }));
  card.append(top);
  card.append(el("p", { text: asOptions
    ? `Each version below is this room with different ${fname}. The pictures show only the ${fname}, where it would be in the room; everything else stays as above. Rate each version again.`
    : "Rate each version again." }));
  questionOnce(card);
  const grid = el("div", { class: "row-grid three" }); card.append(grid);
  sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }));
    picture(cell, asOptions ? { feature: f, option: vOpts[i][f] } : vOpts[i]);
    cell.append(describe(vOpts[i], [f])); grid.append(cell);
    const s = slider(cell, code, { question: "", hint: "" });
    s.ref(baseRating, "Your rating of the room above"); return s;
  });
  let picked = () => null;
  if (CONFIG.featurePick) {
    const choice = el("div", { class: "choices pick" }, el("p", { class: "question", text: "Which of the four do you like best?" }));
    [base, ...versions].forEach((code, i) => choice.append(el("label", {}, el("input", { type: "radio", name: "best", value: code }), i === 0 ? " The room above" : ` Version ${LETTERS[i - 1]}`)));
    choice.addEventListener("change", (e) => viz?.pick(e.target.value));
    card.append(choice);
    picked = () => choice.querySelector("input:checked")?.value ?? null;
  }
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs,
    ready: () => (answered(...sliders)() !== true ? answered(...sliders)() : !CONFIG.featurePick || picked() ? true : "Please pick the room you like best.") });
  const rows = versions.map((code, i) => ({ room: code, role: "shown", shared: 3, read: true, position: LETTERS[i], before: before[i], after: remember(code, sliders[i].value()), msBefore, msAfter }));
  let best = picked();
  if (!best) { const mids = rows.map((r) => (r.after[0] + r.after[1]) / 2); best = rows[mids.indexOf(Math.max(...mids))].room; }
  record(ev, "feature", rows, best, 4);
}

const BLOCK_INTRO = {
  single: { title: "Rooms one at a time",
    text: "In each task you read the description of a room and rate it, then see the room and rate it again. Then you read about a few similar rooms and rate them; the room you saw stays on the screen." },
  preference: { title: "Comparing rooms",
    text: "In each task you see a room and rate it. Then you read about one or two other rooms and rate them. Then you see all of them together, the first room included, and rate them again." },
  feature: { title: "Changing one thing",
    text: "In each task you see a room and rate it. Then you read about three versions of it that change one thing, for example the lighting, and rate them. Then you see each new option on its own and rate the versions again." },
};
async function runBlocks() {
  const total = blocks.reduce((n, b) => n + b.tasks.length, 0);
  let done = 0;
  for (const [bi, b] of blocks.entries()) {
    const part = `Part ${bi + 2} of ${PARTS}: ${BLOCK_INTRO[b.kind].title.toLowerCase()}`;
    const intro = newCard(part);
    intro.append(el("h2", { text: BLOCK_INTRO[b.kind].title }),
      el("p", { text: `${BLOCK_INTRO[b.kind].text} There are ${b.tasks.length} tasks in this part.` }));
    await nextButton(intro);
    if (b.kind === "feature" && CONFIG.featureReminder) await reminder(part);
    for (const [i, q] of b.tasks.entries()) {
      const where = `${part} · task ${i + 1} of ${b.tasks.length}`;
      setProgress(0.15 + 0.83 * (done / total));
      if (q.kind === "single") await singleRoom(q, where);
      else if (q.kind === "preference") await preferenceTask(q, where);
      else await featureRooms(q, where);
      done++;
    }
  }
}

// ---------------------------------------------------------------- saving
// DataPipe (pipe.jspsych.org) stores one file per participant in an OSF project; saveUrl is any other endpoint.
async function save() {
  const body = JSON.stringify(data);
  if (CONFIG.dataPipeId) {
    try {
      const res = await fetch("https://pipe.jspsych.org/api/data/", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify({ experimentID: CONFIG.dataPipeId, filename: `${data.participant}.json`, data: body }),
      });
      if (res.ok) return true;
    } catch (e) { /* fall through */ }
  }
  if (CONFIG.saveUrl) {
    try { if ((await fetch(CONFIG.saveUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body })).ok) return true; } catch (e) { /* fall through */ }
  }
  return false;
}

async function finish() {
  setProgress(0.98);
  const card = newCard();
  const comments = el("textarea", { class: "comments", placeholder: "Optional" });
  card.append(el("h2", { text: "Almost done" }), el("p", { text: "Is there anything you would like to tell us about the study? For example, was anything unclear?" }), comments);
  await nextButton(card, { label: "Finish" });
  data.comments = comments.value.trim(); data.finishedAt = new Date().toISOString();
  backup();

  const sending = newCard(); sending.append(el("p", { text: "Saving your answers…" }));
  const trying = Boolean(CONFIG.dataPipeId || CONFIG.saveUrl);
  const saved = trying ? await save() : false;
  data.saved = saved; backup();
  setProgress(1);
  const done = newCard(); done.append(el("h1", { text: "Thank you" }));
  const file = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const download = el("a", { class: "button", href: URL.createObjectURL(file), download: `study1-${data.participant}.json`, text: "Download my answers" });
  if (saved) done.append(el("p", { text: "Your answers have been saved." }));
  else done.append(el("p", { text: trying ? "Your answers could not be sent. Please download them and send the file to the researcher." : "Please download your answers and send the file to the researcher." }), download);
  if (CONFIG.completionUrl) done.append(el("p", {}, el("a", { href: CONFIG.completionUrl, text: "Click here to complete the study." })));
}

// ---------------------------------------------------------------- run
window.study1 = data;
if (VIZ) {
  document.body.classList.add("viz");
  const panel = document.querySelector("#vizPanel");
  const { createViz } = await import("./study1_viz.js?v=11");
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
