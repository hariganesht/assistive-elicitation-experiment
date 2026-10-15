// Study 1: what do people learn about their own preferences from seeing rooms?
// Design as of 15 Oct 2026. The queries are the same as QUERIES in study1_all.jl:
//   [single_queries(); feature_queries(:liked; n = 8); pair_queries(4)]
//
// Flow:  welcome -> instructions (lowest/highest explained) -> comprehension check -> slider practice
//        -> the options, one screen per feature (4 options each)
//        -> 20 queries in a random order:
//             8 single rooms   rate from text -> see the room, rate again -> rate 3 neighbours from text
//             8 feature        a room they have seen + 3 versions changing one feature: rate from text ->
//                              see all four, rate again, pick the best
//             4 comparison     two rooms: rate both from text -> see both, rate again -> rate 1 neighbour
//        -> comments, save
//
// URL options:
//   ?debug=1   short version (one query of each kind, no waiting)
//   ?viz=1     split screen: the task on the left, a simulated person's beliefs on the right
//              (starts at the queries; add &full=1 to include the introduction)
//   ?seed=123  fixes the randomisation (and the simulated person in viz mode)
import { Room, FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES } from "./room.js";

// ---------------------------------------------------------------- settings
const CONFIG = {
  saveUrl: "",             // if set, the data are POSTed here as JSON at the end
  completionUrl: "",       // if set, a link back to the recruitment site is shown at the end
  minFeatureViewMs: 5000,  // each feature screen must be looked at for at least this long
  minRoomViewMs: 3000,     // each room screen must be looked at for at least this long
  featureVersion: "liked", // feature queries start from a room already seen ("liked"); "new" is the other version
};
const QUESTION = "On a scale of 0 to 100, how much do you think you like this room?";

// Rooms are written as option labels 1-4 for (furniture, lighting, wall, decor). Which real option
// is "1", "2", ... is shuffled for each participant below.
const SEEN = ["1111", "1223", "2343", "2431", "3312", "3424", "4144", "4232"];
const OA16 = ["1111", "1223", "1334", "1442", "2122", "2214", "2343", "2431", "3133", "3241", "3312", "3424", "4144", "4232", "4321", "4413"];

// The room `code` moved on by `step` options in the features `feats` (0-based). Same as change() in Julia.
function change(code, feats, step) { return code.split("").map((d, f) => (feats.includes(f) ? String(((Number(d) - 1 + step) % 4) + 1) : d)).join(""); }
const shared = (a, b) => [...a].filter((d, i) => d === b[i]).length;

