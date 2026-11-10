// Live hero, staged like oryzo.ai: the camera looks straight down at the station lying on the blue cutting mat, the
// mat's bottom-left corner and the desk around it soft with depth of field. The canvas sits in a fixed layer behind
// the hero AND the next scene: scrolling, the camera moves in, the desk, mat and loose things dissolve into the page,
// the station stays alone in the middle and turns to three quarters between the two texts of the "say" scene.
// three.js 0.160, units mm, Y up, screen-up = -Z. Models are baked by tools/bake.js.
//   QB.heroP / QB.sayP   scroll progress of the two scenes (main.js)      QB.progress / QB.ready / QB.fail   loader hooks
//   ?p=0.4 pins the hero progress, ?sp=0.3 the say progress (screenshots)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const QB = (window.QB = window.QB || {});
const Q = new URLSearchParams(location.search), num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const doc = document.documentElement, hint = document.querySelector('.hero-hint');
const rad = THREE.MathUtils.degToRad, clamp = THREE.MathUtils.clamp;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------- stage: fixed layer behind the page
const stage = document.createElement('div'); stage.className = 'stage3d'; stage.setAttribute('aria-hidden', 'true');
const canvas = document.createElement('canvas'); canvas.className = 'stage-gl';
const dof = document.createElement('canvas'); dof.className = 'stage-dof';       // blurred copy, masked to the edges = depth of field
const dctx = dof.getContext('2d');
const glow = document.createElement('i'); glow.className = 'stage-glow';        // the page's blue light behind the lone station
stage.append(glow, canvas, dof);
document.body.insertBefore(stage, document.querySelector('main'));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
let DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
const ENV = 0.5;
const sun = new THREE.DirectionalLight(0xfff1e0, 2.05);                          // a window on the upper left
sun.position.set(-520, 560, -260); sun.target.position.set(30, 0, 20);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 100, far: 1800 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.25;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xcfc6bc, 0.28));

// ---------------------------------------------------------------- loading
const manager = new THREE.LoadingManager();
manager.onProgress = (u, n, total) => QB.progress && QB.progress(n / Math.max(total, 13));
const gltf = new GLTFLoader(manager), texLoader = new THREE.TextureLoader(manager), cache = {};
const BLACK = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.016, 0.017, 0.019), roughness: 0.46, metalness: 0,     // premium matte black: case and trays
  clearcoat: 0.35, clearcoatRoughness: 0.32, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.2, 0.21, 0.24), envMapIntensity: ENV, side: THREE.DoubleSide });
function prep(root) {
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = true;
    const mt = m.material, role = mt.name;
    if (role === 'case') { m.material = BLACK; return; }
    mt.envMapIntensity = ENV;
    if (role === 'silk') { mt.polygonOffset = true; mt.polygonOffsetFactor = -1; mt.polygonOffsetUnits = -2; }   // the print is a sheet 25 um above the mask
  });
  return root;
}
const model = (name) => (cache[name] = cache[name] || gltf.loadAsync(`assets/3d/${name}.glb`).then((g) => prep(g.scene)));
async function tex(url) { const t = await texLoader.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// everything that is not the station fades out with the scroll: its materials are its own and transparent
const FADE = [];
function fading(obj) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    m.material = [].concat(m.material).map((mt) => {
      const c = mt.clone(); c.transparent = true; c.userData.op = mt.opacity; FADE.push(c); return c;
    });
    if (m.material.length === 1) m.material = m.material[0];
  });
  return obj;
}

