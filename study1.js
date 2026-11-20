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
import { FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES, ROOM_SETTINGS, roomPicture } from "./room.js?v=5";

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
  similarRooms: [3, 2, 0],         // after a single room, similar rooms sharing these numbers of options with it
                                   // (29 Oct: fewer, so as not to tire people; [3, 2, 1, 0] for all four)
  featurePick: false,              // feature tasks end with "which do you like best?" (dropped 2 Nov)
  featureReminder: true,           // show all the options again before the feature tasks (29 Oct)
  blockOrder: "single,preference,feature",   // fixed order (17 Nov); "random" shuffles the blocks per participant
  optionCheck: true,               // after the options screens, name one option per feature
  rangeWording: "range",           // "range": lowest and highest you could end up giving; "90": 90% sure
  roomWindow: true,                // a window in the complete rooms (off 2-17 Nov; back on 17 Nov)
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

// Questions (17 Nov): "think you would like" only for rooms people read about; "like" for rooms they see.
const QUESTION = "How much do you think you would like this room?";
const Q = {
  read: QUESTION,
  readMany: "How much do you think you would like each of these rooms?",
  readVersions: "How much do you think you would like each version of the room?",
  seen: "How much do you actually like this room?",
  seenMany: "How much do you actually like each of these rooms?",
  options: "Now that you can see the new options, how much do you think you would like each version of the room?",
};
const HINT = CONFIG.rangeWording === "90"
  ? "Give a range you are 90% sure your rating would fall in."
  : "Give the lowest and highest rating you think you could end up giving it.";
// Shown under the slider until it is used (17 Nov: moved below the slider).
const HOW_TO = "To set your range, press on the line and drag the slider.";
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
// Each set of 4 rooms uses every option once. No room (first room, similar room, alternative or version) appears
// in more than one task, so nothing is rated again in a different task (29 Oct).
const SINGLE_ROOMS = ["1234", "2311", "4122", "3443"];   // 2 Nov: chosen so that no room appears in two tasks
const PREF_ROOMS = ["4232", "3313", "1141", "2424"];
const FEATURE_ROOMS = ["1223", "2431", "3312", "4144", "1442", "2214", "3133", "4321"];   // each option twice

// The room `code` moved on by `step` options in the features `feats` (0-based). Same as shift() in Julia.
function change(code, feats, step) { return code.split("").map((d, f) => (feats.includes(f) ? String(((Number(d) - 1 + step) % 4) + 1) : d)).join(""); }
const shared = (a, b) => [...a].filter((d, i) => d === b[i]).length;

// Tasks in design order. t is 0-based.
function singleQuery(code, t) {
  const f = t % 4, g = (k) => (f + k) % 4;
  const all = [change(code, [f], 1), change(code, [g(1), g(2)], 2), change(code, [f, g(1), g(2)], 3), change(code, [0, 1, 2, 3], 2)];
  return { kind: "single", design: t + 1, shown: [code], neighbours: all.filter((n) => CONFIG.similarRooms.includes(shared(n, code))) };
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
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else if (k === "html") node.innerHTML = v; /* our own fixed strings only */ else node.setAttribute(k, v); }
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
function setProgress(x) { const f = document.querySelector("#progressFill"); if (f) f.style.width = `${Math.round(100 * x)}%`; }   // progress bar removed 17 Nov
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
    readout.textContent = touched ? (a === b ? `Exactly ${fmt(a)}` : `From ${fmt(a)} to ${fmt(b)}`) : HOW_TO;
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
    example(a, b) { setRange(a, b); node.classList.add("example"); readout.textContent = ""; },   // a fixed picture of a range
  };
}
const answered = (...s) => () => (s.every((x) => x.value() !== null) ? true : "Please answer every question by pressing on its line.");
function describe(options, only = FEATURES) {
  return el("table", { class: "description" }, ...only.map((f) =>
    el("tr", {}, el("th", { text: FEATURE_NAMES[f] }), el("td", { text: DESCRIPTIONS[options[f]] }))));
}
const LETTERS = ["A", "B", "C"];
// A room given only in words, beside the rooms shown as pictures.
function textRoom(options, only = FEATURES) { return describe(options, only); }   // plain text, no card (17 Nov)
// One cell of a side-by-side row: a heading, then a picture or a text card, then (optionally) a slider.
function roomCell(grid, label, body) { const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: label })); cell.append(body); grid.append(cell); return cell; }
const rangeText = (v) => (v ? `${fmt(v.low)} to ${fmt(v.high)}` : "");

