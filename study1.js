// Study 1: what do people learn about their own preferences from seeing a room?
// Procedure agreed on 6 Oct 2026. Rooms and neighbours match make_design(:single) in study1_gp.jl.
//
// Flow:  welcome -> instructions (lowest/highest explained) -> comprehension check -> slider practice
//        -> the options, one screen per feature (4 options each)
//        -> 8 rounds: rate from text -> see the room, rate again -> rate 3 neighbours from text
//        -> comments, save
//
// Add ?debug=1 for a short version (2 rounds, no waiting).
import { Room, FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES } from "./room.js";

// ---------------------------------------------------------------- settings
const CONFIG = {
  saveUrl: "",             // if set, the data are POSTed here as JSON at the end
  completionUrl: "",       // if set, a link back to the recruitment site is shown at the end
  minFeatureViewMs: 5000,  // each feature screen must be looked at for at least this long
  minRoomViewMs: 3000,     // each room must be looked at for at least this long
  neighboursBefore: false, // also rate the neighbours before seeing the room (open question for Zhi-Xuan)
  askMatch: false,         // "how closely does it match what you pictured?" (optional, not used in the model)
};
const QUESTION = "On a scale of 0 to 100, how much do you think you like this room?";

// The 8 rooms seen, as option labels 1-4 for (furniture, lighting, wall, decor). Which real option
// is "1", "2", ... is shuffled for each participant below.
const SEEN = ["1111", "1223", "2343", "2431", "3312", "3424", "4144", "4232"];

// Neighbours of the room seen in position t (0-7): share 3, 2 and 1 options with it. Same as study1_gp.jl.
function change(code, feats, step) { return code.split("").map((d, f) => (feats.includes(f) ? String(((Number(d) - 1 + step) % 4) + 1) : d)).join(""); }
function neighbours(code, t) {
  const f = t % 4, g = (k) => (f + k) % 4;
  return [change(code, [f], 1), change(code, [g(1), g(2)], 2), change(code, [f, g(1), g(2)], 3)];
}
const shared = (a, b) => [...a].filter((d, i) => d === b[i]).length;

// ---------------------------------------------------------------- participant and randomisation
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const seed = Number(params.get("seed")) || Math.floor(Math.random() * 2 ** 31);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = mulberry32(seed);
function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const mapping = Object.fromEntries(FEATURES.map((f) => [f, shuffle(LEVELS[f])]));
const roomOptions = (code) => Object.fromEntries(FEATURES.map((f, i) => [f, mapping[f][Number(code[i]) - 1]]));
const roundOrder = shuffle(SEEN.map((code, t) => ({ design: t + 1, code, nb: neighbours(code, t) }))).slice(0, DEBUG ? 2 : SEEN.length);

const data = {
  study: "study1", version: 2, seed, debug: DEBUG, config: CONFIG,
  participant: params.get("PROLIFIC_PID") || params.get("pid") || `anon-${seed}`,
  urlParams: Object.fromEntries(params), userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(), mapping,
  practice: null, check: [], features: [], rounds: [], comments: "", finishedAt: null,
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
  screenEl.append(card); window.scrollTo(0, 0);
  return card;
}
function setProgress(x) { document.querySelector("#progressFill").style.width = `${Math.round(100 * x)}%`; }
function nextButton(card, { label = "Next", minMs = 0, ready = () => true, hint = "" } = {}) {
  const error = el("div", { class: "error" });
  const button = el("button", { class: "button", text: label });
  card.append(error, el("div", { class: "actions" }, el("span", { class: "hint", text: hint }), button));
  const shown = performance.now(); const wait = DEBUG ? 0 : minMs;
  if (wait > 0) { button.disabled = true; setTimeout(() => { button.disabled = false; }, wait); }
  return new Promise((resolve) => { button.onclick = () => { const p = ready(); if (p !== true) { error.textContent = p; return; } resolve(Math.round(performance.now() - shown)); }; });
}

// One slider with two handles, lowest and highest, on a visible 0-100 scale. Nothing is shown until
// the participant clicks on the line; the first click puts both handles there.
function rangeSlider(question) {
  const lo = el("input", { type: "range", min: "0", max: "100", step: "1", value: "50", "aria-label": "lowest" });
  const hi = el("input", { type: "range", min: "0", max: "100", step: "1", value: "50", "aria-label": "highest" });
  const fill = el("div", { class: "fill" });
  const track = el("div", { class: "track" }, fill, lo, hi);
  const readout = el("div", { class: "readout" });
  const node = el("div", { class: "range untouched" }, el("div", { class: "question", text: question }), track,
    el("div", { class: "scale" }, ...[0, 25, 50, 75, 100].map((v) => el("span", { text: String(v) }))), readout);
  let touched = false;
  const draw = () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { [a, b] = [b, a]; lo.value = a; hi.value = b; }
    fill.style.left = `${a}%`; fill.style.width = `${b - a}%`;
    readout.textContent = touched ? (a === b ? `Exactly ${a}` : `Lowest ${a}  ·  Highest ${b}`) : "Click on the line";
  };
  track.addEventListener("pointerdown", (e) => {
    if (touched) return;
    const box = track.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, Math.round((100 * (e.clientX - box.left)) / box.width)));
    lo.value = v; hi.value = v; touched = true; node.classList.remove("untouched"); draw();
  });
  lo.addEventListener("input", draw); hi.addEventListener("input", draw);
  draw();
  return { node, value: () => (touched ? { low: Number(lo.value), high: Number(hi.value) } : null) };
}
const answered = (...s) => () => (s.every((x) => x.value() !== null) ? true : "Please answer by clicking on the line.");
function describe(options) {
  return el("ul", { class: "description" }, ...FEATURES.map((f) =>
    el("li", {}, el("span", { class: "feature", text: FEATURE_NAMES[f] }), el("span", { text: DESCRIPTIONS[options[f]] }))));
}
function roomView(parent) { const v = el("div", { class: "room-view" }); parent.append(v); return v; }