// The 20 queries, in design order. t is 0-based.
function singleQuery(code, t) {
  const f = t % 4, g = (k) => (f + k) % 4;
  return { kind: "single", design: t + 1, shown: [code], read: [true], neighbours: [change(code, [f], 1), change(code, [g(1), g(2)], 2), change(code, [f, g(1), g(2)], 3)] };
}
function featureQuery(code, t) {
  const f = t % 4;
  const variants = [1, 2, 3, 4].filter((v) => String(v) !== code[f]).map((v) => code.slice(0, f) + v + code.slice(f + 1));
  return { kind: "feature", design: t + 1, feature: FEATURES[f], f, base: code, shown: [code, ...variants], read: [CONFIG.featureVersion === "new", true, true, true], neighbours: [] };
}
function pairQuery(t) {
  const a = OA16[2 * t], b = OA16[2 * t + 1];
  return { kind: "pair", design: t + 1, shown: [a, b], read: [true, true], neighbours: [change(a, [t % 4], 1)] };
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

// Random order, except that each feature query comes after the single query that showed its base room
// (its base room is one they have already seen).
function makeOrder() {
  let all = [...SEEN.map(singleQuery), ...SEEN.map(featureQuery), ...[0, 1, 2, 3].map(pairQuery)];
  if (DEBUG) all = [all[0], all[8], all[16]];
  let order = shuffle(all);
  if (CONFIG.featureVersion === "liked") {
    for (const q of order.filter((x) => x.kind === "feature")) {
      const iSingle = order.findIndex((x) => x.kind === "single" && x.shown[0] === q.base);
      const iFeat = order.indexOf(q);
      if (iSingle > iFeat) {
        order.splice(iFeat, 1);
        const at = iSingle + Math.floor(random() * (order.length - iSingle + 1));   // anywhere after the single query
        order.splice(Math.max(at, iSingle), 0, q);
      }
    }
  }
  return order;
}
const queryOrder = makeOrder();

const data = {
  study: "study1", version: 3, seed, debug: DEBUG, viz: VIZ, config: CONFIG,
  participant: params.get("PROLIFIC_PID") || params.get("pid") || `anon-${seed}`,
  urlParams: Object.fromEntries(params), userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(), mapping,
  practice: null, check: [], features: [], queries: [], records: [], comments: "", finishedAt: null,
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
function newCard(step) {
  openRooms.forEach((r) => r.dispose()); openRooms = [];
  screenEl.replaceChildren();
  const card = el("div", { class: "card" });
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

// One slider with two handles, lowest and highest, on a visible 0-100 scale. Nothing is shown until
// the participant clicks on the line; the first click puts both handles there.
// In viz mode, ghost() draws the simulated person's answer under the line and fillWith() copies it.
function rangeSlider(question) {
  const lo = el("input", { type: "range", min: "0", max: "100", step: "1", value: "50", "aria-label": "lowest" });
  const hi = el("input", { type: "range", min: "0", max: "100", step: "1", value: "50", "aria-label": "highest" });
  const fill = el("div", { class: "fill" });
  const ghostBand = el("div", { class: "ghost", hidden: "" });
  const track = el("div", { class: "track" }, ghostBand, fill, lo, hi);
  const readout = el("div", { class: "readout" });
  const ghostText = el("div", { class: "ghost-text", hidden: "" });
  const node = el("div", { class: "range untouched" }, question ? el("div", { class: "question", text: question }) : "", track,
    el("div", { class: "scale" }, ...[0, 25, 50, 75, 100].map((v) => el("span", { text: String(v) }))), readout, ghostText);
  let touched = false;
  const draw = () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { [a, b] = [b, a]; lo.value = a; hi.value = b; }
    fill.style.left = `${a}%`; fill.style.width = `${b - a}%`;
    readout.textContent = touched ? (a === b ? `Exactly ${a}` : `Lowest ${a}  ·  Highest ${b}`) : "Click on the line";
  };
  const setTo = (a, b) => { lo.value = a; hi.value = b; touched = true; node.classList.remove("untouched"); draw(); };
  track.addEventListener("pointerdown", (e) => {
    if (touched) return;
    const box = track.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, Math.round((100 * (e.clientX - box.left)) / box.width)));
    setTo(v, v);
  });
  lo.addEventListener("input", draw); hi.addEventListener("input", draw);
  draw();
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  let ghostValue = null;
  return {
    node,
    value: () => (touched ? { low: Number(lo.value), high: Number(hi.value) } : null),
    ghost(r) {
      ghostValue = r; const a = clamp(r[0]), b = clamp(r[1]);
      ghostBand.hidden = false; ghostBand.style.left = `${a}%`; ghostBand.style.width = `${Math.max(b - a, 0.6)}%`;
      ghostText.hidden = false; ghostText.textContent = `Simulated person: ${a} to ${b}`;
    },
    fillWith() { if (ghostValue) setTo(clamp(ghostValue[0]), clamp(ghostValue[1])); },
  };
}
const answered = (...s) => () => (s.every((x) => x.value() !== null) ? true : "Please answer every question by clicking on its line.");
function describe(options, only = FEATURES) {
  return el("ul", { class: "description" }, ...only.map((f) =>
    el("li", {}, el("span", { class: "feature", text: FEATURE_NAMES[f] }), el("span", { text: DESCRIPTIONS[options[f]] }))));
}
function roomView(parent) { const v = el("div", { class: "room-view" }); parent.append(v); return v; }
const LETTERS = ["A", "B", "C", "D"];