// ---------------------------------------------------------------- helpers
function rr(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function uvFit(g, w, h) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
function slab(w, h, r, depth, bevel = 0) {           // rounded slab lying on y = 0, top face uv-mapped
  const g = uvFit(new THREE.ExtrudeGeometry(rr(w, h, r), { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 }), w, h);
  g.rotateX(-Math.PI / 2); return g;
}
function contact(w, h, r, blur, op) {                 // soft dark pad under an object
  const k = 4, pad = blur * 3, c = document.createElement('canvas');
  c.width = (w + 2 * pad) * k; c.height = (h + 2 * pad) * k;
  const g = c.getContext('2d'); g.filter = `blur(${blur * k}px)`; g.fillStyle = '#000';
  g.beginPath(); g.roundRect(pad * k, pad * k, w * k, h * k, r * k); g.fill();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * pad, h + 2 * pad),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: op, depthWrite: false, color: 0x0b0d1c }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.renderOrder = 1; return m;
}
function wood() {                                       // dark walnut desk, grain along X
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const rows = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    const a = y / H * Math.PI * 2;
    rows[y] = 0.11 * Math.sin(a * 7 + 1.3) + 0.07 * Math.sin(a * 19 + 0.4) + 0.05 * Math.sin(a * 41 + 2.2) + 0.04 * Math.sin(a * 83);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ax = x / W * Math.PI * 2, wav = 0.035 * Math.sin(ax * 3 + y * 0.013) + 0.02 * Math.sin(ax * 11 + y * 0.05);
    const v = 1 + rows[(y + Math.round(wav * 70) + H) % H] + (Math.random() - 0.5) * 0.06, i = (y * W + x) * 4;
    d[i] = 76 * v; d[i + 1] = 55 * v; d[i + 2] = 41 * v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.anisotropy = 8; return t;
}

// ---------------------------------------------------------------- clear resin plate: 157.4 x 87.4 R15.2, 2.8 mm base + 1.2 mm layer with 8 pockets
const PORT = (i, j) => [45 + 35 * i - 97.5, 45 + 35 * j - 62.5];
function plate() {
  const g = new THREE.Group(), PW = 157.4, PH = 87.4, PR = 15.2;
  // plain alpha glass, not transmission: seen from straight above the transmission pass washes out the board print
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xf2f8ff, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false, envMapIntensity: 1.2 });
  const edge = new THREE.MeshPhysicalMaterial({ color: 0xc8ecff, transparent: true, opacity: 0.6, roughness: 0.12, emissive: new THREE.Color(0.10, 0.20, 0.26), envMapIntensity: 1.4 });
  const ports = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) ports.push(PORT(i, j));
  const slot = (x, y) => { const h = new THREE.Path(), L = 22.48, Wd = 4.4, r = Wd / 2;
    h.absarc(x - L / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5, false); h.absarc(x + L / 2 - r, y, r, -Math.PI / 2, Math.PI / 2, false); return h; };
  const pocket = (x, y) => { const s = rr(32.6, 32.6, 0.8), h = new THREE.Path(); s.getPoints(8).forEach((q, k) => (k ? h.lineTo(q.x + x, q.y + y) : h.moveTo(q.x + x, q.y + y))); return h; };
  const layer = (holes, depth, y0) => {
    const sh = rr(PW, PH, PR); holes.forEach((h) => sh.holes.push(h));
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 24 }); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, [glass, edge]); m.position.y = y0; m.receiveShadow = true; return m;
  };
  g.add(layer(ports.map(([x, z]) => slot(x, -z)), 2.8, 0), layer(ports.map(([x, z]) => pocket(x, -z)), 1.2, 2.8));
  const c = document.createElement('canvas'); c.width = 1574; c.height = 874; const x2 = c.getContext('2d');   // window glare across the polished top
  x2.beginPath(); x2.roundRect(0, 0, c.width, c.height, PR * 10); x2.clip();
  const band = (x0, w, a) => { const gr = x2.createLinearGradient(x0, 0, x0 + w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); x2.fillStyle = gr; x2.fillRect(x0, -50, w, c.height + 100); };
  x2.setTransform(1, 0, -0.55, 1, 0, 0); band(380, 360, 0.5); band(820, 120, 0.3); band(1060, 60, 0.22);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  gl.rotation.x = -Math.PI / 2; gl.position.y = 4.02; gl.renderOrder = 3; g.add(gl);
  return g;
}
function lowPower() {                                   // slow GPU: fewer pixels
  if (DPR <= 1) return;
  DPR = 1; renderer.setPixelRatio(1); resize();
}

