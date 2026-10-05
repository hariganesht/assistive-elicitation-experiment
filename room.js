// The 3D room used in Study 1. The geometry is the same as the Room class in app.js
// (Study 2), with three additions: a fourth decor option, a "showroom" preview for a
// single option, and dispose() so that many rooms can be shown one after another.
import * as THREE from "three";

export const FEATURES = ["furniture", "lighting", "wall", "decor"];

export const LEVELS = {
  furniture: ["connected-l", "sofa-chairs", "sofa-beanbag", "four-armchairs"],
  lighting: ["bright-overhead", "localized-lamps", "pendant-cluster", "chandelier"],
  wall: ["neutral", "warm", "dark", "brick"],
  decor: ["photo-frames", "bicycle", "wall-bookshelf", "hanging-plants"],
};

// How each option is described in words.
export const DESCRIPTIONS = {
  "connected-l": "a long L-shaped sofa",
  "sofa-chairs": "a sofa with two armchairs",
  "sofa-beanbag": "a sofa with a beanbag",
  "four-armchairs": "four armchairs around a small round table",
  "bright-overhead": "bright ceiling lights",
  "localized-lamps": "two floor lamps",
  "pendant-cluster": "a cluster of pendant lights",
  chandelier: "a chandelier",
  neutral: "off-white walls",
  warm: "warm terracotta walls",
  dark: "dark charcoal walls",
  brick: "exposed brick walls",
  "photo-frames": "framed pictures on the wall",
  bicycle: "a bicycle mounted on the wall",
  "wall-bookshelf": "bookshelves on the wall",
  "hanging-plants": "plants hanging on the wall",
};

export const FEATURE_NAMES = { furniture: "Furniture", lighting: "Lighting", wall: "Walls", decor: "Wall decor" };

const SHOWROOM_GREY = 0x8d9296; // a wall colour that is not one of the four options

export class Room {
  constructor(el, config) {
    this.el = el;
    this.s = new THREE.Scene();
    this.s.background = new THREE.Color(0xe7e3dc);
    this.cam = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    this.cam.position.set(0, 3.8, 12.8);
    this.cam.lookAt(0, 2.15, -0.5);
    this.r = new THREE.WebGLRenderer({ antialias: true });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(this.r.domElement);
    this.wall = new THREE.MeshStandardMaterial({ color: 0xeee8df, roughness: 0.9 });
    this.wood = new THREE.MeshStandardMaterial({ color: 0x704b32, roughness: 0.8 });
    this.fabric = new THREE.MeshStandardMaterial({ color: 0xb4aa9d, roughness: 1 });
    this.fabric2 = new THREE.MeshStandardMaterial({ color: 0x88796d, roughness: 1 });
    this.white = new THREE.MeshStandardMaterial({ color: 0xf2efe9 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x343637 });
    this.fixed = new THREE.Group();
    this.furn = new THREE.Group();
    this.fx = new THREE.Group();
    this.dec = new THREE.Group();
    this.lit = new THREE.Group();
    this.s.add(this.fixed, this.furn, this.fx, this.dec, this.lit);
    this.build();
    this.s.add(new THREE.HemisphereLight(0xfff4dc, 0x66717a, 0.52));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(el);
    if (config) this.set(config);
    this.resize();
  }