// The latest answer for each room, shown faintly when the room is rated again.
const lastAnswer = {};
function slider(parent, room, { question = QUESTION, hint = HINT } = {}) {
  const s = rangeSlider({ question, hint }, (v) => viz?.live(room, v)); s.prev(lastAnswer[room]); parent.append(s.node); return s;
}
// The question once, above several rooms that each have their own scale.
function questionOnce(card, question) {
  card.append(el("div", { class: "question-once" }, el("div", { class: "question", text: question }), el("div", { class: "subtitle", text: HINT })));
}
const asRange = (v) => (v ? [v.low, v.high] : null);
const remember = (room, v) => { if (v) lastAnswer[room] = v; return asRange(v); };

// The room seen earlier in a task, kept on screen beside what comes next (29 Oct).
function keptRoom(parent, code, label, note = "", { text = false } = {}) {
  const box = el("div", { class: "kept" }, el("div", { class: "room-label", text: label }));
  picture(box, roomOptions(code)); if (text) box.append(describe(roomOptions(code)));
  const r = lastAnswer[code];
  if (r) box.append(el("p", { class: "small", text: `${note || "You rated this room"} ${rangeText(r)}.` }));
  parent.append(box); return box;
}

// ---------------------------------------------------------------- the graphs of your answers (viz mode only)
let viz = null;
let eventIndex = -1;
const nextEvent = () => ++eventIndex;

// ---------------------------------------------------------------- screens: introduction
async function welcome() {
  const card = newCard(); card.classList.add("welcome");   // centred on the page (20 Nov)
  // 20 Nov (Zhi-Xuan): a more informative title and a short motivation; consent is handled on Prolific.
  card.append(lead("Welcome to our study on how people learn their own preferences!"),
    lead("In this study, we will show you descriptions and images of various rooms, and ask you to judge how much you like these rooms as more information about each room is provided. Remember: there are no right or wrong answers, we want your opinions."),
    lead("The task should take about 15 minutes to complete. Before you begin, you will be asked to complete a short tutorial. Press next to continue!"));
  await nextButton(card, { label: "Next" });
}

// Tutorial (17 Nov): numbered instructions, numbered questions, and the same header on every tutorial screen.
const TUT_SLIDER = "Tutorial: Using the Slider", TUT_FEATURES = "Tutorial: Room Features";
const lead = (text) => el("p", { class: "lead", text });
const numbered = (items) => el("ol", { class: "steps" }, ...items.map((t) => el("li", { text: t })));

// Numbered points (17 Nov): the first sentence in bold, the details below it in grey, and an optional picture.
function points(items) {
  return el("ol", { class: "points" }, ...items.map(([main, detail, extra]) =>
    el("li", {}, el("div", { class: "point-main", text: main }), detail ? el("div", { class: "point-detail", text: detail }) : "", extra ?? "")));
}

// Tutorial: Using the Slider (20 Nov, Zhi-Xuan): practice with the interface on a kitchen, whose four features
// lie outside the study's rooms, before the quiz.
const KITCHEN = [["Cabinets", "red cabinets"], ["Island", "a white marble island with three bar stools"],
  ["Floor", "light oak floorboards"], ["Range hood", "a copper hood above the stove"]];