// ---------------------------------------------------------------- station, modules, tablet, stylus
const MAGNET = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.63, 0.65), metalness: 0.9, roughness: 0.28, envMapIntensity: ENV });
const mods = {};
async function module(name) {                          // baked board (centred, PCB bottom on y = 0) in its tray, with its magnets
  const g = new THREE.Group(), o = (await model(name)).clone(); g.add(o);
  const bb = new THREE.Box3().setFromObject(o), wide = bb.max.x - bb.min.x > 40;
  g.add((await model(wide ? 'tray65' : 'tray30')).clone());
  for (const px of (wide ? [-17.5, 17.5] : [0])) for (const sx of [-1, 1]) {
    const mg = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.5, 24), MAGNET); mg.position.set(px + sx * 10.04, 0.75, 0); mg.castShadow = true; g.add(mg);
  }
  g.userData.board = o; mods[name] = g; return g;
}
async function station() {
  const g = new THREE.Group();
  g.add(await model('station'));                        // baked: board centre on the origin, case bottom on y = 0
  const pl = plate(); pl.position.y = 10.0; g.add(pl);
  const pad = contact(161, 91, 12, 4, 0.55); g.add(pad); g.userData.pad = pad;
  const on = [['button', 0, 0, 1], ['rgb', 1, 0, 1], ['oled', 2, 0, 2], ['pot', 0, 1, 1], ['ultrasonic', 2, 1, 2]];
  await Promise.all(on.map(async ([name, i, j, n]) => {
    const m = await module(name), p = PORT(i, j), q = PORT(i + n - 1, j);
    m.position.set((p[0] + q[0]) / 2, 14.0, (p[1] + q[1]) / 2); g.add(m);
  }));
  return g;
}
function tablet(screen) {
  const g = new THREE.Group(), TW = 248, TH = 179, D = 6.2;
  const body = new THREE.Mesh(slab(TW, TH, 14, D - 1.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.65, roughness: 0.38, envMapIntensity: ENV }));
  body.position.y = 0.8; body.castShadow = body.receiveShadow = true; g.add(body);
  const glass = new THREE.Mesh(slab(TW - 1.2, TH - 1.2, 13.4, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.06, clearcoat: 1, envMapIntensity: ENV }));
  glass.position.y = D; g.add(glass);
  const SW = 227, SH = 158;
  const scr = new THREE.Mesh(uvFit(new THREE.ShapeGeometry(rr(SW, SH, 6), 12), SW, SH), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false, color: 0xe8e8e8 }));
  scr.rotation.x = -Math.PI / 2; scr.position.y = D + 0.25; g.add(scr, contact(TW, TH, 14, 3, 0.5));
  return g;
}
function stylus() {
  const g = new THREE.Group(), R = 4.4, L = 150;
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f0, roughness: 0.32, clearcoat: 0.4, envMapIntensity: ENV });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 48), white);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(1.2, R, 15, 48), white); tip.position.y = L / 2 + 7.5;
  const nib = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 3.2, 32), new THREE.MeshStandardMaterial({ color: 0xc9cbcf, roughness: 0.45 })); nib.position.y = L / 2 + 15 + 1.6;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white); cap.rotation.x = Math.PI; cap.position.y = -L / 2; cap.scale.y = 0.35;
  [body, tip, nib, cap].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  const inner = new THREE.Group(); inner.add(body, tip, nib, cap); inner.rotation.z = -Math.PI / 2; inner.position.y = R;
  g.add(inner, contact(L + 20, 6, 3, 2.5, 0.5));
  return g;
}
const TOP = 2.2, RIM = TOP + 15.15;                     // mat surface, top of the station's bezel
function put(obj, x, z, yawDeg, y = TOP) { obj.position.set(x, y, z); obj.rotation.y = rad(yawDeg); scene.add(obj); return obj; }

// ---------------------------------------------------------------- camera: top-down hero -> closer -> three quarters between the texts
const FOV = 24, cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 20, 5000);
cam.up.set(0, 0, -1);                                   // screen up = far side of the desk, also when the camera tilts
let W = 1, H = 1;
function distFor(widthPx, planeY) {                     // camera distance at which the station (161.2 mm) is widthPx wide on screen
  return 161.2 / (widthPx / W) / (2 * Math.tan(rad(FOV / 2)) * (W / H));
}
function poses() {
  const sw = Math.min(0.36 * W, 0.7425 * H);           // = the loader drawing (CSS --sw)
  return {
    hero: { tx: 0, ty: RIM, tz: 0, el: 90, az: 0, d: distFor(sw) },
    near: { tx: 0, ty: RIM, tz: 0, el: 90, az: 0, d: distFor(sw * 1.14) },
    say: { tx: 0, ty: TOP + 7, tz: 2, el: num('s_el', 54), az: num('s_az', -22), d: distFor(Math.min(0.3 * W, 0.62 * H)) },
  };
}
let P = null;
const mix = (a, b, k) => { const o = {}; for (const key in a) o[key] = lerp(a[key], b[key], k); return o; };
function place(p, ox, oy) {
  const el = rad(p.el), az = rad(p.az);
  cam.position.set(p.tx + p.d * Math.cos(el) * Math.sin(az) + ox * 16, p.ty + p.d * Math.sin(el), p.tz + p.d * Math.cos(el) * Math.cos(az) + oy * 11);
  cam.lookAt(p.tx + ox * 4, p.ty, p.tz + oy * 3);
}
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
  dof.width = Math.ceil(W / 3); dof.height = Math.ceil(H / 3);
  P = poses(); dirty = true;
}

