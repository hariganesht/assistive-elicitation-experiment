// study1_viz.js: the right half of study1.html?viz=1. The graphs follow your own answers.
//
// How the model reads your answers (the Study 1 learning model, as in fit5.py / study1_short.jl):
//   - Start of a task: for a room you have rated, your latest rating. For a room you have not rated, the
//     average of your ratings from descriptions so far (Zhi-Xuan's baseline prior, 22 Oct; 0 before any).
//   - After you see a room, number model: your change for the room seen is spread to every room with the
//     kernel, move(y) = S_yQ S_QQ^-1 (your change); the noise cancels out of this. The uncertainty S
//     shrinks as in the model, with noise variance sigma^2 (1 + gamma (rooms on screen - 1)).
//   - Order model: only which room you rated higher (or picked) is used, with the probit update.
//   - Your answers after seeing are drawn as black marks, to compare with what the model expected.
// The panel shows (asked for on 8, 15 and 22 Oct): your ratings and the model's guess for all rooms, grouped by
// how many options they share with the room on screen; one room
// and its 12 single-feature neighbours; kernel controls (and noise and number-vs-order); and, for a
// preference query, how far each room moves under the number model vs the order model.
import { FEATURES, FEATURE_NAMES } from "./room.js";

const SHORT = {
  "connected-l": "L-shaped sofa", "sofa-chairs": "sofa + 2 chairs", "sofa-beanbag": "sofa + beanbag", "four-armchairs": "4 armchairs",
  "bright-overhead": "ceiling lights", "localized-lamps": "floor lamps", "pendant-cluster": "pendants", chandelier: "chandelier",
  neutral: "off-white", warm: "terracotta", dark: "charcoal", brick: "brick",
  "photo-frames": "pictures", bicycle: "bicycle", "wall-bookshelf": "bookshelves", "hanging-plants": "plants",
};

// ---------------------------------------------------------------- rooms
const ROOMS = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) ROOMS.push([a, b, c, d]);
const N = ROOMS.length;
const idxOf = (code) => 64 * (code[0] - 1) + 16 * (code[1] - 1) + 4 * (code[2] - 1) + (code[3] - 1);
const codeOf = (i) => ROOMS[i].map((v) => v + 1).join("");
const variants = (r, f) => [0, 1, 2, 3].filter((v) => v !== r[f]).map((v) => r.map((x, g) => (g === f ? v : x)));
const sharedN = (i, j) => ROOMS[i].filter((v, f) => v === ROOMS[j][f]).length;
const mid = (v) => (v.low + v.high) / 2;

function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// ---------------------------------------------------------------- linear algebra
function invSmall(A, k) {
  const M = A.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(k));
}
// Number model, uncertainty: S <- S - S_.Q (S_QQ + nv I)^-1 S_Q.
function shrink(S, Q, nv) {
  const k = Q.length, S2 = Float64Array.from(S); if (!k) return S2;
  const Ai = invSmall(Q.map((i) => Q.map((j) => S[i * N + j] + (i === j ? nv : 0))), k);
  const G = new Float64Array(N * k);
  for (let r = 0; r < N; r++) for (let c = 0; c < k; c++) { let s = 0; for (let t = 0; t < k; t++) s += S[r * N + Q[t]] * Ai[t][c]; G[r * k + c] = s; }
  for (let r = 0; r < N; r++) for (let j = 0; j < N; j++) { let s = 0; for (let c = 0; c < k; c++) s += G[r * k + c] * S[Q[c] * N + j]; S2[r * N + j] -= s; }
  return S2;
}
// Order model: "i is liked more than j", the probit update (moment matched). Each room has noise nv.
function seePair(B, i, j, nv) {
  const { m, S } = B;
  const u = new Float64Array(N); for (let r = 0; r < N; r++) u[r] = S[r * N + i] - S[r * N + j];
  const s2 = u[i] - u[j] + 2 * nv, s = Math.sqrt(s2), z = (m[i] - m[j]) / s;
  const ph = Math.max(Phi(z), 1e-12), r = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) / ph;
  for (let a = 0; a < N; a++) m[a] += u[a] * r / s;
  const f = r * (r + z) / s2;
  for (let a = 0; a < N; a++) { const ua = u[a] * f; if (ua === 0) continue; for (let b = 0; b < N; b++) S[a * N + b] -= ua * u[b]; }
}