  box(w, h, d, m, x, y, z) { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); return q; }
  cyl(r, h, m, x, y, z) { const q = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), m); q.position.set(x, y, z); return q; }
  clear(g) { while (g.children.length) g.remove(g.children[0]); }

  build() {
    this.fixed.add(this.box(13, 0.14, 9, new THREE.MeshStandardMaterial({ color: 0x815d43 }), 0, 0, -0.4), this.box(13, 5.8, 0.14, this.wall, 0, 2.9, -4.9), this.box(0.14, 5.8, 9, this.wall, -6.5, 2.9, -0.4), this.box(0.14, 5.8, 9, this.wall, 6.5, 2.9, -0.4), this.box(13, 0.14, 9, this.white, 0, 5.8, -0.4));
    this.fixed.add(this.box(6.8, 0.03, 4.4, new THREE.MeshStandardMaterial({ color: 0xc6b79f }), 0, 0.09, -0.1), this.box(2.3, 0.18, 1.15, this.wood, 0, 0.62, 0.45));
    for (const x of [-0.92, 0.92]) for (const z of [0.05, 0.85]) this.fixed.add(this.box(0.12, 0.55, 0.12, this.wood, x, 0.32, z));
    this.fixed.add(this.box(3.35, 2.85, 0.1, this.wood, -3.85, 3.05, -4.77), this.box(2.98, 1.62, 0.025, new THREE.MeshStandardMaterial({ color: 0x8fc4dc }), -3.85, 3.48, -4.73), this.box(2.98, 0.82, 0.025, new THREE.MeshStandardMaterial({ color: 0x718d5d }), -3.85, 2.26, -4.72), this.box(0.07, 2.48, 0.05, this.white, -3.85, 3.05, -4.56), this.box(2.98, 0.07, 0.05, this.white, -3.85, 3.05, -4.56));
  }

  chair(x, z, rot = 0, m = this.fabric2) { const g = new THREE.Group(); g.add(this.box(1.12, 0.46, 1.12, m, 0, 0.56, 0), this.box(1.12, 0.86, 0.2, m, 0, 1.15, -0.46)); g.position.set(x, 0, z); g.rotation.y = rot; this.furn.add(g); }
  sofa(x, z, w, rot = 0, m = this.fabric) { const g = new THREE.Group(); g.add(this.box(w, 0.48, 1.15, m, 0, 0.58, 0), this.box(w, 0.82, 0.22, m, 0, 1.15, -0.48)); g.position.set(x, 0, z); g.rotation.y = rot; this.furn.add(g); }

  setF(t) {
    this.clear(this.furn);
    if (t === "connected-l") this.furn.add(this.box(5.85, 0.5, 1.18, this.fabric, 0.55, 0.58, -2.55), this.box(1.2, 0.5, 3.15, this.fabric, -1.78, 0.58, -1.55), this.box(5.85, 0.82, 0.22, this.fabric, 0.55, 1.15, -3.03), this.box(0.22, 0.82, 2.95, this.fabric, -2.32, 1.15, -1.57));
    if (t === "sofa-chairs") { this.sofa(0, -2.55, 3.55); this.chair(-3, -0.35, Math.PI / 3); this.chair(3, -0.35, -Math.PI / 3); }
    if (t === "sofa-beanbag") { this.sofa(-0.65, -2.55, 3.25); const m = new THREE.MeshStandardMaterial({ color: 0x9b715b, roughness: 1 }), b = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22), m); b.scale.set(1.18, 0.52, 1.05); b.position.set(2.65, 0.48, -0.3); this.furn.add(b); }
    if (t === "four-armchairs") { this.chair(-2.1, -1.85, Math.PI / 4); this.chair(2.1, -1.85, -Math.PI / 4); this.chair(-2.1, 1.05, Math.PI * 0.72); this.chair(2.1, 1.05, -Math.PI * 0.72); this.furn.add(this.cyl(0.68, 0.1, this.wood, 0, 0.58, -0.25), this.cyl(0.1, 0.54, this.wood, 0, 0.3, -0.25)); }
  }

  setW(t) {
    this.clear(this.fx);
    this.wall.color.setHex({ neutral: 0xeee8df, warm: 0xb96f4f, dark: 0x30363a, brick: 0x6f4035, showroom: SHOWROOM_GREY }[t]);
    if (t === "brick") { const ms = [0x5d3029, 0x71392e, 0x472722].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })); for (let r = 0; r < 18; r++) { const y = 0.25 + r * 0.31, o = (r % 2) * 0.38; for (let x = -6.1 - o; x < 6.2; x += 0.77) this.fx.add(this.box(0.7, 0.26, 0.04, ms[(r + Math.floor(x + 10)) % 3], x, y, -4.78)); } }
  }

  setD(t) {
    this.clear(this.dec);
    if (t === "photo-frames") for (const [x, y, w, h, c] of [[-0.9, 3.5, 1.15, 1.25, 0xb54e3c], [0.65, 3.2, 1.35, 0.9, 0x3f6f80], [2.25, 3.55, 0.9, 1.15, 0xd09b43]]) { const frame = this.box(w + 0.12, h + 0.12, 0.05, this.dark, x, y, -4.65), art = this.box(w, h, 0.06, new THREE.MeshStandardMaterial({ color: c }), x, y, -4.61); this.dec.add(frame, art); }
    if (t === "bicycle") { const mat = this.dark; for (const x of [-0.72, 0.72]) { const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 10, 32), mat); wheel.position.set(x, 2.55, -4.61); this.dec.add(wheel); } const bar = (len, x, y, rot) => { const q = this.box(len, 0.07, 0.07, mat, x, y, -4.6); q.rotation.z = rot; this.dec.add(q); }; bar(1.55, 0, 2.62, 0); bar(1.1, -0.2, 2.82, 0.75); bar(1.05, 0.25, 2.85, -0.7); bar(0.8, 0.35, 3.15, 0.25); }
    if (t === "wall-bookshelf") for (let r = 0; r < 3; r++) { this.dec.add(this.box(3.4, 0.12, 0.42, this.wood, 1.2, 2.05 + r * 0.75, -4.48)); for (let i = 0; i < 7; i++) { const colors = [0x8d5947, 0x526b75, 0xb38a55, 0x6d7658]; const h = 0.38 + (i % 3) * 0.08; this.dec.add(this.box(0.18, h, 0.24, new THREE.MeshStandardMaterial({ color: colors[(i + r) % colors.length] }), -0.05 + i * 0.4, 2.3 + r * 0.75, -4.23)); } }
    if (t === "hanging-plants") {
      const pot = new THREE.MeshStandardMaterial({ color: 0xc9b9a0, roughness: 0.9 });
      const leaves = [0x4f7a4a, 0x3f6a3f, 0x6a8f55].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
      [[-0.8, 3.6], [0.75, 3.05], [2.3, 3.7]].forEach(([x, y], i) => {
        this.dec.add(this.box(0.9, 0.07, 0.34, this.wood, x, y - 0.3, -4.62));            // small shelf
        this.dec.add(this.cyl(0.26, 0.42, pot, x, y - 0.06, -4.6));                       // pot
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), leaves[i]);    // foliage
        bush.scale.set(1.15, 0.9, 0.7); bush.position.set(x, y + 0.42, -4.56); this.dec.add(bush);
        for (const [dx, len] of [[-0.3, 0.75], [0.05, 1.0], [0.32, 0.6]]) {               // trailing stems
          const stem = this.box(0.09, len, 0.06, leaves[(i + 1) % 3], x + dx, y - 0.3 - len / 2, -4.42);
          this.dec.add(stem);
        }
      });
    }
  }

  setL(t) {
    this.clear(this.lit);
    const add = (x, y, z, p, col = 0xffd39c) => { const l = new THREE.PointLight(col, p, 10, 1.4); l.position.set(x, y, z); this.lit.add(l); };
    if (t === "bright-overhead") for (const [x, z] of [[-3, -1.7], [0, -1.7], [3, -1.7], [-3, 1.4], [0, 1.4], [3, 1.4]]) { const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.07, 36), this.white); disc.rotation.x = Math.PI / 2; disc.position.set(x, 5.69, z); this.lit.add(disc); add(x, 5.15, z, 18, 0xffe8c9); }
    if (t === "localized-lamps") for (const [x, z] of [[-4.2, -0.6], [4.2, -0.6]]) { this.lit.add(this.cyl(0.08, 2.1, this.dark, x, 1.1, z), this.cyl(0.55, 0.62, this.white, x, 2.25, z)); add(x, 2.15, z, 38); }
    if (t === "pendant-cluster") for (const [x, y, z] of [[-1.15, 4.25, -0.45], [0, 3.92, -0.15], [1.15, 4.35, -0.45]]) { this.lit.add(this.cyl(0.035, 1.25, this.dark, x, y + 0.65, z)); const sh = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.48, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x5e625f, side: THREE.DoubleSide })); sh.position.set(x, y, z); this.lit.add(sh); add(x, y - 0.18, z, 24); }
    if (t === "chandelier") { const stem = this.cyl(0.05, 1.15, this.dark, 0, 4.8, -0.3); this.lit.add(stem); const hub = this.cyl(0.14, 0.16, this.dark, 0, 4.18, -0.3); this.lit.add(hub); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3, x = Math.cos(a) * 1.15, z = -0.3 + Math.sin(a) * 1.15; const arm = this.box(1.18, 0.06, 0.06, this.dark, Math.cos(a) * 0.58, 4.12, -0.3 + Math.sin(a) * 0.58); arm.rotation.y = -a; this.lit.add(arm); const candle = this.cyl(0.075, 0.34, this.white, x, 3.98, z); this.lit.add(candle); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffe0a6, emissive: 0xffc56e, emissiveIntensity: 0.8 })); bulb.position.set(x, 3.75, z); this.lit.add(bulb); add(x, 3.7, z, 12); } }
  }

  // A complete room: one option for each of the four features.
  set(c) { this.setF(c.furniture); this.setW(c.wall); this.setD(c.decor); this.setL(c.lighting); this.render(); }

  // One option on its own, in a plain grey showroom, so that no other option is on display.
  showOption(feature, value) {
    this.clear(this.furn); this.clear(this.dec); this.clear(this.lit);
    this.setW(feature === "wall" ? value : "showroom");
    if (feature === "furniture") this.setF(value);
    if (feature === "decor") this.setD(value);
    if (feature === "lighting") this.setL(value);
    if (!this.fill) {                               // even, neutral light for the showroom
      this.fill = new THREE.Group();
      const front = new THREE.DirectionalLight(0xffffff, 1.6); front.position.set(2, 6, 12);
      this.fill.add(new THREE.AmbientLight(0xffffff, 1.7), front);
      this.s.add(this.fill);
    }
    this.fill.visible = feature !== "lighting";   // lighting options are shown by their own light
    this.render();
  }

  resize() { const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return; this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.r.setSize(w, h, false); this.render(); }
  render() { this.r.render(this.s, this.cam); }
  dispose() { this.observer.disconnect(); this.r.dispose(); this.r.forceContextLoss(); this.r.domElement.remove(); }
}