// ---------------------------------------------------------------- the lit RGB module (click the button on the station)
let lit = 0, litTo = 0, pressT = -1, led = null, cap = null, hitBox = null;
function wireDemo() {
  const rgb = mods.rgb, btn = mods.button; if (!rgb || !btn) return;
  const face = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 4.6), new THREE.MeshBasicMaterial({ color: 0x22ff6a, toneMapped: false, transparent: true, opacity: 0 }));
  face.position.set(0, 3.3, -1.5); rgb.add(face);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0x22ff6a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  halo.scale.set(34, 34, 1); halo.position.set(0, 5, -1.5); halo.renderOrder = 10; rgb.add(halo);
  const lamp = new THREE.PointLight(0x22ff6a, 0, 45, 2); lamp.position.set(0, 9, -1.5); rgb.add(lamp);
  led = { face, halo, lamp };
  btn.userData.board.traverse((m) => { if (m.isMesh && m.material.name.startsWith('c44_27_1')) cap = m; });     // the yellow plunger of the tact switch
  if (cap) cap.userData.y0 = cap.position.y;
  hitBox = new THREE.Mesh(new THREE.BoxGeometry(32, 12, 32), new THREE.MeshBasicMaterial({ visible: false })); hitBox.position.y = 4; btn.add(hitBox);
}
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function overButton(e) {
  if (!hitBox) return false;
  ptr.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1);
  ray.setFromCamera(ptr, cam); return ray.intersectObject(hitBox).length > 0;
}
function press() { pressT = performance.now(); litTo = litTo ? 0 : 1; QB.onLed && QB.onLed(litTo); if (hint) hint.classList.add('done'); dirty = true; }
QB.pressButton = press;

// ---------------------------------------------------------------- frame loop (renders only when something changed)
let dirty = true, hp = 0, yp = 0, mx = 0, my = 0, tmx = 0, tmy = 0, last = 0, envNow = -1, stageNow = -1, live = false, slow = [];
const anchor = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
  const k = QB.still ? 1 : 1 - Math.exp(-dt * 9);
  const th = Q.has('p') ? +Q.get('p') : (QB.heroP || 0), ty = Q.has('sp') ? +Q.get('sp') : (QB.sayP || 0);
  if (Math.abs(th - hp) > 0.0004) { hp += (th - hp) * k; dirty = true; } else if (hp !== th) { hp = th; dirty = true; }
  if (Math.abs(ty - yp) > 0.0004) { yp += (ty - yp) * k; dirty = true; } else if (yp !== ty) { yp = ty; dirty = true; }
  const on = doc.classList.contains('ui') ? 1 : 0;                                   // parallax once the intro is over
  if (Math.abs(tmx * on - mx) + Math.abs(tmy * on - my) > 0.002) { mx += (tmx * on - mx) * (1 - Math.exp(-dt * 3.5)); my += (tmy * on - my) * (1 - Math.exp(-dt * 3.5)); dirty = true; }
  if (led && (Math.abs(litTo - lit) > 0.002 || pressT >= 0)) {
    lit += (litTo - lit) * (1 - Math.exp(-dt * 10));
    led.face.material.opacity = lit; led.halo.material.opacity = 0.9 * lit; led.lamp.intensity = 220 * lit;
    const kp = pressT < 0 ? 0 : (now - pressT) / 260;
    if (cap) cap.position.y = cap.userData.y0 - (kp < 1 ? Math.sin(kp * Math.PI) * 0.5 : 0);
    if (kp >= 1) pressT = -1;
    dirty = true;
  }
  if (!dirty) return;
  dirty = false;
  const env = 1 - ease((hp - 0.1) / 0.6), show = 1 - ease((yp - 0.84) / 0.13);
  if (Math.abs(env - envNow) > 0.001) {
    envNow = env;
    for (const m of FADE) m.opacity = m.userData.op * env;
    stage.style.setProperty('--env', env.toFixed(3));
  }
  if (show !== stageNow) { stageNow = show; stage.style.opacity = show.toFixed(3); stage.style.visibility = show > 0 ? '' : 'hidden'; }
  if (show <= 0) return;
  const k1 = ease(hp / 0.9), k2 = ease(yp / 0.5), par = (1 - k1 * 0.6) * (1 - k2);
  place(mix(mix(P.hero, P.near, k1), P.say, k2), mx * par, my * par);
  const t1 = performance.now();
  renderer.render(scene, cam);
  if (env > 0.02) { dctx.clearRect(0, 0, dof.width, dof.height); dctx.drawImage(canvas, 0, 0, dof.width, dof.height); }
  if (hint && mods.button) {                             // "press the button" label follows the module on screen
    mods.button.getWorldPosition(anchor); anchor.y += 10; anchor.project(cam);
    hint.style.transform = `translate(${((anchor.x + 1) / 2 * W).toFixed(1)}px, ${((1 - anchor.y) / 2 * H).toFixed(1)}px)`;
  }
  if (slow && live && on) {                              // measure a few frames once, drop to the light mode on a weak GPU
    renderer.getContext().finish(); slow.push(performance.now() - t1);
    if (slow.length >= 10) { slow.sort((a, b) => a - b); QB.frameMs = slow[5]; slow = null; if (QB.frameMs > 34) lowPower(); }
    else dirty = true;
  }
}