// ---------------------------------------------------------------- the simulated person (viz mode only)
let viz = null;
let autofill = false;
let currentFill = null;
// Show the simulated person's answers on this screen's sliders, and fill them in if autofill is on.
function simAnswers(sliders, ranges, extra) {
  if (!viz) return;
  sliders.forEach((s, i) => { if (ranges[i]) s.ghost(ranges[i]); });
  currentFill = () => { sliders.forEach((s) => s.fillWith()); extra?.(); };
  if (autofill) currentFill();
}

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
    el("p", { text: `For every room we ask the same question: "${QUESTION}"` }),
    el("p", { text: "You answer with a lowest and a highest value on one line. If you are unsure, give a wide range: for example 30 to 70. If you are sure, give a narrow one, or put both handles on the same point." }),
    el("p", { text: "Sometimes you will only read a description, and sometimes you will also see the room. Sometimes you will see two or four rooms at once. Answer with what you think at that moment." }));
  await nextButton(card);
}

async function check() {
  const qs = [
    { q: "You are completely sure you would rate a room 60. What do you do?", a: ["Put both handles on 60", "Put one handle on 0 and one on 100", "Put one handle on 60 and leave the other"], right: 0 },
    { q: "You have no idea whether you would like a room. What do you do?", a: ["Put both handles on 50", "Give a wide range, for example 10 to 90", "Give a narrow range around 50"], right: 1 },
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
  card.append(el("h2", { text: "Try the slider" }), el("p", { text: "Click on the line, then drag the two handles to set your lowest and highest." }));
  const s = rangeSlider("How much do you like rainy days?");
  card.append(s.node);
  const ms = await nextButton(card, { ready: answered(s) });
  data.practice = { ...s.value(), ms };
}

async function features() {
  const intro = newCard("Part 1 of 2");
  intro.append(el("h2", { text: "The choices" }),
    el("p", { text: "First you will see the four choices for each part of the room, shown in a plain grey room. Please look at them carefully. There is nothing to answer." }));
  await nextButton(intro);
  for (const [i, f] of shuffle(FEATURES).entries()) {
    setProgress(0.03 + 0.12 * (i / 4));
    const card = newCard(`Part 1 of 2 · ${i + 1} of 4`);
    card.append(el("h2", { text: `Here are the four kinds of ${FEATURE_NAMES[f].toLowerCase()}` }));
    const grid = el("div", { class: "option-grid" }); card.append(grid);
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

// ---------------------------------------------------------------- screens: the three kinds of query
const asRange = (v) => (v ? [v.low, v.high] : null);

// Neighbours: rated from text only, after the room(s) have been seen.
async function rateNeighbours(q, step, hint, row) {
  for (const n of shuffle(q.neighbours)) {
    viz?.goTo(row.query - 1, "neighbours", n);
    const card = newCard(`${step} · A similar room`);
    card.append(el("h2", { text: "A room with:" }), describe(roomOptions(n)));
    const s = rangeSlider(QUESTION); card.append(s.node);
    simAnswers([s], [viz?.answer(n, "after")]);
    const ms = await nextButton(card, { ready: answered(s), hint });
    row.rooms.push({ room: n, role: "neighbour", shared: shared(n, q.shown[0]), read: false, before: null, after: asRange(s.value()), msAfter: ms });
    backup();
  }
}

async function singleRoom(q, step, hint, row) {
  const code = q.shown[0], options = roomOptions(code);
  viz?.goTo(row.query - 1, "before");
  let card = newCard(step);
  card.append(el("h2", { text: "A room with:" }), describe(options));
  let s = rangeSlider(QUESTION); card.append(s.node);
  simAnswers([s], [viz?.answer(code, "before")]);
  const msBefore = await nextButton(card, { ready: answered(s), hint, label: "See the room" });
  const before = asRange(s.value());

  viz?.goTo(row.query - 1, "see");
  card = newCard(`${step} · The room`);
  card.append(describe(options));
  const room = new Room(roomView(card), options); openRooms.push(room);
  s = rangeSlider(QUESTION); card.append(s.node);
  simAnswers([s], [viz?.answer(code, "after")]);
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s), hint });
  row.rooms.push({ room: code, role: "shown", shared: 4, read: true, before, after: asRange(s.value()), msBefore, msAfter });
  row.picked = code;
  await rateNeighbours(q, step, hint, row);
}