const exampleTable = (rows) => el("table", { class: "description" }, ...rows.map(([k, v]) => el("tr", {}, el("th", { text: k }), el("td", { text: v }))));
// Tutorial pages (20 Nov), laid out like the Block Words tutorial: "Tutorial" on the left, the example in the
// middle with the Next button under it, and the explanation on the right in short paragraphs.
function tutCard(step) {
  // "Tutorial" on the left, the example on the right (20 Nov: no boxes, no separate instructions column; the
  // tutorial's own advice is written into the example in colour).
  const card = newCard(null, { wide: true });
  const center = el("div", { class: "tut-center" });
  card.append(el("div", { class: "tut" }, el("div", { class: "tut-title" }, el("div", { text: "Tutorial" }), el("div", { class: "tut-step", text: step })), center));
  return { center, col: center };
}
// Adds tutorial advice, in colour, after the slider's subtitle.
function tip(slider, html) { const sub = slider.node.querySelector(".subtitle"); sub.append(" ", el("span", { class: "tip", html })); }

async function instructions() {}   // the explanation is now on the example pages themselves (20 Nov)

// Practice with the interface only (20 Nov): two steps. The middle column looks exactly like the task; the right
// column says only how the slider works, without repeating the task's own wording.
async function practice() {
  // Step 1: a description only.
  let t = tutCard("Using the slider · 1 of 2");
  t.center.append(lead("Read the given description of a kitchen, and try to picture what it might look like."), exampleTable(KITCHEN));
  const s1 = rangeSlider({ question: "How much do you think you would like this kitchen?", hint: HINT });
  tip(s1, "Set a wider range if you aren’t sure, and narrower if you are!");
  t.center.append(s1.node);
  const ms1 = await nextButton(t.col, { ready: answered(s1) });
  const first = s1.value();
  // Step 2: the kitchen itself; the earlier answer is on the slider.
  t = tutCard("Using the slider · 2 of 2");
  t.center.append(lead("Please see the kitchen shown below."));
  picture(t.center, { scene: "kitchen" });
  const s2 = rangeSlider({ question: "How much do you actually like this kitchen?", hint: HINT });
  s2.prev(first);
  tip(s2, "Your earlier answer is the green band above the line: keep it or set a new range.");
  t.center.append(s2.node);
  const ms2 = await nextButton(t.col, { ready: answered(s2), minMs: CONFIG.minRoomViewMs });
  data.practice = { first: { ...first, ms: ms1 }, second: { ...s2.value(), ms: ms2 } };
}

// Numbered multiple-choice questions on one screen. items: [{ q, a: [answers], right, picture? }].
function questionsCard(card, items) {
  const groups = items.map((item, i) => {
    const box = el("div", { class: "choices" }, el("p", { class: "question", text: `${i + 1}. ${item.q}` }));
    if (item.picture) picture(box, item.picture);
    item.a.forEach((txt, j) => box.append(el("label", {}, el("input", { type: "radio", name: `q${i}`, value: String(j) }), ` ${txt}`)));
    return box;
  });
  const pick = (i) => { const c = groups[i].querySelector("input:checked"); return c ? Number(c.value) : null; };
  return { groups, pick, ready: () => (items.every((_, i) => pick(i) !== null) ? true : `Please answer ${items.length === 2 ? "both" : "all"} questions.`) };
}

async function check() {
  const qs = [
    { q: "You are completely sure you would rate a room +20. What do you do?", a: ["Put both handles on +20", "Put one handle on −50 and one on +50", "Put one handle on +20 and leave the other"], right: 0 },
    { q: "You have no idea whether you would like a room. What do you do?", a: ["Put both handles on 0", "Give a wide range, for example −40 to +40", "Give a narrow range around 0"], right: 1 },
  ];
  for (let attempt = 1; ; attempt++) {
    const t = tutCard("Using the slider · questions");
    const { groups, pick, ready } = questionsCard(t.center, qs);
    t.center.append(...groups);
    t.center.prepend(el("p", { class: "lead tip", text: "Well done! Before moving on, please answer two short questions about the slider." }));
    await nextButton(t.col, { ready });
    const ok = qs.every((item, i) => pick(i) === item.right);
    data.check.push({ attempt, answers: qs.map((_, i) => pick(i)), ok });
    if (ok) return;
    const again = tutCard("Using the slider · questions");
    again.center.append(el("p", { class: "lead tip", text: "Not quite. The lowest and highest ratings show how sure you are: the same point if you are certain, a wide range if you are unsure. Please try the questions again." }));
    await nextButton(again.col, { label: "Continue" });
  }
}

