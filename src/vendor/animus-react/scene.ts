import * as THREE from "three";
import type { AnimusPatient, AnimusScene, AnimusSceneCallbacks, Gender } from "./types";

// ---- demo patients (mirrors the prototype; fixed first names match voice) ----
const VN_W = ["Anna", "Sophie", "Mia", "Lea", "Emma", "Lina", "Marie", "Lena", "Hannah", "Clara", "Emilia", "Ella", "Johanna", "Greta", "Elisabeth", "Anastasia", "Charlotte", "Paula", "Helena", "Luisa"];
const VN_M = ["Lukas", "Elias", "Noah", "Jonas", "Paul", "Leon", "Finn", "Luca", "Ben", "Felix", "Max", "Moritz", "Jakob", "Anton", "Emil", "David", "Julian", "Tim", "Niklas", "Theo"];
const NACH = ["K.", "M.", "B.", "W.", "L.", "F.", "S.", "R.", "H.", "T.", "G.", "N.", "P.", "Z.", "D.", "V."];
const BEH = ["Aligner", "Multiband", "Herausnehmbar", "Retention"];
const MON = ["Jun", "Jul", "Aug"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makePatient(gender: Gender, firstName?: string): AnimusPatient {
  const vn = firstName ?? (gender === "w" ? rand(VN_W) : rand(VN_M));
  const total = 6 + Math.floor(Math.random() * 8);
  const cur = 1 + Math.floor(Math.random() * total);
  return {
    name: `${vn} ${rand(NACH)}`,
    gender,
    age: 8 + Math.floor(Math.random() * 12),
    treatment: rand(BEH),
    phase: `${cur} / ${total}`,
    next: `${10 + Math.floor(Math.random() * 19)}. ${rand(MON)}`,
    progress: Math.round((cur / total) * 100),
  };
}

function defaultPatients(): AnimusPatient[] {
  const fixed: Array<[Gender, string]> = [
    ["w", "Anna"], ["w", "Anastasia"], ["w", "Elisabeth"], ["w", "Sophie"],
    ["m", "Lukas"], ["m", "Noah"], ["w", "Mia"], ["m", "Elias"],
  ];
  const list = fixed.map(([g, vn]) => makePatient(g, vn));
  for (let i = 0; i < 292; i++) list.push(makePatient(Math.random() < 0.52 ? "w" : "m"));
  return list;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, "rgba(255,255,255,1)");
  rad.addColorStop(0.35, "rgba(180,230,255,.8)");
  rad.addColorStop(1, "rgba(120,180,255,0)");
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface NodeUserData {
  base: number;
  pat: AnimusPatient;
}

/**
 * Build the ANIMUS "Remix" scene (reactive core + patient graph) on a canvas.
 * Ported from the validated HUD prototype; no DOM beyond the canvas. Hover,
 * focus and unfocus are surfaced via callbacks so the React layer owns the UI.
 */
export function createAnimusScene(
  canvas: HTMLCanvasElement,
  patients: AnimusPatient[] | undefined,
  callbacks: AnimusSceneCallbacks = {},
): AnimusScene {
  const data = patients && patients.length ? patients : defaultPatients();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  let camDefaultZ = 6;

  const glowTex = makeGlowTexture();
  const lerpColor = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

  // distant starfield
  {
    const M = 600;
    const p = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      const r = 14 + Math.random() * 16, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      p[i * 3] = r * Math.sin(ph) * Math.cos(th);
      p[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      p[i * 3 + 2] = r * Math.cos(ph);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0x6f9fd0, size: 0.06, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    scene.add(new THREE.Points(g, m));
  }

  const root = new THREE.Group();
  scene.add(root);

  // reactive core
  const N = 1500, R = 0.5;
  const corePos = new Float32Array(N * 3);
  const coreDir = new Float32Array(N * 3);
  const coreCol = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
    const x = Math.cos(phi) * r, z = Math.sin(phi) * r;
    coreDir[i * 3] = x; coreDir[i * 3 + 1] = y; coreDir[i * 3 + 2] = z;
    corePos[i * 3] = x * R; corePos[i * 3 + 1] = y * R; corePos[i * 3 + 2] = z * R;
    const c = lerpColor(0x5ed9ff, 0x9a7cff, (y + 1) / 2);
    coreCol[i * 3] = c.r; coreCol[i * 3 + 1] = c.g; coreCol[i * 3 + 2] = c.b;
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute("position", new THREE.BufferAttribute(corePos, 3));
  cg.setAttribute("color", new THREE.BufferAttribute(coreCol, 3));
  const cm = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const kern = new THREE.Points(cg, cm);
  root.add(kern);

  // patient nodes (shared material per gender)
  const matW = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0xff8ad6), transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const matM = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0x66cfff), transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  // Neutral gold for "divers": neither the female pink nor the male blue.
  const matD = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0xf5c56b), transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const matFor = (g: Gender): THREE.SpriteMaterial => (g === "w" ? matW : g === "d" ? matD : matM);
  const nodi = new THREE.Group();
  root.add(nodi);

  // Render every patient as a node so any one can be focused, by click or by
  // voice call. focusByName scans all sprites, so nothing is hidden behind a cap.
  const NODES = data.length;
  const sprites: THREE.Sprite[] = [];
  const pos: THREE.Vector3[] = [];
  for (let i = 0; i < NODES; i++) {
    const y = 1 - ((i + 0.5) / NODES) * 2, r = Math.sqrt(1 - y * y), phi = i * 2.399963;
    const RR = 1.5 + Math.random() * 0.6;
    const v = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).multiplyScalar(RR);
    const pat = data[i];
    const s = new THREE.Sprite(matFor(pat.gender));
    s.position.copy(v);
    const base = 0.11;
    s.scale.setScalar(base);
    s.userData = { base, pat } satisfies NodeUserData;
    nodi.add(s);
    sprites.push(s);
    pos.push(v);
  }

  // connect each node to its two nearest
  const segs: number[] = [];
  for (let i = 0; i < NODES; i++) {
    let n1 = -1, n2 = -1, d1 = Infinity, d2 = Infinity;
    for (let j = 0; j < NODES; j++) {
      if (j === i) continue;
      const d = pos[i].distanceToSquared(pos[j]);
      if (d < d1) { d2 = d1; n2 = n1; d1 = d; n1 = j; }
      else if (d < d2) { d2 = d; n2 = j; }
    }
    for (const j of [n1, n2]) {
      if (j > i) segs.push(pos[i].x, pos[i].y, pos[i].z, pos[j].x, pos[j].y, pos[j].z);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
  const lm = new THREE.LineBasicMaterial({ color: 0x6a78c4, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false });
  nodi.add(new THREE.LineSegments(lg, lm));

  // ---- camera / focus ----
  let focusNode: THREE.Sprite | null = null;
  let hoverNode: THREE.Sprite | null = null;
  let level = 0;
  const camGoal = new THREE.Vector3(0, 0, camDefaultZ);
  const lookGoal = new THREE.Vector3(0, 0, 0);
  const lookCur = new THREE.Vector3(0, 0, 0);
  const _v = new THREE.Vector3();

  function patOf(s: THREE.Sprite): AnimusPatient {
    return (s.userData as NodeUserData).pat;
  }

  function focusOn(sprite: THREE.Sprite): void {
    focusNode = sprite;
    const wp = new THREE.Vector3();
    sprite.getWorldPosition(wp);
    const dirv = wp.clone();
    if (dirv.length() < 0.001) dirv.set(0, 0, 1);
    dirv.normalize();
    camGoal.copy(wp).add(dirv.multiplyScalar(2.1));
    lookGoal.copy(wp);
    callbacks.onFocus?.(patOf(sprite));
  }

  function unfocus(): void {
    if (!focusNode) return;
    focusNode = null;
    camGoal.set(0, 0, camDefaultZ);
    lookGoal.set(0, 0, 0);
    callbacks.onUnfocus?.();
  }

  function screenOf(obj: THREE.Object3D): { x: number; y: number; vis: boolean } {
    obj.getWorldPosition(_v);
    _v.project(camera);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, vis: _v.z < 1 };
  }

  function pickAt(px: number, py: number): THREE.Sprite | null {
    let best: THREE.Sprite | null = null, bd = 30;
    for (const s of sprites) {
      const sc = screenOf(s);
      if (!sc.vis) continue;
      const d = Math.hypot(sc.x - px, sc.y - py);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  const onMove = (e: PointerEvent): void => {
    const hit = pickAt(e.clientX, e.clientY);
    hoverNode = hit;
    if (hit) {
      callbacks.onHover?.(patOf(hit), e.clientX, e.clientY);
      canvas.style.cursor = "pointer";
    } else {
      callbacks.onHover?.(null, e.clientX, e.clientY);
      canvas.style.cursor = "default";
    }
  };
  const onDown = (e: PointerEvent): void => {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) focusOn(hit);
    else if (focusNode) unfocus();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);

  // ---- loop ----
  let raf = 0;
  const startTime = performance.now();
  function frame(): void {
    raf = requestAnimationFrame(frame);
    const t = (performance.now() - startTime) / 1000;
    const amp = level;

    const p = kern.geometry.attributes.position.array as Float32Array;
    const breath = 1 + Math.sin(t * 1.1) * 0.02, push = 1 + amp * 0.5;
    for (let i = 0; i < N; i++) {
      const rr = R * breath * push;
      p[i * 3] = coreDir[i * 3] * rr;
      p[i * 3 + 1] = coreDir[i * 3 + 1] * rr;
      p[i * 3 + 2] = coreDir[i * 3 + 2] * rr;
    }
    kern.geometry.attributes.position.needsUpdate = true;
    cm.opacity = 0.85 + amp * 0.15;
    cm.size = 0.045 + amp * 0.03;
    kern.rotation.y += 0.0016;

    if (!focusNode) {
      nodi.rotation.y += 0.0014;
      nodi.rotation.x = Math.sin(t * 0.13) * 0.1;
    }
    sprites.forEach((s, i) => {
      const pulse = 1 + Math.sin(t * 2 + i) * 0.06;
      const tgt = (s === hoverNode ? 1.7 : s === focusNode ? 1.9 : 1) * pulse;
      const base = (s.userData as NodeUserData).base;
      const k = s.scale.x / base;
      s.scale.setScalar(base * (k + (tgt - k) * 0.2));
    });

    camera.position.lerp(camGoal, 0.06);
    lookCur.lerp(lookGoal, 0.08);
    camera.lookAt(lookCur);
    renderer.render(scene, camera);
  }

  function resize(width: number, height: number): void {
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect;
    const fovV = (camera.fov * Math.PI) / 180;
    camDefaultZ = 3.6 / (0.52 * 2 * Math.tan(fovV / 2) * Math.min(1, aspect));
    if (!focusNode) camGoal.set(0, 0, camDefaultZ);
    camera.updateProjectionMatrix();
  }

  function focusByName(name: string): boolean {
    const low = name.trim().toLowerCase();
    if (!low) return false;
    for (const s of sprites) {
      const vn = patOf(s).name.split(" ")[0].toLowerCase();
      if (vn && low.indexOf(vn) >= 0) { focusOn(s); return true; }
    }
    return false;
  }

  return {
    setLevel: (v: number) => { level = Math.max(0, Math.min(1, v)); },
    focusByName,
    unfocus,
    resize,
    start: () => { if (!raf) frame(); },
    stop: () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    dispose: () => {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      renderer.dispose();
      glowTex.dispose();
    },
  };
}
