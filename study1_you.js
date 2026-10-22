// study1_you.js: the right half of study1.html?viz=you. The models follow YOUR answers.
//
// After you see a room and rate it again, each model says how your ratings of similar rooms should move.
// When you rate a similar room, the panel compares your answer with each model's prediction and keeps
// a running score of which model predicts you best. For comparisons and feature tasks it also shows
// what the order-only model (M7) expected your shown rooms to do.
//
// How a prediction is made (all models share the same starting point, so they differ only in the move):
//   start  = where you would have put the similar room before the task, predicted from your earlier
//            ratings with a per-option regression (the "fitted prior")
//   move   = for the number (score) models: S_yQ S_QQ^-1 (your moves of the rooms you saw), i.e. the
//            share of your observed change that the model's links pass on to room y
//            for the order model: the probit update for "the room you rated higher beat the other"
//   prediction = start + move.   M1 (no spread) predicts move = 0.
import { FEATURES } from "./room.js";

const MODELS = [
  { key: "M1", label: "M1 no spread", kp: { c: 0, w: [0, 0, 0, 0], d: 100 }, col: "#b9b5ab" },
  { key: "M2", label: "M2 flat", kp: { c: 100, w: [0, 0, 0, 0], d: 0 }, col: "#77746c" },
  { key: "M3", label: "M3 linear additive", kp: { c: 20, w: [20, 20, 20, 20], d: 0 }, col: "#9cc3ef" },
  { key: "M4", label: "M4 additive", kp: { c: 20, w: [12.5, 12.5, 12.5, 12.5], d: 30 }, col: "#2a78d6" },
  { key: "M6b", label: "M6b distance", kp: { s2: 100, rho: [0.6, 0.6, 0.6, 0.6] }, col: "#d9822b" },
  { key: "M7", label: "M7 order only", kp: { c: 20, w: [12.5, 12.5, 12.5, 12.5], d: 30 }, col: "#b4456b", order: true },
];
const SIGMA = 5.8, GAMMA = 0.5;
const noiseVar = (n) => SIGMA * SIGMA * (1 + GAMMA * (n - 1));