async function pairRooms(q, step, hint, row) {
  const opts = q.shown.map(roomOptions);
  viz?.goTo(row.query - 1, "before");
  let card = newCard(step);
  card.append(el("h2", { text: "Two rooms" }));
  let grid = el("div", { class: "pair-grid" }); card.append(grid);
  let sliders = q.shown.map((code, i) => {
    const cell = el("div", { class: "pair-cell" }, el("div", { class: "room-label", text: `Room ${LETTERS[i]}` }), describe(opts[i]));
    const s = rangeSlider(QUESTION); cell.append(s.node); grid.append(cell); return s;
  });
  simAnswers(sliders, q.shown.map((c) => viz?.answer(c, "before")));
  const msBefore = await nextButton(card, { ready: answered(...sliders), hint, label: "See the rooms" });
  const before = sliders.map((s) => asRange(s.value()));

  viz?.goTo(row.query - 1, "see");
  card = newCard(`${step} · The rooms`);
  grid = el("div", { class: "pair-grid" }); card.append(grid);
  sliders = q.shown.map((code, i) => {
    const cell = el("div", { class: "pair-cell" }, el("div", { class: "room-label", text: `Room ${LETTERS[i]}` }));
    const room = new Room(roomView(cell), opts[i]); openRooms.push(room);
    cell.append(describe(opts[i]));
    const s = rangeSlider(QUESTION); cell.append(s.node); grid.append(cell); return s;
  });
  simAnswers(sliders, q.shown.map((c) => viz?.answer(c, "after")));
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(...sliders), hint });
  q.shown.forEach((code, i) => row.rooms.push({ room: code, role: "shown", shared: shared(code, q.shown[0]), read: true, before: before[i], after: asRange(sliders[i].value()), msBefore, msAfter }));
  const afterMid = sliders.map((s) => { const v = s.value(); return (v.low + v.high) / 2; });
  row.picked = q.shown[afterMid[1] > afterMid[0] ? 1 : 0];     // the one rated higher after seeing both
  await rateNeighbours(q, step, hint, row);
}