// ---------------------------------------------------------------- build
(async () => {
  const [matTex, scrTex] = await Promise.all([tex('assets/3d/mat.webp'), tex('assets/3d/screen.webp')]);
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.82, envMapIntensity: ENV }));
  desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; scene.add(fading(desk));
  // the mat's bottom-left corner sits at 25 % / 88 % of a 16:10 hero frame, turned a few degrees like the reference
  const mat = new THREE.Group();
  const matMesh = new THREE.Mesh(slab(594, 420, 8, TOP), [new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.78, envMapIntensity: ENV }), new THREE.MeshStandardMaterial({ color: 0x1f47c8, roughness: 0.8, envMapIntensity: ENV })]);
  matMesh.receiveShadow = matMesh.castShadow = true; mat.add(matMesh, contact(594, 420, 8, 3, 0.45));
  mat.position.set(num('m_x', 186), 0, num('m_z', -96)); mat.rotation.y = rad(num('m_yaw', 3.5)); scene.add(fading(mat));

  const st = await station(); put(st, 0, 0, 0);
  fading(st.userData.pad);                              // its shadow pad goes with the mat
  const loose = [['temphum', num('a_x', -190), num('a_z', -22), 16, 0], ['buzzer', num('b_x', -78), num('b_z', 96), -12, TOP], ['led', num('c_x', 108), num('c_z', 70), -26, TOP]];
  await Promise.all(loose.map(async ([name, x, z, yaw, y]) => {
    const m = await module(name), pad = contact(32.2, 32.2, 5, 1.6, 0.4); pad.position.y = -1.14; m.add(pad);
    put(fading(m), x, z, yaw, y + 1.2);
  }));
  put(fading(tablet(scrTex)), num('t_x', 292), num('t_z', 184), num('t_yaw', 14));
  put(fading(stylus()), num('s_x', 64), num('s_z', -116), num('s_yaw', -46));
  wireDemo();

  resize(); addEventListener('resize', resize);
  renderer.compile(scene, cam);
  place(P.hero, 0, 0); renderer.render(scene, cam);                              // first frame: shadows, shaders, textures on the GPU
  renderer.shadowMap.autoUpdate = false;                                           // nothing that casts a shadow moves
  addEventListener('pointermove', (e) => {
    tmx = e.clientX / W * 2 - 1; tmy = e.clientY / H * 2 - 1;
    const over = (QB.heroP || 0) < 0.2 && doc.classList.contains('ui') && overButton(e); canvas.style.cursor = over ? 'pointer' : '';
  }, { passive: true });
  canvas.addEventListener('click', (e) => { if (overButton(e)) press(); });
  if (hint) hint.addEventListener('click', press);
  live = true; QB.ready && QB.ready();
  requestAnimationFrame(frame);
})().catch((e) => { console.error('hero scene', e); stage.remove(); QB.fail && QB.fail(); });