const PARTS = 1 + blocks.length;   // part 1: the options; then one part per block
function optionGrid(parent, f, order) {
  const grid = el("div", { class: "row-grid" }); parent.append(grid);
  for (const option of order) {
    const cell = el("div", {}); grid.append(cell);
    picture(cell, { feature: f, option });
    cell.append(el("div", { class: "option-name", text: DESCRIPTIONS[option] }));
  }
}
async function features() {
  await popup(TUT_FEATURES, [
    "Each room in this study has four features: the furniture, the lighting, the walls and the wall decor. Each feature has four options.",
    "On the next screens, you will see the four options for each feature, each shown on its own in an empty room, where it would be placed.",
    "Please look at them carefully. Afterwards, you will be asked two short questions about them."], "Continue");
  for (const [i, f] of shuffle(FEATURES).entries()) {
    setProgress(0.03 + 0.1 * (i / 4));
    const card = newCard(TUT_FEATURES, { wide: true });
    card.append(lead(`Here are the four options for the ${FEATURE_NAMES[f].toLowerCase()}. The words under each picture are how this option will be described in the study.`));
    const order = shuffle(LEVELS[f]);
    optionGrid(card, f, order);
    const ms = await nextButton(card, { minMs: CONFIG.minFeatureViewMs });
    data.features.push({ feature: f, order, ms }); backup();
  }
}

// A short check that the options were looked at (17 Nov): two numbered questions on one screen, each on a randomly
// chosen feature (two different features) and option. After a wrong answer people see the four options of the
// feature(s) they got wrong, then answer two new questions on the same features, until both are right.
async function optionCheck() {
  const feats = shuffle(FEATURES).slice(0, 2);
  const asked = Object.fromEntries(feats.map((f) => [f, []]));
  for (let attempt = 1; ; attempt++) {
    const items = feats.map((f) => {
      const left = LEVELS[f].filter((o) => !asked[f].includes(o));
      const pool = left.length ? left : LEVELS[f];
      const option = pool[Math.floor(random() * pool.length)];
      asked[f].push(option);
      const a = shuffle(LEVELS[f]);
      return { f, option, choices: a, q: `Which option for the ${FEATURE_NAMES[f].toLowerCase()} is shown in this picture?`, a: a.map((o) => DESCRIPTIONS[o]), right: a.indexOf(option), picture: { feature: f, option } };
    });
    const card = newCard(TUT_FEATURES, { wide: true });
    card.append(lead("Two short questions about the options you just saw."));
    const { groups, pick, ready } = questionsCard(card, items);
    const row = el("div", { class: "row-grid two" }, ...groups); card.append(row);
    const ms = await nextButton(card, { ready });
    const wrong = [];
    items.forEach((it, i) => {
      const ok = pick(i) === it.right;
      data.optionCheck.push({ feature: it.f, option: it.option, answer: it.choices[pick(i)], ok, attempt, ms });
      if (!ok) wrong.push(it);
    });
    backup();
    if (!wrong.length) return;
    const again = newCard(TUT_FEATURES, { wide: true });
    again.append(lead(`Not quite. ${wrong.map((it) => `The ${FEATURE_NAMES[it.f].toLowerCase()} picture showed ${DESCRIPTIONS[it.option]}.`).join(" ")} Please look at the options again below; you will then be asked two new questions.`));
    for (const it of wrong) { again.append(el("div", { class: "room-label", text: FEATURE_NAMES[it.f] })); optionGrid(again, it.f, LEVELS[it.f]); }
    await nextButton(again, { label: "Try again", minMs: CONFIG.minRoomViewMs });
  }
}