async function featureRooms(q, step, hint, row) {
  const f = q.feature, fixed = FEATURES.filter((x) => x !== f);
  const order = shuffle([0, 1, 2, 3]);                             // screen position of each room
  const rooms = order.map((k) => q.shown[k]), opts = rooms.map(roomOptions);
  viz?.goTo(row.query - 1, "before");
  let card = newCard(step);
  card.append(el("h2", { text: `Four rooms that differ only in the ${FEATURE_NAMES[f].toLowerCase()}` }),
    el("p", { text: "All four rooms have:" }), describe(opts[0], fixed),
    el("p", { text: `They differ only in the ${FEATURE_NAMES[f].toLowerCase()}:` }));
  let sliders = rooms.map((code, i) => {
    const cell = el("div", { class: "variant" }, el("div", { class: "room-label", text: `Room ${LETTERS[i]}: ${DESCRIPTIONS[opts[i][f]]}` }));
    const s = rangeSlider(""); cell.append(s.node); card.append(cell); return s;
  });
  simAnswers(sliders, rooms.map((c) => viz?.answer(c, "before")));
  const msBefore = await nextButton(card, { ready: answered(...sliders), hint, label: "See the rooms" });
  const before = sliders.map((s) => asRange(s.value()));

  viz?.goTo(row.query - 1, "see");
  card = newCard(`${step} · The rooms`);
  card.append(el("h2", { text: `Four rooms that differ only in the ${FEATURE_NAMES[f].toLowerCase()}` }));
  const grid = el("div", { class: "option-grid" }); card.append(grid);
  sliders = rooms.map((code, i) => {
    const cell = el("div", { class: "variant" }, el("div", { class: "room-label", text: `Room ${LETTERS[i]}: ${DESCRIPTIONS[opts[i][f]]}` }));
    const room = new Room(roomView(cell), opts[i]); openRooms.push(room);
    const s = rangeSlider(""); cell.append(s.node); grid.append(cell); return s;
  });
  const choice = el("div", { class: "choices pick" }, el("p", { class: "question", text: "Which of the four do you like best?" }));
  rooms.forEach((code, i) => choice.append(el("label", {}, el("input", { type: "radio", name: "best", value: String(i) }), ` Room ${LETTERS[i]}`)));
  card.append(choice);
  simAnswers(sliders, rooms.map((c) => viz?.answer(c, "after")),
    () => { const p = rooms.indexOf(viz.picked()); if (p >= 0) choice.querySelector(`input[value="${p}"]`).checked = true; });
  const pickedIndex = () => { const c = choice.querySelector("input:checked"); return c ? Number(c.value) : null; };
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, hint,
    ready: () => (answered(...sliders)() === true ? (pickedIndex() !== null ? true : "Please pick the room you like best.") : answered(...sliders)()) });
  // Stored in design order: the base room first, then its three variants.
  q.shown.forEach((code, k) => { const i = rooms.indexOf(code); row.rooms.push({ room: code, role: "shown", shared: shared(code, q.base), read: q.read[k], position: LETTERS[i], before: before[i], after: asRange(sliders[i].value()), msBefore, msAfter }); });
  row.picked = rooms[pickedIndex()];
}

async function queries() {
  const intro = newCard("Part 2 of 2");
  intro.append(el("h2", { text: "The rooms" }),
    el("p", { text: `You will now go through ${queryOrder.length} short tasks. In each one you first read about one, two or four rooms and answer, then see them and answer again. Sometimes you will then answer for a similar room from its description only.` }));
  await nextButton(intro);

  for (const [i, q] of queryOrder.entries()) {
    const hint = `Task ${i + 1} of ${queryOrder.length}`, step = "Part 2 of 2";
    setProgress(0.15 + 0.83 * (i / queryOrder.length));
    const row = { query: i + 1, kind: q.kind, design: q.design, feature: q.feature || null, rooms: [], picked: null };
    if (q.kind === "single") await singleRoom(q, step, hint, row);
    else if (q.kind === "pair") await pairRooms(q, step, hint, row);
    else await featureRooms(q, step, hint, row);
    data.queries.push(row); backup();
  }
}

async function finish() {
  setProgress(0.98);
  const card = newCard();
  const comments = el("textarea", { class: "comments", placeholder: "Optional" });
  card.append(el("h2", { text: "Almost done" }), el("p", { text: "Is there anything you would like to tell us about the study? For example, was anything unclear?" }), comments);
  await nextButton(card, { label: "Finish" });
  data.comments = comments.value.trim(); data.finishedAt = new Date().toISOString();

  // One record per rated room per query, in the layout simulate() returns in study1_all.jl,
  // so person(records) can read real participants unchanged.
  data.records = data.queries.flatMap((q) => q.rooms.map((r) => ({
    query: q.query, kind: q.kind, room: r.room, role: r.role, read: r.read, before: r.before, after: r.after, picked: q.picked,
  })));
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
  const { createViz } = await import("./study1_viz.js?v=1");
  viz = createViz(document.querySelector("#vizPanel"), { queries: queryOrder, seed, mapping, onAutofill: (on) => { autofill = on; if (on) currentFill?.(); } });
}
if (FULL) {
  await welcome();
  await instructions();
  await check();
  await practice();
  await features();
}
await queries();
await finish();