// ---------------------------------------------------------------- the viz
export function createViz(panel, { queries, mapping }) {
  // Kernel k(x, y) = c + sum_f w_f [x_f = y_f] + d [x = y]; noise variance sigma^2 (1 + gamma (rooms shown - 1)).
  const P = { c: 20, w: [12.5, 12.5, 12.5, 12.5], d: 30, sigma: 5.8, gamma: 0.5, obs: "utility" };
  const optName = (f, v) => SHORT[mapping[FEATURES[f]][v]];
  const describeRoom = (i) => ROOMS[i].map((v, f) => optName(f, v)).join(", ");
  const noiseVar = (k) => P.sigma * P.sigma * (1 + P.gamma * (k - 1));

  // Your answers, per event: before = from the description, after = after seeing (or a similar room rated afterwards).
  const hist = queries.map(() => ({ before: {}, after: {}, pick: null }));
  let K, Sb, view = { qi: 0, phase: "before", nb: null }, focusOverride = null, queued = false;

  function build() {
    K = new Float64Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      let v = P.c; for (let f = 0; f < 4; f++) if (ROOMS[i][f] === ROOMS[j][f]) v += P.w[f];
      K[i * N + j] = v + (i === j ? P.d : 0);
    }
    Sb = [K];                                     // Sb[e]: the uncertainty before event e
  }

  // Your latest rating (midpoint) of each room up to event e; with ranges = true, the latest range itself.
  function ratings(e, withBefore, withAfter, ranges = false) {
    const y = new Map();
    for (let t = 0; t <= e; t++) {
      const h = hist[t];
      if (t < e || withBefore) for (const [c, v] of Object.entries(h.before)) if (v) y.set(idxOf(c), ranges ? v : mid(v));
      if (t < e || withAfter) for (const [c, v] of Object.entries(h.after)) if (v) y.set(idxOf(c), ranges ? v : mid(v));
    }
    return y;
  }
  // Start of event e: your latest rating where there is one; otherwise the average of your ratings from
  // descriptions so far (the baseline prior from the 22 Oct meeting).
  function startOf(e) {
    const text = [];
    for (let t = 0; t <= e; t++) for (const v of Object.values(hist[t].before)) if (v) text.push(mid(v));
    const base = text.length ? text.reduce((a, b) => a + b, 0) / text.length : 0;
    const m = new Float64Array(N).fill(base);
    for (const [i, v] of ratings(e, true, false)) m[i] = v;
    return m;
  }
  // What event e does to the model, from the start and your answers after seeing. ready = you have rated every room seen.
  function update(e, S, start, obs) {
    const q = queries[e], h = hist[e], nv = noiseVar(q.shown.length);
    const read = q.shown.filter((_, t) => q.read[t]), Q = read.map(idxOf);
    const ready = read.every((c) => h.after[c]);
    const move = new Float64Array(N);
    if (!ready) return { ready, move, S };
    if (obs === "utility") {
      const dQ = read.map((c, t) => mid(h.after[c]) - start[Q[t]]);
      const x = invSmall(Q.map((i) => Q.map((j) => S[i * N + j] + (i === j ? 1e-9 : 0))), Q.length).map((row) => row.reduce((s, v, t) => s + v * dQ[t], 0));
      for (let r = 0; r < N; r++) { let s = 0; for (let t = 0; t < Q.length; t++) s += S[r * N + Q[t]] * x[t]; move[r] = s; }
      return { ready, move, S: shrink(S, Q, nv) };
    }
    const B = { m: Float64Array.from(start), S: Float64Array.from(S) };
    const val = (c) => (h.after[c] ? mid(h.after[c]) : start[idxOf(c)]);
    if (q.kind === "feature") {
      const win = h.pick ?? [...q.shown].sort((a, b) => val(b) - val(a))[0];
      for (const c of q.shown) if (c !== win) seePair(B, idxOf(win), idxOf(c), nv);
    } else if (q.kind === "pair" || q.kind === "preference") {
      const ranked = [...q.shown].sort((a, b) => val(b) - val(a));
      for (let t = 0; t + 1 < ranked.length; t++) seePair(B, idxOf(ranked[t]), idxOf(ranked[t + 1]), nv);
    }                                             // one room alone: the order model learns nothing
    for (let r = 0; r < N; r++) move[r] = B.m[r] - start[r];
    return { ready, move, S: B.S };
  }
  function Sbefore(e) {
    while (Sb.length <= e) { const t = Sb.length - 1; Sb.push(update(t, Sb[t], startOf(t), P.obs).S); }
    return Sb[e];
  }
  // Everything the graphs need for the current screen.
  function state() {
    const e = view.qi, S0 = Sbefore(e), start = startOf(e);
    const u = view.phase === "before" ? { ready: false } : update(e, S0, start, P.obs);
    const now = u.ready ? start.map((v, i) => v + u.move[i]) : start;
    return { e, S0, start, now, S1: u.ready ? u.S : S0, ready: u.ready };
  }

  // ------------------------------------------------------------ hooks from the task
  function render() { queued = false; const st = state(); drawAll(st); drawNeighbours(st); drawCompare(st); }
  function later() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  function goTo(qi, phase, nb = null) { view = { qi, phase, nb }; focusOverride = null; render(); }
  function live(code, v) { hist[view.qi][view.phase === "before" ? "before" : "after"][code] = v; later(); }
  function pick(code) { hist[view.qi].pick = code; later(); }
  function rebuild() { build(); render(); }

  // ------------------------------------------------------------ the panel
  panel.hidden = false;
  panel.innerHTML = `
    <div class="vz-head">
      <div id="vzParams" class="vz-params"></div>
    </div>
    <section class="vz-chart"><h3 id="vzAllTitle">Your ratings and model's guess for all rooms</h3>
      <p class="vz-note">Rooms grouped by how many options they share with the room on screen; within a group, sorted by the model's guess. Line and band: the model's guess now, ± 2 sd. Black bars: your latest range.</p>
      <svg id="vzAll" viewBox="0 0 560 210" role="img" aria-label="Your ratings and the model's guess for all rooms, by options shared"></svg></section>
    <section class="vz-chart"><h3 id="vzNbTitle">Room and its 12 neighbours</h3>
      <p class="vz-note">Each row changes one feature of the room. Dashed: the model's guess before this task. Solid: after you saw the room. Outlined: on screen now.</p>
      <div id="vzNb" class="vz-nbgrid"></div></section>
    <section class="vz-chart" id="vzCmpBox"><h3>Preference query: number or order</h3>
      <p class="vz-note">How far each room moves in this task, from the same starting guesses and your same answers. Blue: you take in a number for each room. Orange: you take in only which room is better. Black diamond: how far you actually moved.</p>
      <svg id="vzCmp" viewBox="0 0 560 210" role="img" aria-label="Moves under the number and order models, and yours"></svg></section>
    <div class="vz-tip" id="vzTip" hidden></div>`;
  const $ = (id) => panel.querySelector("#" + id);

  function params() {
    const box = $("vzParams"); box.replaceChildren();
    const head = (t) => { const h = document.createElement("div"); h.className = "vz-phead"; h.textContent = t; box.append(h); };
    const add = (label, get, set, min, max, step) => {
      const row = document.createElement("label"); row.className = "vz-slider";
      const sp = document.createElement("span"); sp.textContent = label;
      const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
      const out = document.createElement("output"); out.textContent = Number(get()).toFixed(step < 1 ? 2 : 0);
      inp.addEventListener("input", () => { set(Number(inp.value)); out.textContent = Number(inp.value).toFixed(step < 1 ? 2 : 0); });
      inp.addEventListener("change", rebuild);
      row.append(sp, inp, out); box.append(row);
    };
    head("Kernel");
    add("c, all rooms", () => P.c, (v) => (P.c = v), 0, 100, 1);
    FEATURES.forEach((f, k) => add(`w, ${FEATURE_NAMES[f].toLowerCase()}`, () => P.w[k], (v) => (P.w[k] = v), 0, 40, 0.5));
    add("d, the room alone", () => P.d, (v) => (P.d = v), 0, 100, 1);
    head("Noise and observation");
    add("σ, noise", () => P.sigma, (v) => (P.sigma = v), 1, 20, 0.1);
    add("γ, extra per room", () => P.gamma, (v) => (P.gamma = v), 0, 2, 0.05);
    const obs = document.createElement("label"); obs.className = "vz-slider";
    obs.innerHTML = `<span>You take in</span><select><option value="utility">a number (utility)</option><option value="ranking">only the order (ranking)</option></select><output></output>`;
    const s = obs.querySelector("select"); s.value = P.obs; s.addEventListener("change", () => { P.obs = s.value; rebuild(); });
    box.append(obs);
  }

  // ------------------------------------------------------------ drawing
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  const tip = $("vzTip");
  function hover(node, html) {
    node.addEventListener("pointermove", (e) => { tip.hidden = false; tip.innerHTML = html; tip.style.left = Math.min(e.clientX + 12, innerWidth - 280) + "px"; tip.style.top = (e.clientY + 12) + "px"; });
    node.addEventListener("pointerleave", () => { tip.hidden = true; });
  }
  const f1 = (x) => x.toFixed(1), sgn = (x) => (x >= 0 ? "+" : "") + f1(x);
  const sdOf = (S, i) => Math.sqrt(Math.max(S[i * N + i], 0));
  const onScreen = () => {
    const q = queries[view.qi];
    if (view.phase === "neighbours" && view.nb) return new Set([idxOf(view.nb)]);
    return new Set(q.shown.map(idxOf));
  };
  const focus = () => focusOverride ?? idxOf(queries[view.qi].shown[0]);
  const yours = (code) => { const v = hist[view.qi].after[code]; return v ? mid(v) : null; };   // your answer after seeing, this task
  function neighbourRows() {
    const fc = ROOMS[focus()], rows = [{ i: focus(), group: -1 }];
    for (let f = 0; f < 4; f++) for (const v of variants(fc, f)) rows.push({ i: 64 * v[0] + 16 * v[1] + 4 * v[2] + v[3], group: f, label: optName(f, v[f]) });
    return rows;
  }

  // Graph 1, grouped (22 Oct): one panel per number of options shared with the room on screen (4, 3, 2, 1, 0).
  function drawAll(st) {
    const svg = $("vzAll"); svg.replaceChildren();
    const W = 560, H = 210, L = 32, R = 4, T = 22, Bt = 8, gap = 8, ref = focus(), ranges = ratings(view.qi, true, true, true);
    $("vzAllTitle").textContent = `Your ratings and model's guess for all rooms, by options shared with ${codeOf(ref)}`;
    const groups = [4, 3, 2, 1, 0].map((g) => [...Array(N).keys()].filter((i) => sharedN(i, ref) === g).sort((a, b) => st.now[a] - st.now[b]));
    let lo = -10, hi = 10;
    for (let i = 0; i < N; i++) { lo = Math.min(lo, st.now[i] - 2 * sdOf(st.S1, i)); hi = Math.max(hi, st.now[i] + 2 * sdOf(st.S1, i)); }
    for (const v of ranges.values()) { lo = Math.min(lo, v.low); hi = Math.max(hi, v.high); }
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const step = hi - lo > 80 ? 20 : 10, y = (v) => T + (hi - v) * (H - T - Bt) / (hi - lo);
    for (let v = lo; v <= hi; v += step) { svg.append(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? "#a9a59b" : "var(--line)", "stroke-width": 1 })); svg.append(el("text", { x: L - 5, y: y(v) + 4, "text-anchor": "end", class: "vz-ax" }, v)); }
    const pw = (W - L - R - gap * 4) / 5;
    groups.forEach((rooms, gi) => {
      const x0 = L + gi * (pw + gap), n = rooms.length, x = (k) => x0 + (n === 1 ? pw / 2 : (k + 0.5) * pw / n);
      svg.append(el("rect", { x: x0, y: T, width: pw, height: H - T - Bt, fill: "none", stroke: "var(--line)" }));
      svg.append(el("text", { x: x0 + pw / 2, y: T - 8, "text-anchor": "middle", class: "vz-lab" }, `${4 - gi} shared · ${n}`));
      if (n === 1) {
        const i = rooms[0], sd2 = 2 * sdOf(st.S1, i);
        svg.append(el("rect", { x: x(0) - 7, y: y(st.now[i] + sd2), width: 14, height: Math.max(y(st.now[i] - sd2) - y(st.now[i] + sd2), 1), fill: "var(--vz-belief-soft)" }));
        svg.append(el("line", { x1: x(0) - 9, x2: x(0) + 9, y1: y(st.now[i]), y2: y(st.now[i]), stroke: "var(--vz-belief)", "stroke-width": 2 }));
      } else {
        let up = "", dn = "";
        rooms.forEach((i, k) => { up += `${x(k)},${y(st.now[i] + 2 * sdOf(st.S1, i))} `; dn = `${x(k)},${y(st.now[i] - 2 * sdOf(st.S1, i))} ` + dn; });
        svg.append(el("polygon", { points: up + dn, fill: "var(--vz-belief-soft)" }));
        svg.append(el("polyline", { points: rooms.map((i, k) => `${x(k)},${y(st.now[i])}`).join(" "), fill: "none", stroke: "var(--vz-belief)", "stroke-width": 1.5 }));
      }
      rooms.forEach((i, k) => {
        const r = ranges.get(i);
        if (r) { svg.append(el("line", { x1: x(k), x2: x(k), y1: y(r.high), y2: y(r.low), stroke: "var(--ink)", "stroke-width": 2.2 })); svg.append(el("circle", { cx: x(k), cy: y(mid(r)), r: 2.2, fill: "var(--ink)" })); }
        const hitW = Math.max(pw / n, 2);
        const hit = el("rect", { x: x(k) - hitW / 2, y: T, width: hitW, height: H - T - Bt, fill: "transparent", style: "cursor:pointer" });
        hover(hit, `${codeOf(i)}: ${describeRoom(i)}<br>shares ${4 - gi} options with ${codeOf(ref)}<br>model's guess ${f1(st.now[i])} ± ${f1(2 * sdOf(st.S1, i))}` + (r ? `<br>your latest range ${f1(r.low)} to ${f1(r.high)}` : "<br>not rated yet"));
        hit.addEventListener("click", () => { focusOverride = i; render(); });
        svg.append(hit);
      });
    });
  }

  function drawNeighbours(st) {
    const box = $("vzNb"); box.replaceChildren();
    const rows = neighbourRows(), shownNow = onScreen();
    $("vzNbTitle").textContent = `Room ${codeOf(rows[0].i)} and its 12 neighbours`;
    let lo = Infinity, hi = -Infinity, peak = 0;
    for (const r of rows) {
      const s1 = Math.max(sdOf(st.S1, r.i), 0.5), s0 = Math.max(sdOf(st.S0, r.i), 0.5);
      lo = Math.min(lo, st.now[r.i] - 3 * s1, st.start[r.i] - 3 * s0); hi = Math.max(hi, st.now[r.i] + 3 * s1, st.start[r.i] + 3 * s0);
      peak = Math.max(peak, 1 / s1, 1 / s0);
    }
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const mini = (r, wide) => {
      const i = r.i, code = codeOf(i), you = yours(code);
      const cell = document.createElement("div"); cell.className = "vz-mini" + (shownNow.has(i) ? " on" : "") + (wide ? " wide" : "");
      const name = document.createElement("div"); name.className = "vz-mname"; name.textContent = r.group < 0 ? `${code}: ${describeRoom(i)}` : `${r.label} · ${code}`;
      const W = wide ? 420 : 200, H = 54, Bm = 6, top = 4;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Model's guess for ${code}` });
      const x = (v) => 2 + (v - lo) * (W - 4) / (hi - lo);
      const path = (mu, s) => { let d = ""; for (let k = 0; k <= 80; k++) { const v = lo + (hi - lo) * k / 80, yv = Math.exp(-0.5 * ((v - mu) / s) ** 2) / s / peak; d += `${k ? "L" : "M"}${x(v).toFixed(1)},${(H - Bm - yv * (H - Bm - top)).toFixed(1)}`; } return d; };
      const s1 = Math.max(sdOf(st.S1, i), 0.5), s0 = Math.max(sdOf(st.S0, i), 0.5);
      svg.append(el("line", { x1: 2, x2: W - 2, y1: H - Bm, y2: H - Bm, stroke: "var(--line)", "stroke-width": 1 }));
      svg.append(el("path", { d: path(st.now[i], s1) + `L${x(hi)},${H - Bm}L${x(lo)},${H - Bm}Z`, fill: "var(--vz-belief-soft)", stroke: "none" }));
      svg.append(el("path", { d: path(st.start[i], s0), fill: "none", stroke: "var(--muted)", "stroke-width": 1.2, "stroke-dasharray": "3 3" }));
      svg.append(el("path", { d: path(st.now[i], s1), fill: "none", stroke: "var(--vz-belief)", "stroke-width": 1.8 }));
      const mv = st.now[i] - st.start[i], num = document.createElement("div"); num.className = "vz-num";
      num.textContent = `moved ${sgn(mv)} → ${f1(st.now[i])}` + (you !== null ? ` · you: ${f1(you)}` : "");
      cell.append(name, svg, num);
      hover(cell, `${code}: ${describeRoom(i)}<br>before this task ${f1(st.start[i])} ± ${f1(2 * s0)}<br>now ${f1(st.now[i])} ± ${f1(2 * s1)}` + (you !== null ? `<br>your answer ${f1(you)}` : ""));
      return cell;
    };
    const lab = (t) => { const d = document.createElement("div"); d.className = "vz-flab"; d.textContent = t; return d; };
    box.append(lab("room"), mini(rows[0], true));
    for (let f = 0; f < 4; f++) { box.append(lab(FEATURE_NAMES[FEATURES[f]])); rows.filter((r) => r.group === f).forEach((r) => box.append(mini(r))); }
  }

  // Only for preference queries (two rooms, or a feature task), once you have rated the rooms you see.
  function drawCompare(st) {
    const boxEl = $("vzCmpBox"), svg = $("vzCmp"); svg.replaceChildren();
    const q = queries[view.qi];
    const show = view.phase !== "before" && (q.kind === "pair" || q.kind === "preference" || q.kind === "feature") && st.ready;
    boxEl.hidden = !show; if (!show) return;
    const S0 = st.S0, num = update(view.qi, S0, st.start, "utility").move, ord = update(view.qi, S0, st.start, "ranking").move;
    const rows = [...q.shown, ...q.neighbours].map((c) => { const i = idxOf(c), you = yours(c); return { i, util: num[i], rank: ord[i], you: you === null ? null : you - st.start[i] }; });
    const W = 560, H = 210, L = 36, R = 8, T = 12, Bt = 40;
    const ext = Math.max(4, ...rows.map((r) => Math.max(Math.abs(r.util), Math.abs(r.rank), Math.abs(r.you ?? 0))));
    const top = Math.ceil(ext / 4) * 4;
    const y = (v) => T + (top - v) * (H - T - Bt) / (2 * top);
    for (const v of [-top, -top / 2, 0, top / 2, top]) {
      svg.append(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? "var(--ink)" : "var(--line)", "stroke-width": 1 }));
      svg.append(el("text", { x: L - 5, y: y(v) + 4, "text-anchor": "end", class: "vz-ax" }, (v > 0 ? "+" : "") + v));
    }
    const slot = (W - L - R) / rows.length, bw = Math.min(26, slot * 0.32);
    rows.forEach((r, k) => {
      const cx = L + slot * (k + 0.5), isShown = k < q.shown.length;
      for (const [val, dx, col, nm] of [[r.util, -bw / 2 - 1, "var(--vz-belief)", "number"], [r.rank, bw / 2 + 1, "var(--vz-rank)", "order"]]) {
        const rect = el("rect", { x: cx + dx - bw / 2, y: Math.min(y(0), y(val)), width: bw, height: Math.max(Math.abs(y(val) - y(0)), 0.8), fill: col, rx: 2 });
        hover(rect, `${codeOf(r.i)} under the ${nm} model: moves ${sgn(val)}` + (r.you !== null ? `<br>you moved ${sgn(r.you)}` : ""));
        svg.append(rect);
      }
      if (r.you !== null) { const ty = y(r.you); svg.append(el("path", { d: `M${cx},${ty - 6}L${cx + 6},${ty}L${cx},${ty + 6}L${cx - 6},${ty}Z`, fill: "var(--ink)", stroke: "#fff", "stroke-width": 1 })); }
      svg.append(el("text", { x: cx, y: H - Bt + 16, "text-anchor": "middle", class: "vz-ax" }, codeOf(r.i)));
      svg.append(el("text", { x: cx, y: H - Bt + 30, "text-anchor": "middle", class: "vz-lab" }, isShown ? (q.read[k] ? "seen" : "original") : `shares ${sharedN(r.i, idxOf(q.shown[0]))}`));
    });
  }

  params();
  build();
  render();
  return { goTo, live, pick };
}
