// study1_viz.js: the right half of study1.html?viz=1.
// A simulated person goes through the same screens as you. Their true likings are drawn from a
// Gaussian process over the 256 rooms; their belief updates with the Study 1 formulas (the same as
// study1_all.jl: gain x surprise for numbers, the probit update for orders, noise growing with the
// number of rooms shown, sliders = belief mean +- 2 sd with some slider noise).
import { FEATURES, FEATURE_NAMES } from "./room.js";

const SHORT = {
  "connected-l": "L-shaped sofa", "sofa-chairs": "sofa + 2 chairs", "sofa-beanbag": "sofa + beanbag", "four-armchairs": "4 armchairs",
  "bright-overhead": "ceiling lights", "localized-lamps": "floor lamps", "pendant-cluster": "pendants", chandelier: "chandelier",
  neutral: "off-white", warm: "terracotta", dark: "charcoal", brick: "brick",
  "photo-frames": "pictures", bicycle: "bicycle", "wall-bookshelf": "bookshelves", "hanging-plants": "plants",
};
const PRESETS = {
  M1: { label: "M1 no spread", kind: "pieces", c: 0, w: [0, 0, 0, 0], d: 100 },
  M2: { label: "M2 flat", kind: "pieces", c: 100, w: [0, 0, 0, 0], d: 0 },
  M3: { label: "M3 linear additive", kind: "pieces", c: 20, w: [20, 20, 20, 20], d: 0 },
  M4: { label: "M4 additive (default)", kind: "pieces", c: 20, w: [12.5, 12.5, 12.5, 12.5], d: 30 },
  M5: { label: "M5 per-feature", kind: "pieces", c: 20, w: [25, 10, 10, 5], d: 20 },
  M6: { label: "M6b distance, one rho", kind: "distance", s2: 100, rho: [0.6, 0.6, 0.6, 0.6] },
  M7: { label: "M7 ranking (order only)", kind: "pieces", c: 20, w: [12.5, 12.5, 12.5, 12.5], d: 30, obs: "ranking" },
  M8: { label: "M8 constant noise", kind: "pieces", c: 20, w: [12.5, 12.5, 12.5, 12.5], d: 30, gamma: 0 },
};

// ---------------------------------------------------------------- rooms
const ROOMS = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) ROOMS.push([a, b, c, d]);
const N = ROOMS.length;
const idxOf = (code) => 64 * (code[0] - 1) + 16 * (code[1] - 1) + 4 * (code[2] - 1) + (code[3] - 1);
const codeOf = (i) => ROOMS[i].map((v) => v + 1).join("");
const variants = (r, f) => [0, 1, 2, 3].filter((v) => v !== r[f]).map((v) => r.map((x, g) => (g === f ? v : x)));
const sharedN = (i, j) => ROOMS[i].filter((v, f) => v === ROOMS[j][f]).length;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rand) { let u = 0; while (u === 0) u = rand(); const v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// ---------------------------------------------------------------- the update formulas (beliefs are {m, S})
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
// Numbers: every guess moves by gain x surprise; gain = k(room, seen) / (k(seen, seen) + noise).
function seeUtility(B, Q, o, nv) {
  const { m, S } = B, k = Q.length; if (!k) return;
  const A = Q.map((i) => Q.map((j) => S[i * N + j] + (i === j ? nv : 0)));
  const Ai = invSmall(A, k);
  const G = new Float64Array(N * k);
  for (let r = 0; r < N; r++) for (let c = 0; c < k; c++) { let s = 0; for (let t = 0; t < k; t++) s += S[r * N + Q[t]] * Ai[t][c]; G[r * k + c] = s; }
  const surprise = Q.map((q, t) => o[t] - m[q]);
  const SQ = Q.map((q) => S.slice(q * N, q * N + N));
  for (let r = 0; r < N; r++) {
    let dm = 0; for (let c = 0; c < k; c++) dm += G[r * k + c] * surprise[c];
    m[r] += dm;
    for (let j = 0; j < N; j++) { let s = 0; for (let c = 0; c < k; c++) s += G[r * k + c] * SQ[c][j]; S[r * N + j] -= s; }
  }
}
// Order: "i is liked more than j", the probit update (moment matched). Each room has noise nv.
function seePair(B, i, j, nv) {
  const { m, S } = B;
  const u = new Float64Array(N); for (let r = 0; r < N; r++) u[r] = S[r * N + i] - S[r * N + j];
  const s2 = u[i] - u[j] + 2 * nv, s = Math.sqrt(s2), z = (m[i] - m[j]) / s;
  const ph = Math.max(Phi(z), 1e-12), r = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) / ph;
  for (let a = 0; a < N; a++) m[a] += u[a] * r / s;
  const f = r * (r + z) / s2;
  for (let a = 0; a < N; a++) { const ua = u[a] * f; if (ua === 0) continue; for (let b = 0; b < N; b++) S[a * N + b] -= ua * u[b]; }
}
const copy = (B) => ({ m: Float64Array.from(B.m), S: Float64Array.from(B.S) });