// All sixteen options again, one row per feature (before the feature tasks; 29 Oct).
async function reminder(where) {
  const card = newCard(where, { wide: true });
  card.append(el("p", { class: "lead", text: "All the options for room configurations are shown below once again as a refresher." }),
    el("p", { class: "lead", text: "In this part, you will be asked to change one feature of a room at a time." }));
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
    const card = newCard(where, { wide: true });
    card.append(el("p", { class: "lead", text: "Please read the description of the room given below on the right. You will not be seeing these rooms afterwards." }),
      el("p", { class: "lead", text: "The initial room is shown on the left." }));
    questionOnce(card, Q.read);
    const grid = el("div", { class: "row-grid two" }); card.append(grid);
    keptRoom(grid, q.shown[0], "Initial room").classList.add("cell");
    const right = roomCell(grid, `New room (${i + 1} of ${order.length})`, textRoom(roomOptions(n)));
    const s = slider(right, n, { question: "", hint: "" });
    const ms = await nextButton(card, { ready: answered(s) });
    rows.push({ room: n, role: "neighbour", shared: shared(n, q.shown[0]), read: false, before: null, after: remember(n, s.value()), msAfter: ms });
  }
}

// The first room of a comparison or feature task: seen as a picture, rated once.
async function firstRoom(code, where) {
  const options = roomOptions(code), ev = nextEvent();
  viz?.goTo(ev, "see");
  const card = newCard(where);
  card.append(el("p", { class: "lead", text: "Please see the room shown below." }));
  picture(card, options);
  card.append(describe(options));
  const s = slider(card, code, { question: Q.seen });
  const ms = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s) });
  const after = remember(code, s.value());
  record(ev, "base", [{ room: code, role: "shown", read: true, before: null, after, msAfter: ms }], code, 1);
  return after;
}

async function singleRoom(q, where) {
  const code = q.shown[0], options = roomOptions(code), ev = nextEvent();
  viz?.goTo(ev, "before");
  let card = newCard(where);
  card.append(el("p", { class: "lead", text: "Please carefully read the given description of a room, and try to picture what the room might look like." }), describe(options));
  let s = slider(card, code, { question: Q.read });
  const msBefore = await nextButton(card, { ready: answered(s), label: "See the room" });
  const before = remember(code, s.value());

  viz?.goTo(ev, "see");
  card = newCard(where);
  card.append(el("p", { class: "lead", text: "Please see the room shown below." }));
  picture(card, options);   // picture only, no description (17 Nov)
  s = slider(card, code, { question: Q.seen });
  const msAfter = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(s) });
  const rows = [{ room: code, role: "shown", shared: 4, read: true, before, after: remember(code, s.value()), msBefore, msAfter }];
  await rateNeighbours(q, where, ev, rows);
  record(ev, "single", rows, code, 1);
}