// ---------------------------------------------------------------- screens
async function welcome() {
  const card = newCard();
  card.append(el("h1", { text: "Room Design Study" }),
    el("p", { text: "In this study you will read about designs for a living room, see some of them, and tell us how much you think you like them. It takes about 12 minutes." }),
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
    el("p", { text: "Sometimes you will only read a description, and sometimes you will also see the room. Answer with what you think at that moment." }));
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

async function rateFromText(code, step, hint, label = "Next") {
  const card = newCard(step);
  card.append(el("h2", { text: "A room with:" }), describe(roomOptions(code)));
  const s = rangeSlider(QUESTION); card.append(s.node);
  const ms = await nextButton(card, { ready: answered(s), hint, label });
  return { ...s.value(), ms };
}

async function rounds() {
  const intro = newCard("Part 2 of 2");
  intro.append(el("h2", { text: "The rooms" }),
    el("p", { text: `You will now go through ${roundOrder.length} rooms. For each one you first read a description and answer, then see the room and answer again, then answer for a few similar rooms from their descriptions only.` }));
  await nextButton(intro);

  for (const [i, r] of roundOrder.entries()) {
    const hint = `Room ${i + 1} of ${roundOrder.length}`, step = "Part 2 of 2";
    const nbOrder = shuffle(r.nb);
    setProgress(0.15 + 0.83 * (i / roundOrder.length));
    const row = { round: i + 1, design: r.design, room: r.code, options: roomOptions(r.code), neighbours: [] };

    if (CONFIG.neighboursBefore) for (const n of nbOrder) row.neighbours.push({ room: n, shared: shared(n, r.code), before: await rateFromText(n, step, hint) });
    row.before = await rateFromText(r.code, step, hint, "See the room");

    const card = newCard(`${step} · The room`);
    card.append(describe(row.options));
    const room = new Room(roomView(card), row.options); openRooms.push(room);
    const s = rangeSlider(QUESTION); card.append(s.node);
    let match = null;
    if (CONFIG.askMatch) { match = rangeSlider("How closely does it match what you pictured?"); card.append(match.node); }
    const ms = await nextButton(card, { minMs: CONFIG.minRoomViewMs, ready: answered(...[s, match].filter(Boolean)), hint });
    row.after = { ...s.value(), ms }; row.match = match && match.value();

    for (const n of nbOrder) {
      const after = await rateFromText(n, `${step} · Similar rooms`, hint);
      const existing = row.neighbours.find((x) => x.room === n);
      if (existing) existing.after = after; else row.neighbours.push({ room: n, shared: shared(n, r.code), after });
    }
    data.rounds.push(row); backup();
  }
}

async function finish() {
  setProgress(0.98);
  const card = newCard();
  const comments = el("textarea", { class: "comments", placeholder: "Optional" });
  card.append(el("h2", { text: "Almost done" }), el("p", { text: "Is there anything you would like to tell us about the study? For example, was anything unclear?" }), comments);
  await nextButton(card, { label: "Finish" });
  data.comments = comments.value.trim(); data.finishedAt = new Date().toISOString();

  // One row per rated room per round, in the layout study1_gp.jl uses (middle and width, before and after).
  const mid = (x) => (x ? (x.low + x.high) / 2 : null), wid = (x) => (x ? x.high - x.low : null);
  data.modelRows = data.rounds.flatMap((r) => [
    { round: r.round, design: r.design, room: r.room, role: "seen", shared: 4, midBefore: mid(r.before), widthBefore: wid(r.before), midAfter: mid(r.after), widthAfter: wid(r.after) },
    ...[...r.neighbours].sort((a, b) => b.shared - a.shared).map((n) => ({ round: r.round, design: r.design, room: n.room, role: "neighbour", shared: n.shared, midBefore: mid(n.before), widthBefore: wid(n.before), midAfter: mid(n.after), widthAfter: wid(n.after) })),
  ]);
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
await welcome();
await instructions();
await check();
await practice();
await features();
await rounds();
await finish();