function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function inv(A) {                                                    // Gauss-Jordan, small matrices
  const k = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12; for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(k));
}
const mid = (v) => (v.low + v.high) / 2;
const fmt = (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
const shared = (a, b) => [...a].filter((d, i) => d === b[i]).length;

export function createYou(panel, { queries: events }) {
  // ---- the rooms that appear in this session, and each model's covariance over them
  const codes = [...new Set(events.flatMap((e) => [...e.shown, ...e.neighbours]))];
  const n = codes.length, ix = Object.fromEntries(codes.map((c, i) => [c, i]));
  const kfun = (kp, x, y) => {
    if ("s2" in kp) { let v = kp.s2; for (let f = 0; f < 4; f++) if (x[f] !== y[f]) v *= kp.rho[f]; return v; }
    let v = kp.c; for (let f = 0; f < 4; f++) if (x[f] === y[f]) v += kp.w[f];
    return x === y ? v + kp.d : v;
  };
  const S = Object.fromEntries(MODELS.map((M) => [M.key, codes.map((a) => codes.map((b) => kfun(M.kp, a, b)))]));

  // ---- your answers
  const reports = new Map();            // room -> your latest middle
  let pre = new Map();                  // your answers known before the current task (+ its text ratings)
  let cur = { ev: -1, phase: null }, before = {}, after = {}, results = [], orderNotes = [], lastNote = "";
  const errors = Object.fromEntries(MODELS.map((M) => [M.key, []]));

  // where you would have put a room before this task: per-option ridge regression of your earlier answers
  function predictStart(target) {
    const keys = [...pre.keys()].filter((k) => k !== target), y = keys.map((k) => pre.get(k)), m = y.length;
    if (m < 3) return m ? y.reduce((a, b) => a + b, 0) / m : 0;
    const onehot = (c) => FEATURES.flatMap((_, f) => [1, 2, 3, 4].map((v) => (Number(c[f]) === v ? 1 : 0)));
    const X = keys.map(onehot), mu = y.reduce((a, b) => a + b, 0) / m, yc = y.map((v) => v - mu);
    const XtX = Array.from({ length: 16 }, (_, i) => Array.from({ length: 16 }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
    const Xty = Array.from({ length: 16 }, (_, i) => X.reduce((s, r, a) => s + r[i] * yc[a], 0));
    let best = null;
    for (const lam of [0.3, 1, 3, 10, 30, 100]) {
      const Ai = inv(XtX.map((r, i) => r.map((v, j) => v + (i === j ? lam : 0))));
      const beta = Ai.map((r) => r.reduce((s, v, j) => s + v * Xty[j], 0));
      const fit = X.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
      const tr = X.reduce((s, r) => s + r.reduce((t, v, i) => t + v * Ai[i].reduce((u, w, j) => u + w * r[j], 0), 0), 0);
      const rss = yc.reduce((s, v, a) => s + (v - fit[a]) ** 2, 0), gcv = m * rss / Math.max(m - tr, 1) ** 2;
      if (!best || gcv < best.gcv) best = { gcv, beta };
    }
    return mu + onehot(target).reduce((s, v, j) => s + v * best.beta[j], 0);
  }

  // ---- what each model predicts for room y, given your moves of the rooms you saw in this task
  function scoreMove(key, Q, dQ, y) {
    const SQ = Q.map((a) => Q.map((b) => S[key][ix[a]][ix[b]]));
    const scale = Math.max(...Q.map((a) => S[key][ix[a]][ix[a]]), 1), lam = 1e-6 * scale * scale;
    const StS = SQ.map((r, i) => SQ.map((_, j) => SQ.reduce((s, row) => s + row[i] * row[j], 0) + (i === j ? lam : 0)));
    const Std = SQ.map((_, i) => SQ.reduce((s, row, a) => s + row[i] * dQ[a], 0));
    const v = inv(StS).map((r) => r.reduce((s, x, j) => s + x * Std[j], 0));          // least squares: S_QQ v = your moves
    return Q.reduce((s, a, t) => s + S[key][ix[y]][ix[a]] * v[t], 0);
  }
  function orderMoves(screen, winner, nv) {                                           // probit update, from your text ratings
    const k = "M7", Sm = S[k], m0 = codes.map((c) => (screen.includes(c) ? (before[c] ?? reports.get(c) ?? 0) : 0));
    let m = m0.slice(); const Sc = Sm.map((r) => r.slice());
    for (const loser of screen.filter((c) => c !== winner)) {
      const i = ix[winner], j = ix[loser], u = Sc.map((r) => r[i] - r[j]);
      const s2 = u[i] - u[j] + 2 * nv, s = Math.sqrt(s2), z = (m[i] - m[j]) / s;
      const ph = Math.max(Phi(z), 1e-12), r = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) / ph;
      m = m.map((v, a) => v + u[a] * r / s);
      const f = r * (r + z) / s2;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) Sc[a][b] -= u[a] * u[b] * f;
    }
    return { move: (c) => m[ix[c]] - m0[ix[c]], S: Sc };
  }
  const shownOf = (e) => (e.kind === "feature" ? e.shown.slice(1) : e.shown);       // rooms giving new impressions
  const winnerOf = (e) => {
    if (e.kind === "feature") return e.picked ?? e.shown[0];
    const [a, b] = e.shown; return (after[b] ?? 0) > (after[a] ?? 0) ? b : a;
  };

  // ---- a similar room was just rated: compare with each model
  function scoreNeighbour(e, y, actual) {
    const Q = shownOf(e).filter((c) => before[c] !== undefined && after[c] !== undefined);
    const dQ = Q.map((c) => after[c] - before[c]);
    const start = predictStart(y);
    const preds = {};
    for (const M of MODELS) {
      let move = 0;
      if (M.order) { if (e.shown.length > 1) move = orderMoves(e.shown, winnerOf(e), noiseVar(e.shown.length)).move(y); }
      else if (Q.length) move = scoreMove(M.key, Q, dQ, y);
      preds[M.key] = start + move;
      errors[M.key].push(Math.abs(actual - preds[M.key]));
    }
    const seen = e.shown[0];
    results.unshift({ y, seen, sharedN: shared(y, seen), actual, start, preds, moves: Q.map((c, t) => [c, dQ[t]]) });
    results = results.slice(0, 6);
  }

  // ---- a task finished: update each model's beliefs and note what the order model expected
  function finishEvent(e, picked) {
    e.picked = picked;
    const Q = shownOf(e), nv = noiseVar(e.shown.length);
    if ((e.kind === "pair" || e.kind === "feature") && Q.every((c) => before[c] !== undefined && after[c] !== undefined)) {
      const om = orderMoves(e.shown, winnerOf(e), nv);
      orderNotes.unshift({ kind: e.kind, winner: winnerOf(e), rows: Q.map((c) => ({ c, yours: after[c] - before[c], order: om.move(c) })) });
      orderNotes = orderNotes.slice(0, 4);
    }
    for (const M of MODELS) {
      if (M.order) { if (e.shown.length > 1) S.M7 = orderMoves(e.shown, winnerOf(e), nv).S; continue; }
      const A = inv(Q.map((a) => Q.map((b) => S[M.key][ix[a]][ix[b]] + (a === b ? nv : 0))));
      const SQ = S[M.key].map((row) => Q.map((c) => row[ix[c]]));                    // n x k
      const G = SQ.map((r) => A.map((_, j) => r.reduce((s, v, t) => s + v * A[t][j], 0)));
      S[M.key] = S[M.key].map((row, a) => row.map((v, b) => v - G[a].reduce((s, g, t) => s + g * SQ[b][t], 0)));
    }
  }

  // ---- hooks called by study1.js
  function goTo(ev, phase) {
    if (ev !== cur.ev) { pre = new Map(reports); before = {}; after = {}; lastNote = ""; }
    cur = { ev, phase }; render();
  }
  function report(room, v) {
    if (!v) return;
    const e = events[cur.ev], x = mid(v);
    if (cur.phase === "before") { before[room] = x; pre.set(room, x); }
    else if (cur.phase === "see") {
      if (before[room] === undefined && reports.has(room) && e.kind !== "warmup") before[room] = reports.get(room);   // seen again: last answer
      after[room] = x;
      if (before[room] !== undefined) lastNote = `You moved ${room} from ${fmt(before[room])} to ${fmt(x)} (${fmt(x - before[room])}).`;
      else lastNote = `You rated ${room} at ${fmt(x)}.`;
    } else if (cur.phase === "neighbours") scoreNeighbour(e, room, x);
    reports.set(room, x);
    render();
  }
  function recordEvent(ev, kind, rows, picked) { finishEvent(events[ev], picked); render(); }

  // ---- drawing
  panel.hidden = false;
  panel.innerHTML = `
    <div class="vz-head">
      <div class="vz-eyebrow">The models follow you</div>
      <p class="vz-sub">After you see a room, each model predicts how your ratings of similar rooms will move. When you rate a similar room, you'll see how close each model came. All models start from the same point, predicted from your earlier ratings, so they differ only in how much of your change they pass on. <a href="?viz=1">Switch to a simulated person</a>.</p>
    </div>
    <div class="vz-status" id="yStatus"></div>
    <section class="vz-chart"><h3>Which model predicts you best so far</h3>
      <p class="vz-note">Average distance between each model's prediction and your rating of the similar rooms (smaller is better).</p>
      <div id="yScore"></div></section>
    <section class="vz-chart"><h3>Your similar-room ratings vs the predictions</h3>
      <p class="vz-note">Black diamond: your rating (middle of your range). Dots: each model's prediction. Grey line: where your earlier ratings put the room before the task.</p>
      <div id="yResults"></div></section>
    <section class="vz-chart"><h3>Score or order?</h3>
      <p class="vz-note">After comparisons and feature tasks: how you moved the rooms you saw, and what the order-only model (M7) expected. If you only took in which room was better, the others would move down.</p>
      <div id="yOrder"></div></section>`;
  const $ = (id) => panel.querySelector("#" + id);
  const x = (v) => `${Math.max(0, Math.min(100, v + 50))}%`;
  function strip(r) {
    const dots = MODELS.map((M) => `<span class="y-dot" style="left:${x(r.preds[M.key])};background:${M.col}" title="${M.label}: ${fmt(r.preds[M.key])}"></span>`).join("");
    return `<div class="y-strip"><span class="y-start" style="left:${x(r.start)}"></span>${dots}<span class="y-you" style="left:${x(r.actual)}" title="you: ${fmt(r.actual)}"></span></div>`;
  }
  function render() {
    const e = events[cur.ev];
    const where = e ? `Step ${cur.ev + 1} of ${events.length} · ${e.kind === "warmup" ? "warm-up room" : e.kind === "base" ? "a room seen again" : e.kind === "feature" ? "three versions" : e.kind === "pair" ? "two rooms" : "one room"}` : "";
    const waiting = cur.phase === "neighbours" ? "The models have made their predictions for this similar room. Answer, then see how they did." : "";
    $("yStatus").innerHTML = `<b>${where}</b><br>${lastNote}${waiting ? "<br>" + waiting : ""}`;
    const rows = MODELS.map((M) => ({ M, n: errors[M.key].length, err: errors[M.key].length ? errors[M.key].reduce((a, b) => a + b, 0) / errors[M.key].length : null }));
    const max = Math.max(1, ...rows.map((r) => r.err ?? 0));
    const sorted = rows.slice().sort((a, b) => (a.err ?? 1e9) - (b.err ?? 1e9));
    $("yScore").innerHTML = rows[0].n === 0 ? `<p class="vz-note">No similar rooms rated yet.</p>` :
      sorted.map((r) => `<div class="y-bar"><span>${r.M.label}</span><i style="width:${(100 * (r.err ?? 0)) / max}%;background:${r.M.col}"></i><b>${r.err === null ? "–" : r.err.toFixed(1)}</b></div>`).join("") +
      `<p class="vz-note">${rows[0].n} similar room${rows[0].n === 1 ? "" : "s"} so far. M1's error is how far you were from your own earlier ratings: anything a spread model gains over M1 is learning that spread.</p>`;
    $("yResults").innerHTML = results.length === 0 ? `<p class="vz-note">Appears after your first similar room.</p>` : results.map((r) => `
      <div class="y-item"><div class="y-head"><b>${r.y}</b> (shares ${r.sharedN} of 4 options with ${r.seen}) · you: <b>${fmt(r.actual)}</b> · your earlier ratings suggested ${fmt(r.start)} · you moved ${r.moves.map(([c, d]) => `${c} ${fmt(d)}`).join(", ") || "nothing yet"}</div>
      ${strip(r)}<div class="y-legend">${MODELS.map((M) => `<span><i style="background:${M.col}"></i>${M.key} ${fmt(r.preds[M.key])}</span>`).join("")}</div></div>`).join("");
    $("yOrder").innerHTML = orderNotes.length === 0 ? `<p class="vz-note">Appears after your first comparison or feature task.</p>` : orderNotes.map((o) => `
      <div class="y-item"><div class="y-head">${o.kind === "pair" ? "Comparison" : "Feature task"} · you preferred <b>${o.winner}</b></div>
      ${o.rows.map((r) => `<div class="y-ord"><span>${r.c}</span><span>you ${fmt(r.yours)}</span><span>order-only model ${fmt(r.order)}</span><span>${r.c === o.winner ? "" : (r.yours > 0.5 ? "went up: looks like a score" : r.yours < -0.5 ? "went down: fits order-only" : "barely moved")}</span></div>`).join("")}</div>`).join("");
  }
  render();
  return { goTo, report, recordEvent, answer: () => null, picked: () => null };
}