async function preferenceTask(q, where) {
  const orig = q.original, alts = q.alternatives, k = alts.length;
  const origOpts = roomOptions(orig), altOpts = alts.map(roomOptions);
  const label = (i) => (k === 1 ? "New room" : `New room ${LETTERS[i]}`);

  // 1. One room, as a picture.
  const first = await firstRoom(orig, where);

  // 2. The other room(s), as text only, all at once, with the first room kept on screen.
  const ev = nextEvent(); viz?.goTo(ev, "before");
  let card = newCard(where, { wide: true });
  card.append(el("p", { class: "lead", text: k === 1
      ? "Please read the description of the new room given below on the right. You will be shown this room afterwards."
      : "Please read the descriptions of the two new rooms given below on the right. You will be shown these rooms afterwards." }),
    el("p", { class: "lead", text: "The initial room is shown on the left." }));
  // The initial room as a picture and each new room as a text card of the same size, side by side (17 Nov),
  // so the page fits on one screen without scrolling.
  questionOnce(card, k === 1 ? Q.read : Q.readMany);
  const row = el("div", { class: `row-grid ${k === 1 ? "two" : "three"}` }); card.append(row);
  keptRoom(row, orig, "Initial room").classList.add("cell");
  let sliders = alts.map((code, i) => slider(roomCell(row, label(i), textRoom(altOpts[i])), code, { question: "", hint: "" }));
  const msBefore = await nextButton(card, { ready: answered(...sliders), label: k === 1 ? "See it" : "See them" });
  const before = sliders.map((s, i) => remember(alts[i], s.value()));

  // 3. All of them as pictures, the first room included; every room rated again.
  viz?.goTo(ev, "see");
  card = newCard(where, { wide: true });
  card.append(el("p", { class: "lead", text: `Please see all the rooms shown below, including the initial room.` }));
  questionOnce(card, Q.seenMany);
  const grid = el("div", { class: `row-grid ${k === 1 ? "two" : "three"}` }); card.append(grid);
  const cellFor = (code, opts, name) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: name }));
    picture(cell, opts); if (code !== orig) cell.append(describe(opts));   // the initial room: picture only (17 Nov)
    grid.append(cell); return slider(cell, code, { question: "", hint: "" });
  };
  const sOrig = cellFor(orig, origOpts, "Initial room");
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
  await firstRoom(base, where);
  const baseRating = lastAnswer[base];

  // 2. Three versions with a different option for one feature, as text, with the room kept on screen.
  const ev = nextEvent(); viz?.goTo(ev, "before");
  let card = newCard(where, { wide: true });
  card.append(el("p", { class: "lead", text: `Please read the descriptions of the three versions given below on the right. Each version is the initial room with different ${fname}; everything else stays exactly the same.` }),
    el("p", { class: "lead", text: "The initial room is shown on the left." }));
  // The initial room as a picture and the three versions as text cards of the same size, in one row (17 Nov).
  questionOnce(card, Q.readVersions);
  const row = el("div", { class: "row-grid" }); card.append(row);
  keptRoom(row, base, "Initial room").classList.add("cell");
  let sliders = versions.map((code, i) => slider(roomCell(row, `Version ${LETTERS[i]}`, textRoom(vOpts[i], [f])), code, { question: "", hint: "" }));
  const msBefore = await nextButton(card, { ready: answered(...sliders), label: "See them" });
  const before = sliders.map((s, i) => remember(versions[i], s.value()));

  // 3. The original room again, large, and below it each of the three options on its own (29 Oct), or with
  //    featureStep3 = "rooms" the three changed rooms in full. The versions are rated again, with the rating of
  //    the original marked on each scale; then, optionally, the best of the four is picked.
  viz?.goTo(ev, "see");
  const asOptions = CONFIG.featureStep3 === "options";
  card = newCard(where, { wide: true });
  card.append(el("p", { class: "lead", text: `Please see the initial room shown below, and the new ${fname} options below it.` }));
  const top = el("div", { class: "original-top" }, el("div", { class: "room-label", text: "Initial room" }));
  picture(top, baseOpts);
  top.append(el("p", { class: "small", text: `You rated this room ${rangeText(baseRating)}.` }));   // picture only (17 Nov)
  card.append(top);
  card.append(el("p", { text: asOptions
    ? `Below, each picture shows only the new ${fname}, in the place it would be in the room. Imagine the room above with that ${fname} instead; everything else stays the same.`
    : `Each room below is the room above with different ${fname}.` }));
  questionOnce(card, asOptions ? Q.options : Q.seenMany);
  const grid = el("div", { class: "row-grid three" }); card.append(grid);
  sliders = versions.map((code, i) => {
    const cell = el("div", { class: "cell" }, el("div", { class: "room-label", text: `Version ${LETTERS[i]}` }));
    picture(cell, asOptions ? { feature: f, option: vOpts[i][f] } : vOpts[i]);
    cell.append(describe(vOpts[i], [f])); grid.append(cell);
    const s = slider(cell, code, { question: "", hint: "" });
    s.ref(baseRating, "Your rating of the initial room"); return s;
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

// Introductions to the three blocks (17 Nov wording). n: number of iterations in the block.
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const total = (n) => `In total, there ${n === 1 ? "is one iteration" : `are ${NUM[n] ?? n} iterations`} in this task.`;
const STEPS_N = ["", "one step", "two steps", "three steps"];
const STEPS = "In each iteration of this task, there are STEPS to follow:";
const BLOCK_INTRO = {
  single: { title: "Observing individual rooms",
    text: (n) => [STEPS, ["You will be asked to read a description of a room and rate it. Following this, you will be shown the actual room, and asked to rate it again.",
      "You will be asked to read descriptions of a few other rooms and rate each of them. The original room will remain on the screen as you complete this step."],
      total(n)] },
  preference: { title: "Comparing rooms",
    text: (n) => [STEPS, ["You will be shown a room and asked to rate it.",
      "You will be asked to read descriptions of one or two other rooms and rate them. The original room will remain on the screen as you complete this step.",
      "You will be shown all of the rooms together, including the original one, and asked to rate each of them again."],
      total(n)] },
  feature: { title: "Changing one feature of a room",
    text: (n) => [STEPS, ["You will be shown a room and asked to rate it.",
      "You will be asked to read about three versions of that room, each with one feature changed (for example, the lighting), and rate them.",
      "You will be shown each new option on its own, together with the original room, and asked to rate the versions again."],
      total(n)] },
};
// A pop-up over the page (17 Nov): the introduction to each task.
function popup(title, paragraphs, label = "Start") {
  screenEl.replaceChildren(); if (!VIZ) window.scrollTo(0, 0);
  const button = el("button", { class: "button", text: label });
  const box = el("div", { class: "modal", role: "dialog", "aria-modal": "true" },
    el("h2", { text: title }),
    ...paragraphs.map((t, k) => t instanceof Node ? t : Array.isArray(t)
      ? el("ol", { class: "steps" }, ...t.map((x) => el("li", { text: x })))
      : el("p", { text: t === STEPS ? STEPS.replace("STEPS", STEPS_N[paragraphs[k + 1].length]) : t })),
    el("div", { class: "actions" }, button));
  const back = el("div", { class: "modal-back" }, box);
  document.body.append(back); button.focus();
  return new Promise((resolve) => { button.onclick = () => { back.remove(); resolve(); }; });
}
const TITLE = "Experiment 1 of Assistive Elicitation";   // browser tab title (17 Nov)
async function runBlocks() {
  const total = blocks.reduce((n, b) => n + b.tasks.length, 0);
  let done = 0;
  for (const [bi, b] of blocks.entries()) {
    const part = `Task ${bi + 1} of ${blocks.length}: ${BLOCK_INTRO[b.kind].title}`;
    document.title = `Task ${bi + 1} | ${TITLE}`;
    await popup(`Task ${bi + 1}: ${BLOCK_INTRO[b.kind].title}`, BLOCK_INTRO[b.kind].text(b.tasks.length));
    if (b.kind === "feature" && CONFIG.featureReminder) await reminder(part);
    for (const [i, q] of b.tasks.entries()) {
      const where = `${part} (iteration ${i + 1} of ${b.tasks.length})`;
      // Between iterations (17 Nov): say plainly that one iteration is over and a new room is coming.
      if (i > 0) await popup(`Iteration ${i} of ${b.tasks.length} complete`,
        [`Next is iteration ${i + 1} of ${b.tasks.length}. It starts with a new room, and the steps are the same as before.`],
        `Start iteration ${i + 1}`);
      setProgress(0.15 + 0.83 * (done / total));
      if (q.kind === "single") await singleRoom(q, where);
      else if (q.kind === "preference") await preferenceTask(q, where);
      else await featureRooms(q, where);
      done++;
    }
  }
  document.title = TITLE;
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

// 17 Nov: no comments page and no download button for participants. Answers are sent with DataPipe / saveUrl;
// with ?debug=1 the download button is still shown, for testing.
async function finish() {
  setProgress(0.98);
  data.finishedAt = new Date().toISOString();
  backup();
  const sending = newCard(); sending.append(el("p", { text: "Saving your answers…" }));
  const trying = Boolean(CONFIG.dataPipeId || CONFIG.saveUrl);
  const saved = trying ? await save() : false;
  data.saved = saved; backup();
  setProgress(1);
  const done = newCard(); done.append(el("h1", { text: "Thank you" }), el("p", { text: "You have completed the study." }));
  if (DEBUG) {
    const file = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    done.append(el("p", { class: "small", text: saved ? "(debug) Answers saved." : "(debug) Answers were not sent." }),
      el("a", { class: "button", href: URL.createObjectURL(file), download: `study1-${data.participant}.json`, text: "Download answers" }));
  }
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
  await practice();
  await check();
  await features();
  if (CONFIG.optionCheck) await optionCheck();
}
await runBlocks();
await finish();
