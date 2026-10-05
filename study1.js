// Study 1: what do people learn about their own preferences from seeing a room?
//
// Flow:  welcome -> instructions -> slider practice
//        -> look at the 16 options, one at a time (no ratings)
//        -> first guess for each of 16 rooms, from a text description
//        -> sixteen rounds: second guess from text, see the room, rate it
//        -> comments, save
//
// Add ?debug=1 to the address for a short version (3 rooms, no waiting).
import { Room, FEATURES, LEVELS, DESCRIPTIONS, FEATURE_NAMES } from "./room.js";

// ---------------------------------------------------------------- settings
const CONFIG = {
  saveUrl: "",            // if set, the data are sent here as JSON (POST) at the end
  completionUrl: "",      // if set, a link back to the recruitment site is shown at the end
  minOptionViewMs: 3000,  // each option must be looked at for at least this long
  minRoomViewMs: 3000,    // each room must be looked at for at least this long
  askRange: true,         // first guess: also ask for the lowest and highest plausible value
  askMatch: true,         // after seeing a room: "how closely did it match what you pictured?"
};

// The 16 rooms, as (furniture, lighting, wall, decor) labels 1-4. Every option is in exactly
// four rooms and any two rooms share at most one option. Which real option is "1", "2", ...
// is shuffled for each participant below.
const ROOM_CODES = "1111 1223 1334 1442 2122 2214 2343 2431 3133 3241 3312 3424 4144 4232 4321 4413".split(" ");

// ---------------------------------------------------------------- participant and randomisation
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const seed = Number(params.get("seed")) || Math.floor(Math.random() * 2 ** 31);

function mulberry32(a) {   // small seeded random number generator, so a session can be reproduced
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const random = mulberry32(seed);
function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// mapping[feature][k] is the real option that plays the role of label k+1 for this participant
const mapping = Object.fromEntries(FEATURES.map((f) => [f, shuffle(LEVELS[f])]));
const roomOptions = (code) => Object.fromEntries(FEATURES.map((f, i) => [f, mapping[f][Number(code[i]) - 1]]));

const codes = DEBUG ? ROOM_CODES.slice(0, 3) : ROOM_CODES;
const firstGuessOrder = shuffle(codes);   // order of rooms in the first-guess block
const roundOrder = shuffle(codes);        // order in which rooms are shown

const data = {
  study: "study1", version: 1, seed, debug: DEBUG,
  participant: params.get("PROLIFIC_PID") || params.get("pid") || `anon-${seed}`,
  urlParams: Object.fromEntries(params),
  userAgent: navigator.userAgent,
  screen: { width: window.innerWidth, height: window.innerHeight },
  startedAt: new Date().toISOString(),
  mapping, firstGuessOrder, roundOrder,
  practice: null, options: [], firstGuesses: [], rounds: [], comments: "", finishedAt: null,
};
const backupKey = `study1-${data.participant}`;
function backup() { try { localStorage.setItem(backupKey, JSON.stringify(data)); } catch (e) { /* storage unavailable: carry on */ } }

// ---------------------------------------------------------------- small helpers for building screens
const screenEl = document.querySelector("#screen");
let openRoom = null;   // the 3D room currently on screen, if any

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, v); }
  node.append(...children);
  return node;
}

function newCard(step) {
  if (openRoom) { openRoom.dispose(); openRoom = null; }
  screenEl.replaceChildren();
  const card = el("div", { class: "card" });
  if (step) card.append(el("div", { class: "step", text: step }));
  screenEl.append(card);
  window.scrollTo(0, 0);
  return card;
}

function setProgress(fraction) { document.querySelector("#progressFill").style.width = `${Math.round(100 * fraction)}%`; }

// A row with a hint, an error line and a Next button. `ready()` says whether the participant
// may continue; `minMs` keeps the button disabled for a minimum time.
function nextButton(card, { label = "Next", minMs = 0, ready = () => true, hint = "" } = {}) {
  const error = el("div", { class: "error" });
  const button = el("button", { class: "button", text: label });
  const row = el("div", { class: "actions" }, el("span", { class: "hint", text: hint }), button);
  card.append(error, row);
  const shown = performance.now();
  const wait = DEBUG ? 0 : minMs;
  if (wait > 0) { button.disabled = true; setTimeout(() => { button.disabled = false; }, wait); }
  return new Promise((resolve) => {
    button.onclick = () => {
      const problem = ready();
      if (problem !== true) { error.textContent = problem; return; }
      resolve(Math.round(performance.now() - shown));
    };
  });
}