// ---------------------------------------------------------------- the viz
export function createViz(panel, { queries, seed, mapping, onAutofill }) {
  const P = { preset: "M4", ...structuredClone(PRESETS.M4), obs: "utility", sigma: 5.8, gamma: 0.5, rep: 4, wn: 0.3, seed: seed || 7 };
  const optName = (f, v) => SHORT[mapping[FEATURES[f]][v]];
  const describeRoom = (i) => ROOMS[i].map((v, f) => optName(f, v)).join(", ");

  let K, U, m0, B, cursor, results, view = { qi: 0, phase: "before", nb: null }, focusOverride = null, preview = null;

  const kfun = (x, y) => {
    if (P.kind === "distance") { let v = P.s2; for (let f = 0; f < 4; f++) if (x[f] !== y[f]) v *= P.rho[f]; return v; }
    let v = P.c; for (let f = 0; f < 4; f++) if (x[f] === y[f]) v += P.w[f];
    if (x === y) v += P.d;
    return v;
  };
  const noiseVar = (k) => P.sigma * P.sigma * (1 + P.gamma * (k - 1));

  function build() {
    K = new Float64Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) K[i * N + j] = kfun(ROOMS[i], ROOMS[j]);
    const L = new Float64Array(N * N), jitter = 1e-6 * (K[0] || 1);
    for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) {
      let s = K[i * N + j] + (i === j ? jitter : 0);
      for (let k = 0; k < j; k++) s -= L[i * N + k] * L[j * N + k];
      L[i * N + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * N + j];
    }
    const rand = mulberry32(P.seed * 2654435761);
    m0 = Float64Array.from({ length: N }, () => 50 + 5 * gauss(rand));    // what they expect from the text
    const z = Array.from({ length: N }, () => gauss(rand));
    U = new Float64Array(N);                                                // their true likings
    for (let i = 0; i < N; i++) { let s = m0[i]; for (let k = 0; k <= i; k++) s += L[i * N + k] * z[k]; U[i] = s; }
    B = { m: Float64Array.from(m0), S: Float64Array.from(K) };
    cursor = 0; results = [];
  }

  // Noise draws for query qi: the same whatever the model, so switching models keeps the same luck.
  function draws(qi) {
    const r = mulberry32(P.seed * 7919 + qi * 104729 + 13), g = () => gauss(r);
    return { eps: [g(), g(), g(), g()], bMid: [g(), g(), g(), g()], bW: [g(), g(), g(), g()], aMid: Array.from({ length: 8 }, g), aW: Array.from({ length: 8 }, g) };
  }
  const sd = (Bx, i) => Math.sqrt(Math.max(Bx.S[i * N + i], 0));
  function slider(Bx, i, zMid, zW) {
    const mid = Bx.m[i] + P.rep * zMid, w = Math.max(4 * sd(Bx, i) * Math.exp(P.wn * zW), 1);
    return [mid - w / 2, mid + w / 2];
  }
  const roomsOf = (q) => ({ Q: q.shown.map(idxOf), R: [...q.shown, ...q.neighbours].map(idxOf) });

  function beforeAnswers(qi) {
    const q = queries[qi], d = draws(qi), { Q } = roomsOf(q), out = {};
    Q.forEach((i, t) => { out[codeOf(i)] = slider(B, i, d.bMid[t], d.bW[t]); });
    return out;
  }
  function observe(Bx, q, Q, readings, nv, obs) {
    const ranked = Q.map((i, t) => [i, readings[t]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    if (obs === "utility") {
      const keep = Q.map((_, t) => q.read[t]);
      seeUtility(Bx, Q.filter((_, t) => keep[t]), readings.filter((_, t) => keep[t]), nv);
    } else if (q.kind === "feature") {
      for (const j of Q) if (j !== ranked[0]) seePair(Bx, ranked[0], j, nv);
    } else {
      for (let t = 0; t + 1 < ranked.length; t++) seePair(Bx, ranked[t], ranked[t + 1], nv);
    }
    return ranked;
  }
  function apply(qi, keepPre) {
    const q = queries[qi], d = draws(qi), { Q, R } = roomsOf(q), nv = noiseVar(Q.length);
    const before = beforeAnswers(qi);
    const pre = copy(B);
    const readings = Q.map((i, t) => U[i] + Math.sqrt(nv) * d.eps[t]);
    const ranked = observe(B, q, Q, readings, nv, P.obs);
    const after = {};
    R.forEach((i, t) => { after[codeOf(i)] = slider(B, i, d.aMid[t], d.aW[t]); });
    results[qi] = { before, after, readings, nv, picked: codeOf(ranked[0]), ranked, preM: pre.m, preV: Float64Array.from({ length: N }, (_, i) => pre.S[i * N + i]), pre: keepPre ? pre : null };
  }
  // Moves under both observation models, from the same belief and the same readings.
  function compare(qi) {
    const r = results[qi]; if (!r) return null;
    let pre = r.pre;
    if (!pre) return null;
    const q = queries[qi], { Q, R } = roomsOf(q);
    const Bu = copy(pre), Br = copy(pre);
    observe(Bu, q, Q, r.readings, r.nv, "utility");
    observe(Br, q, Q, r.readings, r.nv, "ranking");
    return R.map((i) => ({ i, util: Bu.m[i] - pre.m[i], rank: Br.m[i] - pre.m[i] }));
  }

  // ------------------------------------------------------------ moving through the task
  function sync() {
    const { qi, phase } = view, target = phase === "before" ? qi : qi + 1;
    if (cursor > target) build();
    while (cursor < target) { apply(cursor, cursor === qi); cursor++; }
    preview = phase === "before" ? beforeAnswers(qi) : null;
  }
  function goTo(qi, phase, nb = null) { view = { qi, phase, nb }; focusOverride = null; sync(); render(); }
  function answer(code, which) {
    if (which === "before") return preview ? preview[code] : results[view.qi]?.before[code];
    return results[view.qi]?.after[code];
  }
  function rebuild() { build(); sync(); render(); }

  // ------------------------------------------------------------ the panel
  panel.hidden = false;
  panel.innerHTML = `
    <div class="vz-head">
      <div class="vz-eyebrow">Simulated person</div>
      <p class="vz-sub">They see the same screens as you. Their true likings are drawn from the learning model below, and their belief updates with the Study 1 formulas. The faint band on each slider on the left is their answer.</p>
      <div class="vz-controls">
        <label class="vz-field">Learning model <select id="vzPreset"></select></label>
        <button class="vz-btn" id="vzNew" type="button">New person</button>
      </div>
      <label class="vz-check"><input type="checkbox" id="vzAuto"> Answer as the simulated person (fills the sliders for you)</label>
      <details class="vz-details"><summary>Kernel and noise settings</summary><div id="vzParams" class="vz-params"></div></details>
    </div>
    <div class="vz-status" id="vzStatus" aria-live="polite"></div>
    <section class="vz-chart"><h3 id="vzNbTitle">Room and its 12 neighbours</h3>
      <p class="vz-note">Each row changes one feature of the room. Dashed: belief before this task. Solid: belief now. Black diamond: true liking. Outlined: on screen now.</p>
      <div id="vzNb" class="vz-nbgrid"></div></section>
    <section class="vz-chart" id="vzCmpBox"><h3>Number or order: how far this task moved each room</h3>
      <p class="vz-note">Same belief and same impressions, two observation models. Blue: they take in a number for each room (utility). Orange: they take in only which room is better (ranking).</p>
      <svg id="vzCmp" viewBox="0 0 560 210" role="img" aria-label="Moves under the utility and ranking models"></svg></section>
    <section class="vz-chart"><h3>All 256 rooms</h3>
      <p class="vz-note">Sorted by true liking. Line and band: belief (mean ± 2 sd). Dots: true liking; rooms seen so far are outlined. Click a dot to focus on that room.</p>
      <svg id="vzAll" viewBox="0 0 560 200" role="img" aria-label="Belief and true liking for all rooms"></svg></section>
    <section class="vz-chart"><h3>How these rooms go together</h3>
      <p class="vz-note">Correlation in the belief between the room and its 12 neighbours. Learning about one room moves the others in proportion.</p>
      <svg id="vzCov" viewBox="0 0 360 370" role="img" aria-label="Correlation matrix"></svg></section>
    <div class="vz-tip" id="vzTip" hidden></div>`;
  const $ = (id) => panel.querySelector("#" + id);
  const sel = $("vzPreset");
  for (const [k, p] of Object.entries(PRESETS)) { const o = document.createElement("option"); o.value = k; o.textContent = p.label; sel.append(o); }
  sel.value = "M4";
  sel.addEventListener("change", () => {
    const p = PRESETS[sel.value];
    Object.assign(P, structuredClone(p), { preset: sel.value, obs: p.obs || "utility", gamma: p.gamma ?? 0.5 });
    params(); rebuild();
  });
  $("vzNew").addEventListener("click", () => { P.seed = Math.floor(Math.random() * 1e6); rebuild(); });
  $("vzAuto").addEventListener("change", (e) => onAutofill?.(e.target.checked));

  function params() {
    const box = $("vzParams"); box.replaceChildren();
    const add = (label, get, set, min, max, step) => {
      const row = document.createElement("label"); row.className = "vz-slider";
      const sp = document.createElement("span"); sp.textContent = label;
      const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
      const out = document.createElement("output"); out.textContent = Number(get()).toFixed(step < 1 ? 2 : 0);
      inp.addEventListener("input", () => { set(Number(inp.value)); out.textContent = Number(inp.value).toFixed(step < 1 ? 2 : 0); });
      inp.addEventListener("change", rebuild);
      row.append(sp, inp, out); box.append(row);
    };
    if (P.kind === "pieces") {
      add("c, all rooms", () => P.c, (v) => (P.c = v), 0, 100, 1);
      FEATURES.forEach((f, k) => add(`w, ${FEATURE_NAMES[f].toLowerCase()}`, () => P.w[k], (v) => (P.w[k] = v), 0, 40, 0.5));
      add("d, the room alone", () => P.d, (v) => (P.d = v), 0, 100, 1);
    } else {
      add("s², variance", () => P.s2, (v) => (P.s2 = v), 20, 200, 1);
      FEATURES.forEach((f, k) => add(`ρ, ${FEATURE_NAMES[f].toLowerCase()}`, () => P.rho[k], (v) => (P.rho[k] = v), 0.05, 0.95, 0.05));
    }
    add("σ, noise", () => P.sigma, (v) => (P.sigma = v), 1, 20, 0.1);
    add("γ, extra per room", () => P.gamma, (v) => (P.gamma = v), 0, 2, 0.05);
    const obs = document.createElement("label"); obs.className = "vz-slider";
    obs.innerHTML = `<span>They take in</span><select><option value="utility">a number (utility)</option><option value="ranking">only the order (ranking)</option></select><output></output>`;
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
  const f1 = (x) => x.toFixed(1), f0 = (x) => x.toFixed(0);
  const onScreen = () => {
    const q = queries[view.qi];
    if (view.phase === "neighbours" && view.nb) return new Set([idxOf(view.nb)]);
    return new Set(q.shown.map(idxOf));
  };
  const seenSoFar = () => { const s = new Set(); for (let t = 0; t < cursor; t++) queries[t].shown.forEach((c) => s.add(idxOf(c))); return s; };
  const focus = () => focusOverride ?? idxOf(queries[view.qi].shown[0]);
  // "before" lines: belief before this task (equal to now on the description screen).
  const prevOf = () => (view.phase === "before" ? { m: B.m, v: Float64Array.from({ length: N }, (_, i) => B.S[i * N + i]) } : { m: results[view.qi].preM, v: results[view.qi].preV });

  function status() {
    const q = queries[view.qi], r = results[view.qi], names = { single: "one room", pair: "two rooms", feature: `four rooms, varying the ${FEATURE_NAMES[q.feature]?.toLowerCase()}` };
    const head = `<b>Task ${view.qi + 1} of ${queries.length}</b> · ${names[q.kind]}`;
    const rng = (x) => `${f0(x[0])} to ${f0(x[1])}`;
    let body = "";
    if (view.phase === "before") {
      body = "They read the description. Nothing has been learned yet; their answer is their current belief, mean ± 2 sd, plus slider noise.<br>" +
        q.shown.map((c) => { const i = idxOf(c); return `${c}: belief ${f1(B.m[i])} ± ${f1(2 * sd(B, i))}, says ${rng(preview[c])}, true liking ${f1(U[i])}`; }).join("<br>");
    } else if (view.phase === "see") {
      const lines = q.shown.map((c, t) => { const i = idxOf(c); return `${c}: felt like ${f1(r.readings[t])}${q.read[t] ? "" : " (already known, not a new reading)"} · belief ${f1(r.preM[i])} → ${f1(B.m[i])} · true ${f1(U[i])}`; });
      const how = P.obs === "utility" ? "They take in a number for each room." : `They take in only the order: ${r.ranked.map(codeOf).join(" > ")}.`;
      body = `They see the room${q.shown.length > 1 ? "s" : ""}. Noise variance per room with ${q.shown.length} on screen: ${f1(r.nv)}. ${how}<br>` + lines.join("<br>") +
        (q.kind === "feature" ? `<br>They pick ${r.picked}.` : "");
    } else {
      const i = idxOf(view.nb);
      body = `They rate a similar room from its description (shares ${sharedN(i, idxOf(q.shown[0]))} of 4 options with ${q.shown[0]}). They never saw it, so any change is generalisation.<br>` +
        `${view.nb}: belief ${f1(r.preM[i])} → ${f1(B.m[i])} · says ${rng(r.after[view.nb])} · true ${f1(U[i])}`;
    }
    $("vzStatus").innerHTML = `${head}<br>${body}`;
  }

  function neighbourRows() {
    const fc = ROOMS[focus()], rows = [{ i: focus(), group: -1 }];
    for (let f = 0; f < 4; f++) for (const v of variants(fc, f)) rows.push({ i: 64 * v[0] + 16 * v[1] + 4 * v[2] + v[3], group: f, label: optName(f, v[f]) });
    return rows;
  }
  function drawNeighbours() {
    const box = $("vzNb"); box.replaceChildren();
    const rows = neighbourRows(), prev = prevOf(), shownNow = onScreen();
    $("vzNbTitle").textContent = `Room ${codeOf(rows[0].i)} and its 12 neighbours`;
    let lo = Infinity, hi = -Infinity, peak = 0;
    for (const r of rows) {
      const sN = Math.max(sd(B, r.i), 0.5), sB = Math.sqrt(Math.max(prev.v[r.i], 0.25));
      lo = Math.min(lo, B.m[r.i] - 3 * sN, prev.m[r.i] - 3 * sB, U[r.i]); hi = Math.max(hi, B.m[r.i] + 3 * sN, prev.m[r.i] + 3 * sB, U[r.i]);
      peak = Math.max(peak, 1 / sN, 1 / sB);
    }
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const mini = (r, wide) => {
      const i = r.i, cell = document.createElement("div"); cell.className = "vz-mini" + (shownNow.has(i) ? " on" : "") + (wide ? " wide" : "");
      const name = document.createElement("div"); name.className = "vz-mname"; name.textContent = r.group < 0 ? `${codeOf(i)}: ${describeRoom(i)}` : `${r.label} · ${codeOf(i)}`;
      const W = wide ? 420 : 200, H = 54, Bm = 6, top = 4;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Belief about ${codeOf(i)}` });
      const x = (v) => 2 + (v - lo) * (W - 4) / (hi - lo);
      const path = (mu, s) => { let d = ""; for (let k = 0; k <= 80; k++) { const v = lo + (hi - lo) * k / 80, yv = Math.exp(-0.5 * ((v - mu) / s) ** 2) / s / peak; d += `${k ? "L" : "M"}${x(v).toFixed(1)},${(H - Bm - yv * (H - Bm - top)).toFixed(1)}`; } return d; };
      const sN = Math.max(sd(B, i), 0.5), sB = Math.sqrt(Math.max(prev.v[i], 0.25));
      svg.append(el("line", { x1: 2, x2: W - 2, y1: H - Bm, y2: H - Bm, stroke: "var(--line)", "stroke-width": 1 }));
      svg.append(el("path", { d: path(B.m[i], sN) + `L${x(hi)},${H - Bm}L${x(lo)},${H - Bm}Z`, fill: "var(--vz-belief-soft)", stroke: "none" }));
      svg.append(el("path", { d: path(prev.m[i], sB), fill: "none", stroke: "var(--muted)", "stroke-width": 1.2, "stroke-dasharray": "3 3" }));
      svg.append(el("path", { d: path(B.m[i], sN), fill: "none", stroke: "var(--vz-belief)", "stroke-width": 1.8 }));
      const tx = x(U[i]), ty = H - Bm;
      svg.append(el("path", { d: `M${tx},${ty - 4}L${tx + 4},${ty}L${tx},${ty + 4}L${tx - 4},${ty}Z`, fill: "var(--ink)" }));
      const mv = B.m[i] - prev.m[i], num = document.createElement("div"); num.className = "vz-num";
      num.textContent = `moved ${mv >= 0 ? "+" : ""}${f1(mv)} → ${f1(B.m[i])}`;
      cell.append(name, svg, num);
      hover(cell, `${codeOf(i)}: ${describeRoom(i)}<br>belief ${f1(B.m[i])} ± ${f1(2 * sd(B, i))} (was ${f1(prev.m[i])})<br>true ${f1(U[i])}`);
      return cell;
    };
    const lab = (t) => { const d = document.createElement("div"); d.className = "vz-flab"; d.textContent = t; return d; };
    box.append(lab("room"), mini(rows[0], true));
    for (let f = 0; f < 4; f++) { box.append(lab(FEATURE_NAMES[FEATURES[f]])); rows.filter((r) => r.group === f).forEach((r) => box.append(mini(r))); }
    const axis = document.createElement("div"); axis.className = "vz-num vz-axisnote"; axis.textContent = `Every graph uses the same axis, ${lo} to ${hi}.`; box.append(axis);
  }

  function drawCompare() {
    const boxEl = $("vzCmpBox"), svg = $("vzCmp"); svg.replaceChildren();
    if (view.phase === "before") { boxEl.hidden = true; return; }
    boxEl.hidden = false;
    const rows = compare(view.qi); if (!rows) { boxEl.hidden = true; return; }
    const q = queries[view.qi];
    const W = 560, H = 210, L = 36, R = 8, T = 12, Bt = 40;
    const ext = Math.max(4, ...rows.map((r) => Math.max(Math.abs(r.util), Math.abs(r.rank))));
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
        hover(rect, `${codeOf(r.i)} under the ${nm} model: moved ${val >= 0 ? "+" : ""}${f1(val)}`);
        svg.append(rect);
      }
      svg.append(el("text", { x: cx, y: H - Bt + 16, "text-anchor": "middle", class: "vz-ax" }, codeOf(r.i)));
      svg.append(el("text", { x: cx, y: H - Bt + 30, "text-anchor": "middle", class: "vz-lab" }, isShown ? "seen" : `shares ${sharedN(r.i, idxOf(q.shown[0]))}`));
    });
    if (q.kind === "single") svg.append(el("text", { x: W - R, y: T + 10, "text-anchor": "end", class: "vz-lab" }, "One room alone: the order model learns nothing."));
  }

  function drawAll() {
    const svg = $("vzAll"); svg.replaceChildren();
    const W = 560, H = 200, L = 32, R = 6, T = 8, Bt = 22, seen = seenSoFar();
    const order = [...Array(N).keys()].sort((a, b) => U[a] - U[b]);
    let lo = Infinity, hi = -Infinity;
    for (const i of order) { lo = Math.min(lo, U[i], B.m[i] - 2 * sd(B, i)); hi = Math.max(hi, U[i], B.m[i] + 2 * sd(B, i)); }
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const step = hi - lo > 80 ? 20 : 10;
    const x = (k) => L + (k + 0.5) * (W - L - R) / N, y = (v) => T + (hi - v) * (H - T - Bt) / (hi - lo);
    for (let v = lo; v <= hi; v += step) { svg.append(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--line)", "stroke-width": 1 })); svg.append(el("text", { x: L - 5, y: y(v) + 4, "text-anchor": "end", class: "vz-ax" }, v)); }
    let up = "", dn = "";
    order.forEach((i, k) => { up += `${x(k)},${y(B.m[i] + 2 * sd(B, i))} `; dn = `${x(k)},${y(B.m[i] - 2 * sd(B, i))} ` + dn; });
    svg.append(el("polygon", { points: up + dn, fill: "var(--vz-belief-soft)" }));
    svg.append(el("polyline", { points: order.map((i, k) => `${x(k)},${y(B.m[i])}`).join(" "), fill: "none", stroke: "var(--vz-belief)", "stroke-width": 1.6 }));
    order.forEach((i, k) => {
      const s = seen.has(i);
      svg.append(el("circle", { cx: x(k), cy: y(U[i]), r: s ? 3.2 : 1.7, fill: "var(--vz-truth)", stroke: s ? "var(--ink)" : "none", "stroke-width": 1 }));
      const hit = el("rect", { x: x(k) - 1.1, y: T, width: 2.2, height: H - T - Bt, fill: "transparent" });
      hover(hit, `${codeOf(i)}: ${describeRoom(i)}<br>true ${f1(U[i])} · belief ${f1(B.m[i])} ± ${f1(2 * sd(B, i))}`);
      hit.addEventListener("click", () => { focusOverride = i; drawNeighbours(); drawCov(); });
      svg.append(hit);
    });
    svg.append(el("text", { x: L, y: H - 5, class: "vz-ax" }, "least liked"));
    svg.append(el("text", { x: W - R, y: H - 5, class: "vz-ax", "text-anchor": "end" }, "most liked"));
  }

  function drawCov() {
    const svg = $("vzCov"); svg.replaceChildren();
    const rows = neighbourRows(), n = rows.length, L = 46, T = 46, cell = (360 - L - 6) / n;
    rows.forEach((r, k) => {
      const lbl = codeOf(r.i), cx = L + k * cell + cell / 2 + 4;
      svg.append(el("text", { x: L - 4, y: T + k * cell + cell / 2 + 4, "text-anchor": "end", class: "vz-ax" }, lbl));
      svg.append(el("text", { x: cx, y: T - 4, class: "vz-ax", transform: `rotate(-60 ${cx} ${T - 4})` }, lbl));
    });
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const i = rows[a].i, j = rows[b].i;
      const c = B.S[i * N + j] / Math.sqrt(Math.max(B.S[i * N + i] * B.S[j * N + j], 1e-12));
      const mix = Math.round(Math.min(Math.abs(c), 1) * 100);
      const col = `color-mix(in srgb, ${c >= 0 ? "var(--vz-belief)" : "var(--vz-rank)"} ${mix}%, var(--vz-cell))`;
      const rect = el("rect", { x: L + b * cell + 1, y: T + a * cell + 1, width: cell - 2, height: cell - 2, rx: 2, fill: col });
      hover(rect, `${codeOf(i)} with ${codeOf(j)}<br>correlation ${c.toFixed(2)}`);
      svg.append(rect);
    }
  }

  function render() { status(); drawNeighbours(); drawCompare(); drawAll(); drawCov(); }

  params();
  build();
  return { goTo, answer, picked: () => results[view.qi]?.picked };
}