// A 0-100 slider with no visible handle until the participant clicks on the line.
function slider(question, left, right) {
  const input = el("input", { type: "range", min: "0", max: "100", step: "1", value: "50", "aria-label": question });
  const node = el("div", { class: "slider untouched" }, el("div", { class: "question", text: question }), input,
    el("div", { class: "ends" }, el("span", { text: left }), el("span", { text: right })));
  let touched = false;
  const touch = () => { touched = true; node.classList.remove("untouched"); };
  input.addEventListener("input", touch);
  input.addEventListener("pointerdown", touch);
  input.addEventListener("keydown", touch);
  return { node, value: () => (touched ? Number(input.value) : null) };
}

function describe(options) {   // a room in words, one line per feature
  return el("ul", { class: "description" }, ...FEATURES.map((f) =>
    el("li", {}, el("span", { class: "feature", text: FEATURE_NAMES[f] }), el("span", { text: DESCRIPTIONS[options[f]] }))));
}

function roomView(card) { const view = el("div", { class: "room-view" }); card.append(view); return view; }

const allAnswered = (...sliders) => () => (sliders.every((s) => s.value() !== null) ? true : "Please answer each question by clicking on the line.");

// ---------------------------------------------------------------- the screens
async function welcome() {
  const card = newCard();
  card.append(
    el("h1", { text: "Room Design Study" }),
    el("p", { text: "In this study you will look at designs for a living room and tell us how much you like them. It takes about 20 minutes." }),
    el("p", { text: "There are no right or wrong answers. We are interested in your own taste." }),
    // TODO: replace with the approved consent text.
    el("p", { text: "[Consent information goes here.]" }));
  await nextButton(card, { label: "Begin" });
}

async function instructions() {
  const card = newCard();
  card.append(
    el("h2", { text: "What you will do" }),
    el("p", { text: "Every room has four things that can vary: the furniture, the lighting, the walls and the wall decor." }),
    el("ol", {},
      el("li", { text: "First you will see each choice of furniture, lighting, walls and decor on its own, so you know what it looks like." }),
      el("li", { text: "Then you will read descriptions of rooms and guess how much you would like each one." }),
      el("li", { text: "Then you will see the rooms one at a time and say how much you actually like them." })),
    el("p", { text: "You answer by clicking on a line. The left end means \"not at all\" and the right end means \"very much\"." }));
  await nextButton(card);
}

async function practice() {
  const card = newCard("Practice");
  card.append(el("h2", { text: "Try the slider" }), el("p", { text: "Click anywhere on the line to answer. You can drag the handle to adjust." }));
  const s = slider("How much do you like rainy days?", "Not at all", "Very much");
  card.append(s.node);
  const ms = await nextButton(card, { ready: allAnswered(s) });
  data.practice = { value: s.value(), ms };
}

async function lookAtOptions() {
  const intro = newCard("Part 1 of 3");
  intro.append(el("h2", { text: "The choices" }),
    el("p", { text: "You will now see each choice on its own, in a plain grey room. There are four kinds of furniture, four kinds of lighting, four kinds of walls and four kinds of wall decor." }),
    el("p", { text: "Please look at each one carefully. You will need to remember what they look like. There is nothing to answer in this part." }));
  await nextButton(intro);

  const list = FEATURES.flatMap((f) => shuffle(LEVELS[f]).map((option) => ({ feature: f, option })));
  for (const [i, { feature, option }] of list.entries()) {
    setProgress(0.02 + 0.13 * (i / list.length));
    const card = newCard(`Part 1 of 3 · ${FEATURE_NAMES[feature]}`);
    card.append(el("div", { class: "option-name", text: DESCRIPTIONS[option] }));
    openRoom = new Room(roomView(card));
    openRoom.showOption(feature, option);
    const ms = await nextButton(card, { minMs: CONFIG.minOptionViewMs, hint: `${i + 1} of ${list.length}` });
    data.options.push({ position: i + 1, feature, option, ms });
    backup();
  }
}

async function firstGuesses() {
  const intro = newCard("Part 2 of 3");
  intro.append(el("h2", { text: "Guess how much you would like each room" }),
    el("p", { text: "You will now read descriptions of rooms. You will not see the rooms yet." }),
    el("p", { text: "For each one, picture the room and guess how much you would like it." + (CONFIG.askRange ? " Then tell us the lowest and the highest that your liking could plausibly turn out to be." : "") }));
  await nextButton(intro);

  for (const [i, code] of firstGuessOrder.entries()) {
    setProgress(0.15 + 0.25 * (i / firstGuessOrder.length));
    const options = roomOptions(code);
    const card = newCard("Part 2 of 3");
    card.append(el("h2", { text: "A room with:" }), describe(options));
    const best = slider("How much do you think you would like this room?", "Not at all", "Very much");
    card.append(best.node);
    let low = null, high = null;
    if (CONFIG.askRange) {
      low = slider("What is the lowest your liking could plausibly be?", "Not at all", "Very much");
      high = slider("What is the highest your liking could plausibly be?", "Not at all", "Very much");
      card.append(low.node, high.node);
    }
    const ready = () => {
      const answered = allAnswered(...[best, low, high].filter(Boolean))();
      if (answered !== true) return answered;
      if (CONFIG.askRange && !(low.value() <= best.value() && best.value() <= high.value())) return "Your lowest should not be above your guess, and your highest should not be below it.";
      return true;
    };
    const ms = await nextButton(card, { ready, hint: `${i + 1} of ${firstGuessOrder.length}` });
    data.firstGuesses.push({ position: i + 1, room: code, options, guess: best.value(), low: low && low.value(), high: high && high.value(), ms });
    backup();
  }
}

async function rounds() {
  const intro = newCard("Part 3 of 3");
  intro.append(el("h2", { text: "Now see the rooms" }),
    el("p", { text: "You will now go through the rooms one at a time. Each time, you will first read the description and guess again how much you would like the room. Then you will see it and say how much you actually like it." }),
    el("p", { text: "Your guess may be the same as before or different. Answer with whatever you think now." }));
  await nextButton(intro);

  for (const [i, code] of roundOrder.entries()) {
    const options = roomOptions(code);
    const hint = `Room ${i + 1} of ${roundOrder.length}`;

    // second guess, from the description; the earlier answer is not shown
    setProgress(0.4 + 0.58 * (i / roundOrder.length));
    const guessCard = newCard("Part 3 of 3 · Guess");
    guessCard.append(el("h2", { text: "A room with:" }), describe(options));
    const guess = slider("How much do you think you would like this room?", "Not at all", "Very much");
    guessCard.append(guess.node);
    const guessMs = await nextButton(guessCard, { label: "See the room", ready: allAnswered(guess), hint });

    // the room itself
    setProgress(0.4 + 0.58 * ((i + 0.5) / roundOrder.length));
    const seeCard = newCard("Part 3 of 3 · The room");
    openRoom = new Room(roomView(seeCard), options);
    const liking = slider("How much do you like this room?", "Not at all", "Very much");
    seeCard.append(liking.node);
    let match = null;
    if (CONFIG.askMatch) { match = slider("How closely does it match what you pictured?", "Not at all", "Exactly"); seeCard.append(match.node); }
    const seeMs = await nextButton(seeCard, { minMs: CONFIG.minRoomViewMs, ready: allAnswered(...[liking, match].filter(Boolean)), hint });

    data.rounds.push({ round: i + 1, room: code, options, guess: guess.value(), liking: liking.value(), match: match && match.value(), guessMs, seeMs });
    backup();
  }
}

async function finish() {
  setProgress(0.98);
  const card = newCard();
  const comments = el("textarea", { class: "comments", placeholder: "Optional" });
  card.append(el("h2", { text: "Almost done" }), el("p", { text: "Is there anything you would like to tell us about the study? For example, was anything unclear?" }), comments);
  await nextButton(card, { label: "Finish" });
  data.comments = comments.value.trim();
  data.finishedAt = new Date().toISOString();

  // One row per room in the order shown: what the analysis needs.
  const first = Object.fromEntries(data.firstGuesses.map((g) => [g.room, g]));
  data.modelRows = data.rounds.map((r) => ({ round: r.round, room: r.room, s: first[r.room].guess, low: first[r.room].low, high: first[r.room].high, p: r.guess, o: r.liking, match: r.match }));
  backup();

  let saved = false;
  if (CONFIG.saveUrl) {
    try { const response = await fetch(CONFIG.saveUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); saved = response.ok; } catch (e) { saved = false; }
  }

  setProgress(1);
  const done = newCard();
  done.append(el("h1", { text: "Thank you" }));
  const file = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const download = el("a", { class: "button", href: URL.createObjectURL(file), download: `study1-${data.participant}.json`, text: "Download my answers" });
  download.style.cssText = "display:inline-flex;align-items:center;justify-content:center;text-decoration:none;width:220px";
  if (saved) done.append(el("p", { text: "Your answers have been saved." }));
  else done.append(el("p", { text: CONFIG.saveUrl ? "Your answers could not be sent. Please download them and send the file to the researcher." : "Please download your answers and send the file to the researcher." }), download);
  if (CONFIG.completionUrl) done.append(el("p", {}, el("a", { href: CONFIG.completionUrl, text: "Click here to complete the study." })));
}

// ---------------------------------------------------------------- run
window.study1 = data;   // for inspection in the browser console
await welcome();
await instructions();
await practice();
await lookAtOptions();
await firstGuesses();
await rounds();
await finish();
