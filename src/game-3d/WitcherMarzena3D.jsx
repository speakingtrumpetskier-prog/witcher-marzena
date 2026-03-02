import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import AudioEngine from "../audio/AudioEngine";
import { DIALOGUES, CHOICES, ENDINGS } from "../data/dialogues";
import { BUILDINGS, getInteractions } from "../data/world";
import { UI } from "../constants/colors";

// ─── MAIN COMPONENT ────────────────────────────────
export default function WitcherMarzena3D() {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const flagsRef = useRef({});
  const cineRef = useRef({ active: false });
  const musicRef = useRef(null);
  const timersRef = useRef([]);

  const [gameState, setGameState] = useState("title"); // title|playing|dialogue|choice|cinematic
  const [dialogueId, setDialogueId] = useState(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [nearId, setNearId] = useState(null);
  const [nearLabel, setNearLabel] = useState("");
  const [flags, setFlags] = useState({});
  const [ending, setEnding] = useState(null);
  const [endingLinesShown, setEndingLinesShown] = useState(0);
  const [showEndRestart, setShowEndRestart] = useState(false);
  const [hint, setHint] = useState("");
  const [overlay, setOverlay] = useState({ color: "transparent", opacity: 0 });
  const [muted, setMuted] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);
  const [sensesActive, setSensesActive] = useState(false);
  const sensesRef = useRef(false);

  useEffect(() => { flagsRef.current = flags; }, [flags]);

  // ─── HELPER: schedule a timeout tracked for cleanup ──
  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // ─── MUSIC INIT ──────────────────────────────────
  const startMusic = useCallback(async () => {
    if (musicStarted) return;
    const engine = new AudioEngine();
    await engine.start();
    musicRef.current = engine;
    engine.setMood("village");
    setMusicStarted(true);
  }, [musicStarted]);

  // ─── THREE.JS SETUP ──────────────────────────────
  useEffect(() => {
    if (!mountRef.current || gameState === "title") return;

    const container = mountRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060812);
    scene.fog = new THREE.FogExp2(0x080a18, 0.015);

    const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 250);
    camera.position.set(0, 1.7, 55);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Postprocessing pipeline
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W, H), 0.35, 0.4, 0.88
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    // ── GROUND (vertex-colored with multi-octave noise) ──
    const noise2D = (x, y) => {
      // Simple value noise with smooth interpolation
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const h = (a, b) => ((a * 127 + b * 311 + a * b * 53) & 0xffff) / 65536;
      return (h(ix,iy)*(1-sx)*(1-sy) + h(ix+1,iy)*sx*(1-sy) + h(ix,iy+1)*(1-sx)*sy + h(ix+1,iy+1)*sx*sy);
    };
    const fbm = (x, y, octaves) => {
      let v = 0, amp = 0.5, freq = 1, max = 0;
      for (let i = 0; i < octaves; i++) { v += noise2D(x*freq, y*freq) * amp; max += amp; amp *= 0.5; freq *= 2.1; }
      return v / max;
    };

    const groundGeo = new THREE.PlaneGeometry(400, 400, 120, 120);
    const gPos = groundGeo.attributes.position;
    const gColors = new Float32Array(gPos.count * 3);

    for (let i = 0; i < gPos.count; i++) {
      const x = gPos.getX(i), y = gPos.getY(i);

      // Terrain height: gentle undulation, flattened near village and path
      const distV = Math.sqrt(x*x + y*y);
      const distP = Math.abs(x);
      const onP = distP < 3 && y < 24 && y > -95;
      const rawH = fbm(x * 0.008 + 50, y * 0.008 + 50, 4) * 0.8
                 + Math.sin(x * 0.05) * Math.cos(y * 0.04) * 0.3;
      // Flatten village center, path, and clearing
      const flatV = Math.max(0, 1 - distV / 40);   // 1 at center, 0 at 40+
      const flatP = onP ? 0.8 : 0;
      const distC = Math.sqrt(x*x + (y+80)*(y+80));
      const flatC = Math.max(0, 1 - distC / 18);
      const flatten = Math.max(flatV, flatP, flatC);
      const h = rawH * (1 - flatten * 0.9);
      gPos.setZ(i, h);

      // Zone detection for coloring
      const distVillage = Math.sqrt(x*x + y*y);
      const distPath = Math.abs(x);
      const onPath = distPath < 1.8 && y < 24 && y > -95;
      const distClearing = Math.sqrt(x*x + (y+80)*(y+80));
      const inForest = y < -24;
      const nVal = fbm(x * 0.03 + 100, y * 0.03 + 100, 3);
      const detail = fbm(x * 0.12 + 200, y * 0.12 + 200, 2) * 0.15;

      let r, g, b;
      if (distClearing < 16) {
        // Clearing: lush spring green
        const t = Math.min(1, distClearing / 16);
        r = 0.16 + nVal * 0.08 + detail;
        g = 0.32 + nVal * 0.12 + detail;
        b = 0.10 + nVal * 0.04;
        // Blend edges
        if (t > 0.7) { const bt = (t - 0.7) / 0.3; r = r * (1-bt) + (0.08 + nVal*0.04) * bt; g = g * (1-bt) + (0.14 + nVal*0.06) * bt; b = b * (1-bt) + 0.04 * bt; }
      } else if (onPath) {
        // Dirt path: brown/tan
        r = 0.14 + nVal * 0.06 + detail;
        g = 0.11 + nVal * 0.04;
        b = 0.07 + nVal * 0.02;
      } else if (distVillage < 35) {
        // Village: trampled earth with patches of grass
        const grass = fbm(x * 0.08 + 300, y * 0.08 + 300, 2);
        if (grass > 0.55) {
          r = 0.10 + nVal * 0.05 + detail; g = 0.17 + nVal * 0.08; b = 0.05 + nVal * 0.02;
        } else {
          r = 0.12 + nVal * 0.05 + detail; g = 0.10 + nVal * 0.04; b = 0.06 + nVal * 0.02;
        }
        // Blend edge to wilderness
        if (distVillage > 28) { const bt = (distVillage - 28) / 7; r *= (1 - bt * 0.3); g = g * (1 - bt * 0.1) + bt * 0.02; }
      } else if (inForest) {
        // Forest floor: dark with dead leaves, moss patches
        const moss = fbm(x * 0.1 + 500, y * 0.1 + 500, 2);
        r = 0.04 + nVal * 0.04 + detail;
        g = 0.07 + nVal * 0.05 + (moss > 0.6 ? 0.04 : 0);
        b = 0.02 + nVal * 0.02;
      } else {
        // Meadow / wilderness
        r = 0.06 + nVal * 0.05 + detail;
        g = 0.12 + nVal * 0.08;
        b = 0.03 + nVal * 0.03;
      }
      gColors[i*3] = Math.max(0, Math.min(1, r));
      gColors[i*3+1] = Math.max(0, Math.min(1, g));
      gColors[i*3+2] = Math.max(0, Math.min(1, b));
    }
    groundGeo.setAttribute("color", new THREE.BufferAttribute(gColors, 3));
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Village ground overlay (subtle, slightly raised)
    const villageGround = new THREE.Mesh(
      new THREE.CircleGeometry(34, 48),
      new THREE.MeshStandardMaterial({ color: 0x252e15, transparent: true, opacity: 0.35, roughness: 0.95, metalness: 0 })
    );
    villageGround.rotation.x = -Math.PI / 2;
    villageGround.position.y = 0.02;
    scene.add(villageGround);

    // Forest path (raised slightly, darker)
    const pathGeo = new THREE.PlaneGeometry(2.8, 58, 1, 20);
    const pathPos = pathGeo.attributes.position;
    for (let i = 0; i < pathPos.count; i++) {
      pathPos.setZ(i, (Math.random() - 0.5) * 0.05); // subtle roughness
    }
    const pathMesh = new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({ color: 0x1a1e0c, roughness: 0.95, metalness: 0 }));
    pathMesh.rotation.x = -Math.PI / 2;
    pathMesh.position.set(0, 0.03, -54);
    scene.add(pathMesh);

    // Clearing ground (emissive, warm)
    const clearingMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, emissive: 0x0a2a05, emissiveIntensity: 1.0, roughness: 0.9, metalness: 0 });
    const clearingGround = new THREE.Mesh(new THREE.CircleGeometry(15, 48), clearingMat);
    clearingGround.rotation.x = -Math.PI / 2;
    clearingGround.position.set(0, 0.04, -80);
    scene.add(clearingGround);

    // ── FOG PLANES (layered volumetric look) ──
    const fogPlanes = [];
    const fogMat = (y, opacity, color = 0x080818) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    // Low-lying ground fog layers
    for (let i = 0; i < 8; i++) {
      const size = 120 + i * 30;
      const fog = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fogMat(0, 0.03 + i * 0.005, 0x0a0a18));
      fog.rotation.x = -Math.PI / 2;
      fog.position.set((Math.random()-0.5)*10, 0.15 + i * 0.12, -20 - i * 6);
      fog.userData = { baseY: fog.position.y, baseOp: 0.03 + i * 0.005, phase: i * 0.8 };
      scene.add(fog);
      fogPlanes.push(fog);
    }
    // Forest fog (denser, blue-green tint)
    for (let i = 0; i < 6; i++) {
      const fog = new THREE.Mesh(
        new THREE.PlaneGeometry(40 + i * 10, 12),
        fogMat(0, 0.04 + i * 0.008, 0x081018)
      );
      fog.position.set((Math.random()-0.5)*8, 1.0 + i * 0.6, -40 - i * 8);
      fog.rotation.y = (Math.random()-0.5)*0.3;
      fog.userData = { baseY: fog.position.y, baseOp: 0.04 + i * 0.008, phase: i * 1.1 + 3, isForest: true };
      scene.add(fog);
      fogPlanes.push(fog);
    }
    // Clearing mist (warm)
    for (let i = 0; i < 4; i++) {
      const fog = new THREE.Mesh(
        new THREE.PlaneGeometry(25, 8),
        fogMat(0, 0.02, 0x1a1808)
      );
      fog.position.set((Math.random()-0.5)*10, 0.4 + i * 0.5, -80 + (Math.random()-0.5)*8);
      fog.rotation.y = Math.random() * Math.PI;
      fog.userData = { baseY: fog.position.y, baseOp: 0.02, phase: i * 1.5 + 7, isClearing: true };
      fog.visible = false;
      scene.add(fog);
      fogPlanes.push(fog);
    }

    // ── BUILDINGS (detailed medieval construction) ──
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.85, metalness: 0.0 });
    const woodMed = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.82, metalness: 0.0 });
    const woodLight = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8, metalness: 0.0 });
    const plaster = new THREE.MeshStandardMaterial({ color: 0x8a7d6a, roughness: 0.95, metalness: 0.0 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0.05 });
    const stoneFoundation = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.92, metalness: 0.05 });
    const thatchMat = (c) => new THREE.MeshStandardMaterial({ color: c || 0x2a1a0a, roughness: 1.0, metalness: 0.0 });
    const winGlow = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const winFrame = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.85, metalness: 0 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x33220f, roughness: 0.85, metalness: 0 });

    BUILDINGS.forEach((b, bi) => {
      const group = new THREE.Group();
      const hw = b.w / 2, hd = b.d / 2;

      // Stone foundation (slightly wider than walls)
      const foundH = 0.5;
      const foundation = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.3, foundH, b.d + 0.3),
        stoneFoundation
      );
      foundation.position.y = foundH / 2;
      group.add(foundation);

      // Main walls (plaster between timber frame)
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h - foundH, b.d),
        plaster
      );
      walls.position.y = foundH + (b.h - foundH) / 2;
      group.add(walls);

      // Timber frame - horizontal beams
      const beamThick = 0.12;
      const addBeam = (x, y, z, w, h, d, mat) => {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || woodDark);
        beam.position.set(x, y, z);
        group.add(beam);
      };
      // Bottom beam (sill)
      addBeam(0, foundH + beamThick/2, hd + 0.01, b.w + 0.1, beamThick, beamThick);
      addBeam(0, foundH + beamThick/2, -(hd + 0.01), b.w + 0.1, beamThick, beamThick);
      // Top beam (plate)
      addBeam(0, b.h - beamThick/2, hd + 0.01, b.w + 0.1, beamThick, beamThick);
      addBeam(0, b.h - beamThick/2, -(hd + 0.01), b.w + 0.1, beamThick, beamThick);
      // Mid beam
      const midY = foundH + (b.h - foundH) * 0.5;
      addBeam(0, midY, hd + 0.01, b.w + 0.1, beamThick, beamThick);
      addBeam(0, midY, -(hd + 0.01), b.w + 0.1, beamThick, beamThick);
      // Corner posts
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz]) => {
        addBeam(sx * hw, foundH + (b.h-foundH)/2, sz * hd + sz*0.01, beamThick, b.h - foundH, beamThick);
      });
      // Side beams
      addBeam(hw + 0.01, foundH + beamThick/2, 0, beamThick, beamThick, b.d + 0.1);
      addBeam(-(hw + 0.01), foundH + beamThick/2, 0, beamThick, beamThick, b.d + 0.1);
      addBeam(hw + 0.01, b.h - beamThick/2, 0, beamThick, beamThick, b.d + 0.1);
      addBeam(-(hw + 0.01), b.h - beamThick/2, 0, beamThick, beamThick, b.d + 0.1);
      // Diagonal braces (X pattern on front)
      if (b.w > 5) {
        const braceLen = Math.sqrt((b.w*0.4)**2 + ((b.h-foundH)*0.4)**2);
        [-1,1].forEach(s => {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(braceLen, beamThick*0.8, beamThick*0.8), woodDark);
          brace.position.set(s * hw * 0.5, midY, hd + 0.02);
          brace.rotation.z = s * 0.6;
          group.add(brace);
        });
      }

      // Roof (steeper, with overhang)
      const roofH = b.h * 0.55;
      const overhang = 0.8;
      const roofW = b.w + overhang * 2;
      const roofD = b.d + overhang * 2;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(roofW, roofD) * 0.72, roofH, 4),
        thatchMat(b.roof)
      );
      roof.position.y = b.h + roofH / 2;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);

      // Roof ridge beam
      addBeam(0, b.h + roofH + 0.06, 0, Math.max(b.w, b.d) * 0.3, 0.08, 0.08, woodMed);

      // Chimney (on larger buildings)
      if (b.w > 5 || bi === 0) {
        const chW = 0.5, chD = 0.5, chH = roofH + 1.2;
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(chW, chH, chD), stoneMat);
        chimney.position.set(hw * 0.6, b.h + chH/2 - 0.3, -hd * 0.3);
        group.add(chimney);
        // Chimney cap
        const cap = new THREE.Mesh(new THREE.BoxGeometry(chW + 0.15, 0.1, chD + 0.15), stoneMat);
        cap.position.set(hw * 0.6, b.h + chH - 0.3 + 0.05, -hd * 0.3);
        group.add(cap);
      }

      // Windows with frames and shutters
      const addWindow = (x, y, z, facingZ) => {
        // Glow
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), winGlow);
        glow.position.set(x, y, z);
        if (!facingZ) glow.rotation.y = Math.PI / 2;
        group.add(glow);
        // Frame
        const frameH = new THREE.Mesh(new THREE.BoxGeometry(facingZ ? 0.7 : 0.06, 0.06, facingZ ? 0.06 : 0.7), winFrame);
        frameH.position.set(x, y, z + (facingZ ? 0.01 : 0));
        group.add(frameH);
        const frameV = new THREE.Mesh(new THREE.BoxGeometry(facingZ ? 0.06 : 0.06, 0.8, facingZ ? 0.06 : 0.06), winFrame);
        frameV.position.set(x, y, z + (facingZ ? 0.01 : 0));
        group.add(frameV);
        // Cross mullion
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(facingZ ? 0.5 : 0.04, 0.04, facingZ ? 0.04 : 0.5), winFrame);
        mullion.position.set(x, y + 0.1, z + (facingZ ? 0.015 : 0));
        group.add(mullion);
        // Shutters
        [-1, 1].forEach(s => {
          const shutter = new THREE.Mesh(new THREE.BoxGeometry(facingZ ? 0.24 : 0.04, 0.72, facingZ ? 0.04 : 0.24), woodMed);
          shutter.position.set(x + (facingZ ? s*0.38 : 0), y, z + (facingZ ? 0.03 : s*0.38));
          group.add(shutter);
        });
      };

      // Front + back windows
      [-1, 1].forEach(s => {
        addWindow(s * hw * 0.5, b.h * 0.6, hd + 0.01, true);
        addWindow(s * hw * 0.5, b.h * 0.6, -(hd + 0.01), true);
      });

      // Door (front face)
      const doorW = 0.8, doorH = 1.6;
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMat);
      door.position.set(0, foundH + doorH/2, hd + 0.04);
      group.add(door);
      // Door frame
      addBeam(0, foundH + doorH + 0.04, hd + 0.04, doorW + 0.16, 0.08, 0.08, woodDark);
      addBeam(-(doorW/2 + 0.04), foundH + doorH/2, hd + 0.04, 0.08, doorH + 0.08, 0.08, woodDark);
      addBeam(doorW/2 + 0.04, foundH + doorH/2, hd + 0.04, 0.08, doorH + 0.08, 0.08, woodDark);
      // Door handle
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), stoneMat);
      handle.position.set(0.25, foundH + doorH * 0.45, hd + 0.1);
      group.add(handle);

      // Porch (on elder's hall and some buildings)
      if (bi === 0 || bi === 2) {
        const porchD = 1.5, porchW = b.w * 0.7;
        // Porch floor
        const porchFloor = new THREE.Mesh(new THREE.BoxGeometry(porchW, 0.12, porchD), woodLight);
        porchFloor.position.set(0, foundH - 0.06, hd + porchD/2);
        group.add(porchFloor);
        // Porch posts
        [-1, 1].forEach(s => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), woodDark);
          post.position.set(s * porchW/2 * 0.85, foundH + 1.1, hd + porchD - 0.15);
          group.add(post);
        });
        // Porch roof (small overhang)
        const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.4, 0.08, porchD + 0.3), thatchMat(b.roof));
        porchRoof.position.set(0, foundH + 2.2, hd + porchD/2);
        // Slight tilt
        porchRoof.rotation.x = 0.12;
        group.add(porchRoof);
      }

      // Step at door
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.5), stoneMat);
      step.position.set(0, 0.08, hd + 0.3);
      group.add(step);

      group.position.set(b.x, 0, b.z);
      group.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
      scene.add(group);
    });

    // ── WELL (detailed stonework) ──
    const well = new THREE.Group();
    const wellStone = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.88, metalness: 0.05 });
    const wellStoneDark = new THREE.MeshStandardMaterial({ color: 0x484848, roughness: 0.9, metalness: 0.05 });
    const wellMoss = new THREE.MeshStandardMaterial({ color: 0x2a4a20, roughness: 1.0, metalness: 0.0 });
    const wellWood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.85, metalness: 0.0 });

    // Stone wall: stacked rings with slight size variation
    for (let r = 0; r < 5; r++) {
      const radius = 1.15 - r * 0.03;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(radius - 0.05, radius, 0.18, 10),
        r % 2 === 0 ? wellStone : wellStoneDark
      );
      ring.position.y = 0.09 + r * 0.19;
      well.add(ring);
    }
    // Inner dark void
    const wellInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 1.0, 10),
      new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 0.9, metalness: 0 })
    );
    wellInner.position.y = 0.5;
    well.add(wellInner);
    // Rim (capstone)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.1, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.88, metalness: 0.05 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.0;
    well.add(rim);

    // Wooden A-frame above well
    [-1, 1].forEach(s => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5), wellWood);
      post.position.set(s * 0.9, 1.0 + 1.1, 0);
      post.rotation.z = s * 0.15;
      well.add(post);
    });
    // Crossbeam
    const crossbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), wellWood);
    crossbeam.rotation.z = Math.PI / 2;
    crossbeam.position.y = 2.3;
    well.add(crossbeam);
    // Rope
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95, metalness: 0 }));
    rope.position.set(0, 1.5, 0);
    well.add(rope);
    // Bucket
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 6), wellWood);
    bucket.position.set(0, 0.75, 0);
    well.add(bucket);
    const bucketRim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 4, 6), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0.05 }));
    bucketRim.rotation.x = Math.PI / 2;
    bucketRim.position.set(0, 0.85, 0);
    well.add(bucketRim);

    // Water surface (dark, deep)
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 16),
      new THREE.MeshBasicMaterial({ color: 0x0a1520, transparent: true, opacity: 0.7 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.15;
    well.add(water);

    // Moss patches on north side
    for (let m = 0; m < 4; m++) {
      const moss = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 4, 3),
        wellMoss
      );
      const a = -0.5 + Math.random() * 1.0;
      moss.position.set(Math.cos(a) * 1.15, 0.3 + m * 0.2, Math.sin(a) * 1.15);
      moss.scale.set(1, 0.4, 1);
      well.add(moss);
    }

    // Cobblestone circle around well
    for (let s = 0; s < 12; s++) {
      const a = (s / 12) * Math.PI * 2;
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.3 + Math.random()*0.15, 0.06, 0.25 + Math.random()*0.1),
        new THREE.MeshStandardMaterial({ color: 0x505050 + Math.floor(Math.random() * 0x151515), roughness: 0.9, metalness: 0.05 })
      );
      stone.position.set(Math.cos(a) * 1.7, 0.03, Math.sin(a) * 1.7);
      stone.rotation.y = a + Math.random() * 0.3;
      well.add(stone);
    }
    well.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    scene.add(well);

    // ── VILLAGE DETAILS ──
    // Hay bales (near buildings)
    const hayMat = new THREE.MeshStandardMaterial({ color: 0x8a7a3a, roughness: 0.95, metalness: 0 });
    [[12, 6], [-10, 8], [6, -14], [-6, -18]].forEach(([hx, hz]) => {
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8), hayMat);
      bale.rotation.x = Math.PI / 2;
      bale.position.set(hx, 0.4, hz);
      scene.add(bale);
    });
    // Stacked bales
    const bale1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8), hayMat);
    bale1.rotation.x = Math.PI / 2; bale1.position.set(12.8, 0.4, 5.5); scene.add(bale1);
    const bale2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.75, 8), hayMat);
    bale2.rotation.x = Math.PI / 2; bale2.position.set(12.4, 1.2, 5.8); scene.add(bale2);

    // Wooden fences (village perimeter segments)
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.85, metalness: 0 });
    const addFence = (x1, z1, x2, z2) => {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.sqrt(dx*dx + dz*dz);
      const angle = Math.atan2(dx, dz);
      // Rail
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), fenceMat);
      rail.position.set((x1+x2)/2, 0.7, (z1+z2)/2);
      rail.rotation.y = angle;
      scene.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), fenceMat);
      rail2.position.set((x1+x2)/2, 0.4, (z1+z2)/2);
      rail2.rotation.y = angle;
      scene.add(rail2);
      // Posts
      const posts = Math.max(2, Math.floor(len / 2));
      for (let p = 0; p <= posts; p++) {
        const t = p / posts;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), fenceMat);
        post.position.set(x1 + dx*t, 0.5, z1 + dz*t);
        scene.add(post);
      }
    };
    addFence(20, 8, 24, -5);
    addFence(-20, 8, -24, -5);
    addFence(20, -22, 24, -10);

    // Waystone at forest entrance
    const waystoneGroup = new THREE.Group();
    const wsStone = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 2.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.88, metalness: 0.05 })
    );
    wsStone.position.y = 1.1;
    // Slight lean
    wsStone.rotation.z = 0.03;
    waystoneGroup.add(wsStone);
    // Carved face (rough circle indent)
    const wsFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.88, metalness: 0.05 })
    );
    wsFace.position.set(0, 1.5, 0.16);
    waystoneGroup.add(wsFace);
    // Elven symbol (small triangle)
    const wsSymbol = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.15, 3),
      new THREE.MeshBasicMaterial({ color: 0x88aa66, transparent: true, opacity: 0.4 })
    );
    wsSymbol.position.set(0, 1.2, 0.16);
    wsSymbol.rotation.x = Math.PI / 2;
    waystoneGroup.add(wsSymbol);
    // Wildflowers at base
    [0xdd5577, 0xeebb33, 0xaa66cc].forEach((c, i) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 3), new THREE.MeshBasicMaterial({ color: c }));
      f.position.set(-0.2 + i * 0.2, 0.05, 0.25);
      waystoneGroup.add(f);
    });
    waystoneGroup.position.set(-1.5, 0, -26);
    scene.add(waystoneGroup);

    // Woodpile near elder's hall
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.9, metalness: 0 });
    for (let ly = 0; ly < 3; ly++) {
      for (let lx = 0; lx < 4 - ly; lx++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5), logMat);
        log.rotation.z = Math.PI / 2;
        log.position.set(19.5 + lx * 0.28 + ly * 0.14, 0.12 + ly * 0.24, -8);
        scene.add(log);
      }
    }

    // Cart near common house
    const cartGroup = new THREE.Group();
    const cartWood = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.85, metalness: 0 });
    // Bed
    cartGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 2.0), cartWood));
    cartGroup.children[0].position.y = 0.5;
    // Sides
    [-1,1].forEach(s => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 2.0), cartWood);
      side.position.set(s * 0.6, 0.7, 0);
      cartGroup.add(side);
    });
    // Wheels
    [-1,1].forEach(s => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 8), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9, metalness: 0.1 }));
      wheel.position.set(0.7 * (s > 0 ? 1 : -1), 0.35, s * 0.7);
      wheel.rotation.y = Math.PI / 2;
      cartGroup.add(wheel);
    });
    cartGroup.position.set(-10, 0, -6);
    cartGroup.rotation.y = 0.3;
    scene.add(cartGroup);

    // Smoke particles from chimneys (subtle upward drift)
    const smokeCount = 30;
    const smokePos = new Float32Array(smokeCount * 3);
    const smokeVel = new Float32Array(smokeCount);
    // Only from buildings with chimneys (index 0 and those with w > 5)
    const chimneyBuildings = BUILDINGS.filter((b, i) => b.w > 5 || i === 0);
    for (let i = 0; i < smokeCount; i++) {
      const cb = chimneyBuildings[i % chimneyBuildings.length];
      smokePos[i*3] = cb.x + cb.w * 0.3 + (Math.random()-0.5)*0.3;
      smokePos[i*3+1] = cb.h + cb.h * 0.55 + 1.2 + Math.random() * 3;
      smokePos[i*3+2] = cb.z - cb.d * 0.15 + (Math.random()-0.5)*0.3;
      smokeVel[i] = 0.15 + Math.random() * 0.25;
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
    const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
      color: 0x555566, size: 0.3, transparent: true, opacity: 0.15, sizeAttenuation: true
    }));
    scene.add(smoke);

    // ── TREES (multi-species instanced) ──
    const rng = (s) => { let v = s; return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; };
    const rand = rng(42);
    const treeData = [];
    for (let i = 0; i < 800; i++) {
      let x, z, s;
      if (i < 580) {
        // Forest trees: denser, taller
        x = (rand() - 0.5) * 130;
        z = -26 - rand() * 95;
        s = 0.7 + rand() * 1.1;
      } else {
        // Scattered meadow/village trees
        x = (rand() - 0.5) * 80;
        z = -25 + rand() * 85;
        s = 0.4 + rand() * 0.6;
      }
      if (Math.abs(x) < 3.0 && z < -24 && z > -95) continue;
      if (x * x + (z + 80) * (z + 80) < 17 * 17) continue;
      if (x * x + z * z < 14 * 14) continue;
      let skip = false;
      for (const b of BUILDINGS) { if (Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3) { skip = true; break; } }
      if (skip) continue;
      // Species: 0=pine, 1=oak, 2=birch
      const species = z < -30 ? (rand() < 0.6 ? 0 : (rand() < 0.5 ? 1 : 2)) : (rand() < 0.3 ? 0 : (rand() < 0.6 ? 1 : 2));
      treeData.push({ x, z, s, species });
    }
    const dummy = new THREE.Object3D();

    // PINE: tapered trunk + 3 layered cones (dark green, classic conifer)
    const pines = treeData.filter(t => t.species === 0);
    const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.9, metalness: 0 });
    const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0x0f2810, roughness: 0.95, metalness: 0 });
    const pineTrunkGeo = new THREE.CylinderGeometry(0.08, 0.18, 4, 5);
    const pineTrunkI = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, pines.length);
    // 3 foliage layers per pine
    const pineCone1 = new THREE.ConeGeometry(1.6, 2.8, 6);
    const pineCone2 = new THREE.ConeGeometry(1.2, 2.4, 6);
    const pineCone3 = new THREE.ConeGeometry(0.8, 2.0, 6);
    const pineLeaf1 = new THREE.InstancedMesh(pineCone1, pineLeafMat, pines.length);
    const pineLeaf2 = new THREE.InstancedMesh(pineCone2, new THREE.MeshStandardMaterial({ color: 0x122a12, roughness: 0.95, metalness: 0 }), pines.length);
    const pineLeaf3 = new THREE.InstancedMesh(pineCone3, new THREE.MeshStandardMaterial({ color: 0x163016, roughness: 0.95, metalness: 0 }), pines.length);
    pines.forEach((t, i) => {
      const s = t.s;
      dummy.position.set(t.x, 2.0 * s, t.z); dummy.scale.set(s, s, s); dummy.updateMatrix();
      pineTrunkI.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 3.2 * s; dummy.updateMatrix(); pineLeaf1.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 4.5 * s; dummy.updateMatrix(); pineLeaf2.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 5.6 * s; dummy.updateMatrix(); pineLeaf3.setMatrixAt(i, dummy.matrix);
    });
    scene.add(pineTrunkI); scene.add(pineLeaf1); scene.add(pineLeaf2); scene.add(pineLeaf3);
    [pineTrunkI, pineLeaf1, pineLeaf2, pineLeaf3].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

    // OAK: thick trunk + 2 rounded canopy spheres (dark olive)
    const oaks = treeData.filter(t => t.species === 1);
    const oakTrunkMat = new THREE.MeshStandardMaterial({ color: 0x33200e, roughness: 0.9, metalness: 0 });
    const oakLeafMat1 = new THREE.MeshStandardMaterial({ color: 0x1a3014, roughness: 0.95, metalness: 0 });
    const oakLeafMat2 = new THREE.MeshStandardMaterial({ color: 0x1e3618, roughness: 0.95, metalness: 0 });
    const oakTrunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 3.2, 6);
    const oakCanopyGeo1 = new THREE.SphereGeometry(1.8, 7, 5);
    const oakCanopyGeo2 = new THREE.SphereGeometry(1.3, 6, 5);
    const oakTrunkI = new THREE.InstancedMesh(oakTrunkGeo, oakTrunkMat, oaks.length);
    const oakCanopy1 = new THREE.InstancedMesh(oakCanopyGeo1, oakLeafMat1, oaks.length);
    const oakCanopy2 = new THREE.InstancedMesh(oakCanopyGeo2, oakLeafMat2, oaks.length);
    oaks.forEach((t, i) => {
      const s = t.s;
      dummy.position.set(t.x, 1.6 * s, t.z); dummy.scale.set(s, s, s); dummy.updateMatrix();
      oakTrunkI.setMatrixAt(i, dummy.matrix);
      // Main canopy offset slightly
      dummy.position.set(t.x + (rand()-0.5)*0.3*s, 3.8 * s, t.z + (rand()-0.5)*0.3*s);
      dummy.scale.set(s * (0.9 + rand()*0.3), s * (0.8 + rand()*0.3), s * (0.9 + rand()*0.3));
      dummy.updateMatrix(); oakCanopy1.setMatrixAt(i, dummy.matrix);
      // Secondary canopy lobe
      dummy.position.set(t.x + (rand()-0.5)*0.8*s, 4.2 * s, t.z + (rand()-0.5)*0.8*s);
      dummy.scale.set(s * (0.7 + rand()*0.3), s * (0.6 + rand()*0.3), s * (0.7 + rand()*0.3));
      dummy.updateMatrix(); oakCanopy2.setMatrixAt(i, dummy.matrix);
    });
    scene.add(oakTrunkI); scene.add(oakCanopy1); scene.add(oakCanopy2);
    [oakTrunkI, oakCanopy1, oakCanopy2].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

    // BIRCH: thin white trunk + smaller delicate foliage (lighter green)
    const birches = treeData.filter(t => t.species === 2);
    const birchTrunkMat = new THREE.MeshStandardMaterial({ color: 0xccbbaa, roughness: 0.75, metalness: 0 });
    const birchLeafMat = new THREE.MeshStandardMaterial({ color: 0x2a4a1a, transparent: true, opacity: 0.85, roughness: 0.95, metalness: 0 });
    const birchTrunkGeo = new THREE.CylinderGeometry(0.05, 0.09, 3.6, 5);
    const birchCanopyGeo = new THREE.SphereGeometry(1.0, 6, 5);
    const birchTrunkI = new THREE.InstancedMesh(birchTrunkGeo, birchTrunkMat, birches.length);
    const birchCanopy1 = new THREE.InstancedMesh(birchCanopyGeo, birchLeafMat, birches.length);
    const birchCanopy2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 5, 4), new THREE.MeshStandardMaterial({ color: 0x2e5220, transparent: true, opacity: 0.8, roughness: 0.95, metalness: 0 }), birches.length);
    // Birch bark rings (dark stripes) via a second thin cylinder mesh
    const birchBarkGeo = new THREE.CylinderGeometry(0.055, 0.094, 0.06, 5);
    const birchBarkMat = new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 0.85, metalness: 0 });
    const birchBarkI = new THREE.InstancedMesh(birchBarkGeo, birchBarkMat, birches.length * 4);
    birches.forEach((t, i) => {
      const s = t.s;
      dummy.position.set(t.x, 1.8 * s, t.z); dummy.scale.set(s, s, s); dummy.updateMatrix();
      birchTrunkI.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x + (rand()-0.5)*0.4*s, 3.6 * s, t.z + (rand()-0.5)*0.4*s);
      dummy.scale.set(s * (0.8+rand()*0.4), s * (0.7+rand()*0.3), s * (0.8+rand()*0.4));
      dummy.updateMatrix(); birchCanopy1.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 4.2 * s; dummy.position.x = t.x + (rand()-0.5)*0.5*s;
      dummy.scale.setScalar(s * (0.6+rand()*0.3)); dummy.updateMatrix();
      birchCanopy2.setMatrixAt(i, dummy.matrix);
      // Bark rings
      for (let r = 0; r < 4; r++) {
        dummy.position.set(t.x, (0.5 + r * 0.8) * s, t.z);
        dummy.scale.set(s, s * (0.8 + rand()*0.4), s);
        dummy.updateMatrix();
        birchBarkI.setMatrixAt(i * 4 + r, dummy.matrix);
      }
    });
    scene.add(birchTrunkI); scene.add(birchCanopy1); scene.add(birchCanopy2); scene.add(birchBarkI);
    [birchTrunkI, birchCanopy1, birchCanopy2, birchBarkI].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

    // Exposed roots for large forest trees (scattered mesh objects for variety)
    const rootGeo = new THREE.CylinderGeometry(0.03, 0.01, 1.2, 4);
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9, metalness: 0 });
    treeData.filter(t => t.s > 1.0 && t.z < -30).slice(0, 60).forEach(t => {
      for (let r = 0; r < 3; r++) {
        const a = rand() * Math.PI * 2;
        const root = new THREE.Mesh(rootGeo, rootMat);
        root.position.set(t.x + Math.cos(a) * 0.4, 0.3, t.z + Math.sin(a) * 0.4);
        root.rotation.z = Math.cos(a) * 0.7;
        root.rotation.x = Math.sin(a) * 0.7;
        scene.add(root);
      }
    });

    // ── CLEARING FLOWERS (instanced) ──
    const flowerColors = [0xdd5577, 0xeebb33, 0xaa66cc, 0xffffff, 0xff8855, 0x88ccff];
    const flowerGeo = new THREE.SphereGeometry(0.06, 4, 4);
    flowerColors.forEach(c => {
      const fm = new THREE.InstancedMesh(flowerGeo, new THREE.MeshBasicMaterial({ color: c }), 35);
      for (let i = 0; i < 35; i++) {
        const a = rand() * Math.PI * 2, r = rand() * 13;
        dummy.position.set(Math.cos(a) * r, 0.08 + rand() * 0.15, -80 + Math.sin(a) * r);
        dummy.scale.setScalar(0.5 + rand() * 2);
        dummy.updateMatrix();
        fm.setMatrixAt(i, dummy.matrix);
      }
      scene.add(fm);
    });

    // ── STARS ──
    const starCount = 400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = rand() * Math.PI * 0.45;
      const r = 120;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi) + 10;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x99aacc, size: 0.5, transparent: true, opacity: 0.7 })));

    // Moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xccccbb })
    );
    moon.position.set(-50, 65, -40);
    scene.add(moon);
    // Moon glow
    const moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x556677, transparent: true, opacity: 0.08 })
    );
    moonGlow.position.copy(moon.position);
    scene.add(moonGlow);

    // ── NPCS ──
    function makeFigure(x, z, robeColor, headColor = 0xdbb896, opts = {}) {
      const g = new THREE.Group();
      const robeMat = new THREE.MeshStandardMaterial({
        color: robeColor, roughness: 0.82, metalness: 0,
        emissive: robeColor, emissiveIntensity: 0.08,
      });
      const skinMaterial = new THREE.MeshStandardMaterial({
        color: headColor, roughness: 0.7, metalness: 0,
        emissive: headColor, emissiveIntensity: 0.06,
      });

      // Legs (two separate cylinders for more realism)
      [-1, 1].forEach(s => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6), robeMat);
        leg.position.set(s * 0.12, 0.35, 0);
        g.add(leg);
        // Boots
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.22),
          new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9, metalness: 0 }));
        boot.position.set(s * 0.12, 0.06, 0.03);
        g.add(boot);
      });

      // Body / torso (tapered cylinder)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.9, 8), robeMat);
      body.position.y = 1.15;
      g.add(body);

      // Shoulders
      const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.28), robeMat);
      shoulders.position.y = 1.65;
      g.add(shoulders);

      // Arms (hanging, slightly bent)
      [-1, 1].forEach(s => {
        // Upper arm
        const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.5, 5), robeMat);
        upperArm.position.set(s * 0.42, 1.38, 0);
        upperArm.rotation.z = s * 0.12;
        g.add(upperArm);
        // Forearm
        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.45, 5), robeMat);
        forearm.position.set(s * 0.46, 1.0, 0.05);
        forearm.rotation.z = s * 0.06;
        forearm.rotation.x = -0.15;
        g.add(forearm);
        // Hand
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), skinMaterial);
        hand.position.set(s * 0.48, 0.78, 0.08);
        g.add(hand);
      });

      // Neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), skinMaterial);
      neck.position.y = 1.76;
      g.add(neck);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinMaterial);
      head.position.y = 1.95;
      g.add(head);

      // Eyes (two small dark spheres)
      [-1, 1].forEach(s => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4),
          new THREE.MeshStandardMaterial({ color: 0x222211, roughness: 0.5, metalness: 0.1 }));
        eye.position.set(s * 0.07, 1.98, 0.17);
        g.add(eye);
      });

      // Nose
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4),
        skinMaterial);
      nose.position.set(0, 1.93, 0.2);
      nose.rotation.x = -Math.PI / 2;
      g.add(nose);

      // Hair/hat
      if (opts.hat) {
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.18, 8),
          new THREE.MeshStandardMaterial({ color: opts.hat, roughness: 0.85, metalness: 0 }));
        hat.position.y = 2.12;
        g.add(hat);
        // Hat brim
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10),
          new THREE.MeshStandardMaterial({ color: opts.hat, roughness: 0.85, metalness: 0 }));
        brim.position.y = 2.04;
        g.add(brim);
      }
      if (opts.hair) {
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
          new THREE.MeshStandardMaterial({ color: opts.hair, roughness: 0.9, metalness: 0 }));
        hair.position.set(0, 2.0, -0.04);
        hair.scale.set(1, 0.85, 1.15);
        g.add(hair);
        // Side strands
        [-1, 1].forEach(s => {
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.25, 4),
            new THREE.MeshStandardMaterial({ color: opts.hair, roughness: 0.9, metalness: 0 }));
          strand.position.set(s * 0.16, 1.82, -0.02);
          strand.rotation.z = s * 0.15;
          g.add(strand);
        });
      }

      // Belt with buckle
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.8, metalness: 0.1 }));
      belt.rotation.x = Math.PI / 2;
      belt.position.y = 1.0;
      g.add(belt);
      // Belt buckle
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x887755, roughness: 0.5, metalness: 0.3 }));
      buckle.position.set(0, 1.0, 0.27);
      g.add(buckle);

      // Enable shadows on all parts
      g.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

      // Small warm point light near each NPC so they're always visible
      const npcLight = new THREE.PointLight(0xffddaa, 0.8, 6, 2);
      npcLight.position.set(0, 1.5, 0.5);
      g.add(npcLight);

      g.position.set(x, 0, z);
      return g;
    }
    const borislav = makeFigure(13, -2, 0x6a5a3a, 0xdbb896, { hat: 0x3a2a1a });
    scene.add(borislav);
    const marta = makeFigure(-14, -1, 0x7a6a4a, 0xdbb896, { hair: 0x5a3a2a });
    scene.add(marta);

    // Aisling (half-woman, half-forest spirit)
    const aisGroup = new THREE.Group();
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x2a3a1a, emissive: 0x0a1a05, emissiveIntensity: 0.5, roughness: 0.9, metalness: 0 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a9a7a, emissive: 0x0a2a0a, emissiveIntensity: 0.4, roughness: 0.85, metalness: 0 });
    const veinMat = new THREE.MeshBasicMaterial({ color: 0x44aa33, transparent: true, opacity: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a5a1a, emissive: 0x0a3a05, emissiveIntensity: 0.6, roughness: 0.9, metalness: 0 });

    // Torso: slightly tapered, bark texture implied by two merged shapes
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.2, 8), barkMat);
    torso.position.y = 0.9;
    aisGroup.add(torso);
    // Upper body (more human)
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.5, 8), skinMat);
    chest.position.y = 1.55;
    aisGroup.add(chest);
    // Shoulders
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.25), skinMat);
    shoulders.position.y = 1.8;
    aisGroup.add(shoulders);

    // Head (human face with bark creeping up one side)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinMat);
    head.position.y = 2.05;
    aisGroup.add(head);
    // Bark encroachment on left side of face
    const barkFace = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), barkMat);
    barkFace.position.set(-0.1, 2.08, 0.05);
    barkFace.scale.set(0.8, 1.1, 0.7);
    aisGroup.add(barkFace);
    // Eyes (faintly glowing)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x88cc66, transparent: true, opacity: 0.8 });
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat);
      eye.position.set(s * 0.08, 2.1, 0.17);
      aisGroup.add(eye);
    });

    // Hair / leaf crown
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.2, 3),
        leafMat
      );
      leaf.position.set(Math.cos(a) * 0.2, 2.2 + Math.abs(Math.sin(a * 2)) * 0.1, Math.sin(a) * 0.2);
      leaf.rotation.z = Math.cos(a) * 0.4;
      leaf.rotation.x = Math.sin(a) * 0.4;
      aisGroup.add(leaf);
    }

    // Arms: one human, one becoming branch
    // Right arm (more human)
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 5), skinMat);
    armR.position.set(0.45, 1.55, 0);
    armR.rotation.z = -0.8;
    aisGroup.add(armR);
    // Left arm (becoming wood, with small branches)
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.8, 5), barkMat);
    armL.position.set(-0.5, 1.6, 0);
    armL.rotation.z = 0.9;
    aisGroup.add(armL);
    // Small twig branches off left arm
    for (let i = 0; i < 3; i++) {
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.25, 3), barkMat);
      twig.position.set(-0.6 - i * 0.08, 1.65 + i * 0.06, (i - 1) * 0.08);
      twig.rotation.z = 1.2 + i * 0.2;
      aisGroup.add(twig);
    }

    // Glowing veins running up her body (the binding made visible)
    for (let v = 0; v < 8; v++) {
      const a = (v / 8) * Math.PI * 2;
      const vein = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.008, 1.0 + Math.random() * 0.5, 3),
        veinMat.clone()
      );
      const startY = 0.3 + Math.random() * 0.3;
      vein.position.set(Math.cos(a) * 0.32, startY + 0.5, Math.sin(a) * 0.32);
      vein.rotation.z = (Math.random() - 0.5) * 0.3;
      vein.rotation.x = (Math.random() - 0.5) * 0.3;
      vein.userData.isVein = true;
      aisGroup.add(vein);
    }

    // Roots: multiple layers, thicker near base, spreading outward
    // Heavy roots (ground level, thick)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const len = 1.5 + Math.random() * 1.5;
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.02, len, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9, metalness: 0 })
      );
      root.position.set(Math.cos(a) * len * 0.35, 0.1, Math.sin(a) * len * 0.35);
      root.rotation.z = Math.cos(a) * 0.9;
      root.rotation.x = Math.sin(a) * 0.9;
      aisGroup.add(root);
    }
    // Fine roots (secondary, thinner)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
      const len = 0.8 + Math.random() * 1.0;
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.005, len, 3),
        new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9, metalness: 0 })
      );
      root.position.set(Math.cos(a) * 0.6, 0.05 + Math.random() * 0.2, Math.sin(a) * 0.6);
      root.rotation.z = Math.cos(a) * 1.1;
      root.rotation.x = Math.sin(a) * 1.1;
      aisGroup.add(root);
    }

    // Flowers growing from root intersections
    const aisFlowerColors = [0xdd5577, 0xeebb33, 0xaa66cc, 0xffffff];
    for (let f = 0; f < 6; f++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 1.2;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 3),
        new THREE.MeshBasicMaterial({ color: aisFlowerColors[f % aisFlowerColors.length] })
      );
      flower.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      aisGroup.add(flower);
    }

    aisGroup.position.set(0, 0, -80);
    aisGroup.visible = false;
    scene.add(aisGroup);

    // Clearing children
    const cKids = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5, r = 4 + rand() * 5;
      const c = makeFigure(Math.cos(a) * r, -80 + Math.sin(a) * r, 0x6a7a5a, 0xbbccaa);
      c.scale.setScalar(0.6); c.visible = false;
      scene.add(c); cKids.push(c);
    }

    // Yrden rings (for free ending)
    const yrdenRings = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2 + i * 2.5, 2.3 + i * 2.5, 32),
        new THREE.MeshBasicMaterial({ color: 0x8855cc, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.08 + i * 0.02, -80);
      ring.visible = false;
      scene.add(ring);
      yrdenRings.push(ring);
    }

    // ── INTERACTION MARKERS ──
    const markerGeo = new THREE.OctahedronGeometry(0.28);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xc9a96e, transparent: true, opacity: 0.75 });
    const markers = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(markerGeo, markerMat.clone());
      m.visible = false; scene.add(m); markers.push(m);
    }

    // ── WITCHER SENSES CLUES (hidden until senses activated) ──
    const clueObjects = [];
    const clueMat = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0 });
    const clueGlowMat = new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0 });

    // Footprints (small flat discs) - child tracks leading to forest
    const footGeo = new THREE.CircleGeometry(0.12, 6);
    for (let i = 0; i < 16; i++) {
      const fp = new THREE.Mesh(footGeo, clueMat.clone());
      fp.rotation.x = -Math.PI / 2;
      const t = i / 16;
      fp.position.set(
        Math.sin(t * 2) * 0.4 + (i % 2 === 0 ? 0.15 : -0.15),
        0.06,
        5 - t * 37
      );
      fp.userData.clueType = "footprints";
      scene.add(fp);
      clueObjects.push(fp);
    }

    // Magical residue near the well (glowing spots)
    const residueGeo = new THREE.SphereGeometry(0.15, 6, 6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = new THREE.Mesh(residueGeo, clueGlowMat.clone());
      r.position.set(Math.cos(a) * 2.5, 0.1, Math.sin(a) * 2.5);
      r.userData.clueType = "magic_residue";
      scene.add(r);
      clueObjects.push(r);
    }

    // Scent trail (drifting particles visible only in senses) from elder hall to forest
    const scentGeo = new THREE.SphereGeometry(0.08, 4, 4);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(scentGeo, clueGlowMat.clone());
      const t = i / 12;
      s.position.set(
        15 - t * 15 + (Math.random()-0.5) * 2,
        1.0 + Math.random() * 0.5,
        -5 + t * (-27)
      );
      s.userData.clueType = "scent_trail";
      scene.add(s);
      clueObjects.push(s);
    }

    // Elven runes (small planes) near the waystone at forest edge
    const runeGeo = new THREE.PlaneGeometry(0.3, 0.4);
    for (let i = 0; i < 4; i++) {
      const rune = new THREE.Mesh(runeGeo, clueMat.clone());
      rune.position.set(-1 + i * 0.6, 1.2 + i * 0.3, -32 - i * 0.2);
      rune.rotation.y = (Math.random()-0.5) * 0.3;
      rune.userData.clueType = "elven_runes";
      scene.add(rune);
      clueObjects.push(rune);
    }

    // ── LIGHTING ──
    const ambient = new THREE.AmbientLight(0x9db4ff, 0.45);
    scene.add(ambient);
    const moonLight = new THREE.DirectionalLight(0xbcd6ff, 0.7);
    moonLight.position.set(-40, 60, -20);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 180;
    moonLight.shadow.camera.left = -70;
    moonLight.shadow.camera.right = 70;
    moonLight.shadow.camera.top = 70;
    moonLight.shadow.camera.bottom = -70;
    moonLight.shadow.bias = -0.0005;
    scene.add(moonLight);

    const torchPositions = [
      [5, 2.8, 5], [-5, 2.8, 5], [5, 2.8, -10], [-5, 2.8, -10],
      [15, 2.8, 2], [-15, 2.8, 2], [0, 2.8, -5],
    ];
    const torchLights = [];
    const torchFlames = [];
    torchPositions.forEach((p, i) => {
      const l = new THREE.PointLight(0xff8844, 3.5, 25, 2);
      if (i < 2) { l.castShadow = true; l.shadow.mapSize.set(512, 512); }
      l.position.set(...p);
      l.userData = { offset: i * 1.7, base: 3.5 };
      scene.add(l);
      torchLights.push(l);
      // Pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 4), new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.85, metalness: 0 }));
      pole.position.set(p[0], 1.4, p[2]);
      scene.add(pole);
      // Flame (multi-layer for convincing fire)
      const flameGroup = new THREE.Group();
      flameGroup.position.set(...p);
      // Core (bright yellow-white)
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffdd88 }));
      flameGroup.add(core);
      // Mid flame (orange)
      const mid = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.7 }));
      mid.scale.set(1, 1.4, 1);
      flameGroup.add(mid);
      // Outer glow (red, transparent)
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.16, 5, 4), new THREE.MeshBasicMaterial({ color: 0xcc3300, transparent: true, opacity: 0.25 }));
      outer.scale.set(1, 1.6, 1);
      flameGroup.add(outer);
      flameGroup.userData = { ox: p[0], oy: p[1], oz: p[2], offset: i * 2.1 };
      scene.add(flameGroup);
      torchFlames.push(flameGroup);
    });

    const clearingLight = new THREE.PointLight(0xccaa55, 0, 28, 1.5);
    clearingLight.position.set(0, 5, -80);
    scene.add(clearingLight);
    // Secondary clearing glow
    const clearingGlow = new THREE.PointLight(0x88aa44, 0, 20, 2);
    clearingGlow.position.set(0, 1, -80);
    scene.add(clearingGlow);

    // ── PARTICLES ──
    // Fireflies (village)
    const ffCount = 60;
    const ffPos = new Float32Array(ffCount * 3);
    const ffVel = new Float32Array(ffCount * 3);
    const ffLife = new Float32Array(ffCount);
    for (let i = 0; i < ffCount; i++) {
      const a = rand() * Math.PI * 2, r = 5 + rand() * 25;
      ffPos[i*3] = Math.cos(a) * r;
      ffPos[i*3+1] = 0.5 + rand() * 3;
      ffPos[i*3+2] = Math.sin(a) * r;
      ffVel[i*3] = (rand() - 0.5) * 0.3;
      ffVel[i*3+1] = (rand() - 0.5) * 0.2;
      ffVel[i*3+2] = (rand() - 0.5) * 0.3;
      ffLife[i] = rand() * 6;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute("position", new THREE.BufferAttribute(ffPos, 3));
    const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
      color: 0xffdd66, size: 0.15, transparent: true, opacity: 0.7, sizeAttenuation: true
    }));
    scene.add(fireflies);

    // Clearing motes (golden upward float)
    const cmCount = 100;
    const cmPos = new Float32Array(cmCount * 3);
    const cmVel = new Float32Array(cmCount);
    for (let i = 0; i < cmCount; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 13;
      cmPos[i*3] = Math.cos(a) * r;
      cmPos[i*3+1] = rand() * 8;
      cmPos[i*3+2] = -80 + Math.sin(a) * r;
      cmVel[i] = 0.2 + rand() * 0.6;
    }
    const cmGeo = new THREE.BufferGeometry();
    cmGeo.setAttribute("position", new THREE.BufferAttribute(cmPos, 3));
    const clearingMotes = new THREE.Points(cmGeo, new THREE.PointsMaterial({
      color: 0xffcc44, size: 0.12, transparent: true, opacity: 0.6, sizeAttenuation: true
    }));
    clearingMotes.visible = false;
    scene.add(clearingMotes);

    // Forest motes (cold, drifting)
    const fmCount = 40;
    const fmPos = new Float32Array(fmCount * 3);
    for (let i = 0; i < fmCount; i++) {
      fmPos[i*3] = (rand() - 0.5) * 6;
      fmPos[i*3+1] = 0.3 + rand() * 4;
      fmPos[i*3+2] = -35 - rand() * 55;
    }
    const fmGeo = new THREE.BufferGeometry();
    fmGeo.setAttribute("position", new THREE.BufferAttribute(fmPos, 3));
    const forestMotes = new THREE.Points(fmGeo, new THREE.PointsMaterial({
      color: 0x88aacc, size: 0.08, transparent: true, opacity: 0.4, sizeAttenuation: true
    }));
    scene.add(forestMotes);

    // ── STORE SCENE REFS ──
    sceneRef.current = {
      scene, camera, renderer, composer, clearingLight, clearingGlow, clearingGround: clearingMat,
      aisGroup, cKids, yrdenRings, ambient, moonLight, fogPlanes, clueObjects, smoke: { pos: smokePos, vel: smokeVel, geo: smokeGeo },
      torchLights, torchFlames, markers, fireflies: { pos: ffPos, vel: ffVel, life: ffLife, geo: ffGeo, mesh: fireflies },
      clearingMotes: { pos: cmPos, vel: cmVel, geo: cmGeo, mesh: clearingMotes },
      forestMotes: { pos: fmPos, geo: fmGeo, mesh: forestMotes },
    };

    // ── CONTROLS ──
    let yaw = Math.PI, pitch = 0;
    const keys = {};
    let isDrag = false, lastM = { x: 0, y: 0 }, isLocked = false, paused = false;
    const speed = 6;

    const onKD = e => { keys[e.code] = true; };
    const onKU = e => { keys[e.code] = false; };
    document.addEventListener("keydown", onKD);
    document.addEventListener("keyup", onKU);
    renderer.domElement.addEventListener("mousedown", e => {
      if (e.button === 0) { isDrag = true; lastM = { x: e.clientX, y: e.clientY }; try { renderer.domElement.requestPointerLock(); } catch(err){} }
    });
    document.addEventListener("mouseup", () => isDrag = false);
    document.addEventListener("pointerlockchange", () => { isLocked = document.pointerLockElement === renderer.domElement; });
    document.addEventListener("mousemove", e => {
      if (isLocked) { yaw -= e.movementX * 0.0018; pitch -= e.movementY * 0.0018; }
      else if (isDrag) { yaw -= (e.clientX - lastM.x) * 0.004; pitch -= (e.clientY - lastM.y) * 0.004; lastM = { x: e.clientX, y: e.clientY }; }
      pitch = Math.max(-1.3, Math.min(1.3, pitch));
    });

    const checkCol = (x, z) => {
      for (const b of BUILDINGS) { if (Math.abs(x-b.x) < b.w/2+0.6 && Math.abs(z-b.z) < b.d/2+0.6) return true; }
      if (x*x + z*z < 2.5*2.5) return true;
      return false;
    };

    // ── ANIMATION LOOP ──
    const clock = new THREE.Clock();
    let prevMusicMood = "";
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const fl = flagsRef.current;

      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Movement
      if (!paused) {
        const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
        const rt = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yaw, 0));
        const mv = new THREE.Vector3();
        if (keys.KeyW || keys.ArrowUp) mv.add(fwd);
        if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
        if (keys.KeyA || keys.ArrowLeft) mv.sub(rt);
        if (keys.KeyD || keys.ArrowRight) mv.add(rt);
        if (mv.lengthSq() > 0) {
          mv.normalize().multiplyScalar(speed * dt);
          const nx = camera.position.x + mv.x, nz = camera.position.z + mv.z;
          if (!checkCol(nx, nz)) { camera.position.x = nx; camera.position.z = nz; }
          // Headbob
          camera.position.y = 1.7 + Math.sin(t * 8) * 0.035;
          // Footstep sounds (every ~0.45s while moving)
          if (Math.floor(t / 0.45) !== Math.floor((t - dt) / 0.45) && musicRef.current) {
            musicRef.current.playSFX("footstep");
          }
        } else {
          // Subtle idle sway
          camera.position.y = 1.7 + Math.sin(t * 1.5) * 0.008;
        }
      }

      // ── Cinematic updates ──
      const cin = cineRef.current;
      if (cin.active) {
        const e = t - cin.startTime;
        if (cin.type === "kill") {
          clearingLight.intensity = Math.max(0, 2.8 - e * 0.6);
          clearingGlow.intensity = Math.max(0, 1.5 - e * 0.35);
          clearingMat.emissiveIntensity = Math.max(0, 1.0 - e * 0.25);
          scene.fog.density = 0.02 + Math.min(0.04, e * 0.006);
          if (e > 1.8) { aisGroup.visible = false; cKids.forEach(c => { if (e > 2.5) c.visible = false; }); }
        } else if (cin.type === "free") {
          // Yrden rings pulse
          yrdenRings.forEach((ring, i) => {
            ring.visible = e > 0.3 + i * 0.4;
            if (ring.visible) ring.material.opacity = 0.5 + Math.sin(t * 4 + i) * 0.3;
          });
          if (e > 3) { clearingLight.intensity = Math.max(0, 2.8 - (e - 3) * 0.5); clearingGlow.intensity = Math.max(0, 1.5 - (e - 3) * 0.3); }
          if (e > 4) clearingMat.emissiveIntensity = Math.max(0, 1.0 - (e - 4) * 0.3);
          if (e > 5) scene.fog.density = 0.02 + Math.min(0.02, (e - 5) * 0.004);
        } else if (cin.type === "bind") {
          // Camera slowly approaches and lowers
          if (e < 7) {
            const target = new THREE.Vector3(0, 0.4, -79);
            const dir = target.clone().sub(camera.position);
            if (dir.length() > 0.5) {
              dir.normalize().multiplyScalar(dt * 1.8);
              camera.position.add(dir);
            }
            camera.position.y = Math.max(0.4, camera.position.y - dt * 0.15);
            // Look toward Aisling
            const lookDir = new THREE.Vector3(0, 1.5, -80).sub(camera.position).normalize();
            yaw = Math.atan2(-lookDir.x, -lookDir.z);
            pitch = Math.asin(lookDir.y) * 0.5;
          }
          // Intensify green
          clearingLight.intensity = 2.8 + Math.sin(t * 2) * 0.5;
          clearingGlow.intensity = 2 + Math.sin(t * 3) * 0.5;
          if (e > 5) { aisGroup.visible = false; cKids.forEach(c => c.visible = false); }
        } else if (cin.type === "confront") {
          // Camera slowly looks up then darkens
          if (e < 4) {
            pitch = Math.min(0.8, pitch + dt * 0.2);
          }
          if (e > 2) {
            clearingLight.intensity = Math.max(0, 2.8 - (e - 2) * 0.8);
            clearingGlow.intensity = Math.max(0, 1.5 - (e - 2) * 0.5);
          }
        }
      }

      // ── Fog plane animation ──
      fogPlanes.forEach(fp => {
        const ud = fp.userData;
        fp.position.y = ud.baseY + Math.sin(t * 0.3 + ud.phase) * 0.15;
        fp.material.opacity = ud.baseOp + Math.sin(t * 0.2 + ud.phase * 0.7) * ud.baseOp * 0.3;
        // Clearing fog visibility
        if (ud.isClearing) fp.visible = fl.confrontation_done === true;
        // Night densifies forest fog
        if (ud.isForest && fl.night_done && !fl.confrontation_done) {
          fp.material.opacity = ud.baseOp * 1.8 + Math.sin(t * 0.15 + ud.phase) * 0.015;
        }
      });

      // Torch flicker
      torchLights.forEach(l => {
        l.intensity = l.userData.base + Math.sin(t * 6 + l.userData.offset) * 0.3 + Math.sin(t * 11 + l.userData.offset * 2) * 0.15;
      });
      torchFlames.forEach(f => {
        const off = f.userData.offset;
        f.position.y = f.userData.oy + Math.sin(t * 8 + off) * 0.06;
        f.position.x = f.userData.ox + Math.sin(t * 6 + off * 1.3) * 0.015;
        // Animate sub-layers independently
        const sc = 0.8 + Math.sin(t * 12 + off) * 0.3;
        f.scale.setScalar(sc);
        if (f.children[1]) f.children[1].scale.y = 1.3 + Math.sin(t * 15 + off) * 0.4;
        if (f.children[2]) f.children[2].scale.y = 1.5 + Math.sin(t * 10 + off * 0.7) * 0.5;
      });

      // Markers
      const interactions = getInteractions(fl);
      let cId = null, cLabel = "", cDist = Infinity;
      markers.forEach(m => m.visible = false);
      interactions.forEach((inter, idx) => {
        if (!inter.visible || idx >= markers.length) return;
        const m = markers[idx];
        m.visible = true;
        m.position.set(inter.pos[0], 2.5 + Math.sin(t * 2 + idx) * 0.2, inter.pos[2]);
        m.rotation.y = t * 1.5;
        m.material.opacity = 0.5 + Math.sin(t * 3 + idx * 1.1) * 0.25;
        const dx = camera.position.x - inter.pos[0], dz = camera.position.z - inter.pos[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < inter.radius && dist < cDist) { cDist = dist; cId = inter.id; cLabel = inter.label; }
      });

      // Throttled proximity events
      if (Math.floor(t * 5) !== Math.floor((t - dt) * 5)) {
        window.dispatchEvent(new CustomEvent("w-near", { detail: { id: cId, label: cLabel } }));
      }

      // Show/hide Aisling + kids + clearing motes
      const showClearing = fl.confrontation_done === true;
      if (!cin.active || (cin.active && cin.type !== "kill")) {
        aisGroup.visible = showClearing && (!cin.active || cin.type !== "bind" || t - cin.startTime < 5);
        cKids.forEach(c => c.visible = showClearing && (!cin.active || (cin.type !== "kill" && (cin.type !== "bind" || t - cin.startTime < 5))));
      }
      clearingMotes.visible = showClearing;
      if (!cin.active) {
        clearingLight.intensity = showClearing ? 2.8 : 0;
        clearingGlow.intensity = showClearing ? 1.5 : 0;
      }

      // NPC idle
      // NPC idle: gentle body sway + weight shifting
      borislav.rotation.y = Math.sin(t * 0.5) * 0.06;
      borislav.position.y = Math.sin(t * 0.8) * 0.01; // subtle breathing
      marta.rotation.y = Math.sin(t * 0.5 + 1) * 0.06;
      marta.position.y = Math.sin(t * 0.7 + 2) * 0.01;
      // Make NPCs face the player when nearby
      const bDx = camera.position.x - borislav.position.x;
      const bDz = camera.position.z - borislav.position.z;
      if (bDx * bDx + bDz * bDz < 100) borislav.rotation.y = Math.atan2(bDx, bDz);
      const mDx = camera.position.x - marta.position.x;
      const mDz = camera.position.z - marta.position.z;
      if (mDx * mDx + mDz * mDz < 100) marta.rotation.y = Math.atan2(mDx, mDz);
      aisGroup.rotation.y = Math.sin(t * 0.25) * 0.03;
      // Aisling's vein glow pulse
      if (aisGroup.visible) {
        aisGroup.children.forEach(child => {
          if (child.userData && child.userData.isVein) {
            child.material.opacity = 0.3 + Math.sin(t * 2 + child.position.x * 5) * 0.3;
          }
        });
      }

      // Lighting phases
      if (fl.night_done && !fl.confrontation_done) {
        ambient.intensity = 0.15; scene.fog.density = 0.025;
        torchLights.forEach(l => l.userData.base = 4.5);
        moonLight.intensity = 0.25;
      } else if (fl.confrontation_done && !cin.active) {
        ambient.intensity = 0.4; scene.fog.density = 0.014; moonLight.intensity = 0.6;
      }

      // ── PARTICLES ──
      // Fireflies
      const fp = ffPos;
      for (let i = 0; i < ffCount; i++) {
        ffLife[i] -= dt;
        if (ffLife[i] <= 0) {
          const a = rand() * Math.PI * 2, r = 5 + rand() * 25;
          fp[i*3] = Math.cos(a) * r; fp[i*3+1] = 0.5 + rand() * 3; fp[i*3+2] = Math.sin(a) * r;
          ffLife[i] = 3 + rand() * 5;
        }
        fp[i*3] += Math.sin(t * 0.7 + i) * dt * 0.2;
        fp[i*3+1] += Math.sin(t * 1.1 + i * 0.7) * dt * 0.15;
        fp[i*3+2] += Math.cos(t * 0.9 + i * 1.3) * dt * 0.2;
      }
      ffGeo.attributes.position.needsUpdate = true;
      fireflies.material.opacity = 0.4 + Math.sin(t * 2) * 0.3;

      // Clearing motes
      if (clearingMotes.visible) {
        for (let i = 0; i < cmCount; i++) {
          cmPos[i*3+1] += cmVel[i] * dt;
          cmPos[i*3] += Math.sin(t * 0.5 + i) * dt * 0.1;
          if (cmPos[i*3+1] > 10) {
            const a = rand() * Math.PI * 2, r = rand() * 13;
            cmPos[i*3] = Math.cos(a) * r;
            cmPos[i*3+1] = 0;
            cmPos[i*3+2] = -80 + Math.sin(a) * r;
          }
        }
        cmGeo.attributes.position.needsUpdate = true;
        clearingMotes.material.opacity = 0.4 + Math.sin(t * 1.5) * 0.2;
      }

      // Forest motes
      for (let i = 0; i < fmCount; i++) {
        fmPos[i*3] += Math.sin(t * 0.3 + i * 0.5) * dt * 0.15;
        fmPos[i*3+1] += Math.sin(t * 0.7 + i * 0.3) * dt * 0.1;
        fmPos[i*3+2] += Math.cos(t * 0.4 + i * 0.7) * dt * 0.1;
      }
      fmGeo.attributes.position.needsUpdate = true;

      // Chimney smoke
      for (let i = 0; i < smokeCount; i++) {
        smokePos[i*3+1] += smokeVel[i] * dt;
        smokePos[i*3] += Math.sin(t * 0.5 + i) * dt * 0.08;
        if (smokePos[i*3+1] > 12) {
          const cb = chimneyBuildings[i % chimneyBuildings.length];
          smokePos[i*3] = cb.x + cb.w * 0.3 + (Math.random()-0.5)*0.3;
          smokePos[i*3+1] = cb.h + cb.h * 0.55 + 1.2;
          smokePos[i*3+2] = cb.z - cb.d * 0.15 + (Math.random()-0.5)*0.3;
        }
      }
      smokeGeo.attributes.position.needsUpdate = true;

      // ── Witcher Senses ──
      const sensesOn = sensesRef.current;
      clueObjects.forEach(c => {
        if (sensesOn) {
          const pulse = 0.4 + Math.sin(t * 4 + c.position.x * 2) * 0.3;
          c.material.opacity = pulse;
          // Floating animation for scent/residue
          if (c.userData.clueType === "scent_trail" || c.userData.clueType === "magic_residue") {
            c.position.y += Math.sin(t * 2 + c.position.x) * dt * 0.15;
          }
        } else {
          c.material.opacity = 0;
        }
      });
      // Markers glow brighter in senses mode
      if (sensesOn) {
        markers.forEach(m => {
          if (m.visible) {
            m.material.color.setHex(0xff8844);
            m.material.opacity = 0.7 + Math.sin(t * 6) * 0.3;
            m.scale.setScalar(1.0 + Math.sin(t * 4) * 0.15);
          }
        });
      } else {
        markers.forEach(m => {
          if (m.visible) {
            m.material.color.setHex(0xc9a96e);
            m.scale.setScalar(1.0);
          }
        });
      }

      // ── Position-based music ──
      if (!cin.active && musicRef.current) {
        const pz = camera.position.z;
        let mood = "village";
        if (fl.night_done && !fl.confrontation_done) mood = "night";
        else if (pz < -60) mood = "clearing";
        else if (pz < -28) mood = "forest";
        if (mood !== prevMusicMood) { musicRef.current.setMood(mood); prevMusicMood = mood; }
      }

      composer.render();
    };
    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); composer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // Engine controls
    sceneRef.current.pause = () => { paused = true; };
    sceneRef.current.resume = () => { paused = false; };
    sceneRef.current.getTime = () => clock.elapsedTime;
    sceneRef.current.destroy = () => {
      cancelAnimationFrame(animId);
      document.removeEventListener("keydown", onKD);
      document.removeEventListener("keyup", onKU);
      window.removeEventListener("resize", onResize);
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };

    return () => { if (sceneRef.current.destroy) sceneRef.current.destroy(); };
  }, [gameState === "title" ? "title" : "playing"]);
  // ─── PROXIMITY LISTENER ──────────────────────────
  useEffect(() => {
    const h = (e) => { if (gameState === "playing") { setNearId(e.detail.id); setNearLabel(e.detail.label || ""); } };
    window.addEventListener("w-near", h);
    return () => window.removeEventListener("w-near", h);
  }, [gameState]);

  // ─── E KEY ───────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.code === "KeyE" && nearId && gameState === "playing") startDialogue(nearId);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [nearId, gameState]);

  // ─── Q KEY (Witcher Senses toggle) ────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.code === "KeyQ" && gameState === "playing") {
        setSensesActive(prev => {
          const next = !prev;
          sensesRef.current = next;
          if (next && musicRef.current) musicRef.current.playSFX("medallion");
          return next;
        });
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [gameState]);

  // ─── DIALOGUE ────────────────────────────────────
  const startDialogue = useCallback((id) => {
    if (!DIALOGUES[id]) return;
    if (sceneRef.current.pause) sceneRef.current.pause();
    try { document.exitPointerLock(); } catch(e){}
    // Deactivate senses on dialogue
    setSensesActive(false); sensesRef.current = false;
    // Interaction SFX
    if (musicRef.current) {
      if (id === "deep_forest" || id === "forest_edge") musicRef.current.playSFX("whisper");
      else if (id === "night") musicRef.current.playSFX("door_creak");
      else musicRef.current.playSFX("interact");
      // Scene-specific ambient backgrounds
      const ambientMap = {
        elder_hall: "fire_crackle",
        children: "child_hum",
        families: "loom_rhythm",
        forest_edge: "wind_gust",
        night: "wind_gust",
        confrontation: "well_water",
        deep_forest: "whisper",
      };
      if (ambientMap[id]) {
        // Play ambient with slight delay so it layers after the initial SFX
        setTimeout(() => { if (musicRef.current) musicRef.current.playSFX(ambientMap[id]); }, 800);
      }
    }
    setDialogueId(id); setDialogueIndex(0); setGameState("dialogue");
  }, []);

  const advanceDialogue = useCallback(() => {
    const lines = DIALOGUES[dialogueId];
    if (!lines) return;
    if (dialogueIndex < lines.length - 1) {
      setDialogueIndex(i => i + 1);
    } else {
      const nf = { ...flags };
      if (dialogueId === "elder_hall") nf.met_elder = true;
      if (dialogueId === "children") nf.visited_children = true;
      if (dialogueId === "forest_edge") nf.visited_forest = true;
      if (dialogueId === "families") nf.visited_families = true;
      if (dialogueId === "night") nf.night_done = true;
      if (dialogueId === "confrontation") nf.confrontation_done = true;
      if (dialogueId === "deep_forest") {
        nf.forest_done = true; setFlags(nf);
        setDialogueId(null); setGameState("choice"); return;
      }
      setFlags(nf); setDialogueId(null); setGameState("playing");
      if (sceneRef.current.resume) sceneRef.current.resume();

      if (dialogueId === "elder_hall") setHint("Investigate the village. Look for the golden markers.");
      else if (nf.met_elder && !nf.night_done && (nf.visited_children || nf.visited_forest || nf.visited_families))
        setHint("Return to the Blacksmith's Loft to rest.");
      else if (nf.night_done && !nf.confrontation_done) setHint("Find Borislav at the well.");
      else if (nf.confrontation_done) setHint("Follow the path north into the forest.");
      else setHint("");
    }
  }, [dialogueId, dialogueIndex, flags]);

  // ─── CHOICE → CINEMATIC ──────────────────────────
  const handleChoice = useCallback((choice) => {
    const type = choice.ending;
    setEnding(type);
    setEndingLinesShown(0);
    setShowEndRestart(false);
    setGameState("cinematic");

    if (sceneRef.current.pause) sceneRef.current.pause();
    if (musicRef.current) {
      musicRef.current.setMood(type, 4);
      // SFX for the chosen ending
      if (type === "kill") musicRef.current.playSFX("sword_draw");
      else if (type === "free") musicRef.current.playSFX("yrden");
      else if (type === "bind") musicRef.current.playSFX("magic_burst");
      else musicRef.current.playSFX("whisper");
    }

    // Start cinematic (use the Three.js clock elapsed time)
    const cineStart = sceneRef.current.getTime ? sceneRef.current.getTime() : 0;
    cineRef.current = { active: true, type, startTime: cineStart };

    // Overlay effects
    if (type === "kill") {
      setOverlay({ color: "rgba(220,220,255,0.9)", opacity: 1 });
      schedule(() => setOverlay({ color: "rgba(220,220,255,0)", opacity: 0 }), 600);
      schedule(() => setOverlay({ color: "rgba(0,0,10,0.4)", opacity: 1 }), 3000);
      schedule(() => setOverlay({ color: "rgba(0,0,10,0.6)", opacity: 1 }), 6000);
    } else if (type === "free") {
      schedule(() => setOverlay({ color: "rgba(80,40,160,0.15)", opacity: 1 }), 500);
      schedule(() => setOverlay({ color: "rgba(80,40,160,0.3)", opacity: 1 }), 3000);
      schedule(() => setOverlay({ color: "rgba(40,30,60,0.4)", opacity: 1 }), 7000);
    } else if (type === "bind") {
      schedule(() => setOverlay({ color: "rgba(20,60,10,0.15)", opacity: 1 }), 1000);
      schedule(() => setOverlay({ color: "rgba(20,80,10,0.35)", opacity: 1 }), 3000);
      schedule(() => setOverlay({ color: "rgba(15,60,10,0.55)", opacity: 1 }), 6000);
    } else if (type === "confront") {
      schedule(() => setOverlay({ color: "rgba(10,5,0,0.3)", opacity: 1 }), 2000);
      schedule(() => setOverlay({ color: "rgba(10,5,0,0.5)", opacity: 1 }), 5000);
    }

    // Reveal text lines with timing
    const lines = ENDINGS[type].lines;
    const textStart = type === "kill" ? 5000 : type === "bind" ? 6000 : type === "free" ? 5000 : 4000;
    const textInterval = 3000;
    lines.forEach((_, i) => {
      schedule(() => setEndingLinesShown(i + 1), textStart + i * textInterval);
    });
    schedule(() => setShowEndRestart(true), textStart + lines.length * textInterval + 2500);
  }, [schedule]);

  // ─── RESTART ─────────────────────────────────────
  const handleRestart = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cineRef.current = { active: false };
    if (sceneRef.current.destroy) sceneRef.current.destroy();
    if (musicRef.current) musicRef.current.stop();
    musicRef.current = null;
    setGameState("title"); setFlags({}); setDialogueId(null); setDialogueIndex(0);
    setNearId(null); setEnding(null); setEndingLinesShown(0); setShowEndRestart(false);
    setHint(""); setOverlay({ color: "transparent", opacity: 0 }); setMusicStarted(false);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => { return () => timersRef.current.forEach(clearTimeout); }, []);

  // ─── STYLES ──────────────────────────────────────
  const panelStyle = {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
    background: "linear-gradient(transparent, rgba(8,7,6,0.96) 25%)",
    padding: "5rem 1.5rem 2rem",
  };
  const choiceBtnStyle = {
    display: "block", width: "100%", maxWidth: 560, margin: "0 auto 0.6rem",
    textAlign: "left", fontFamily: "Georgia, serif", fontSize: "clamp(0.9rem,2vw,1.05rem)",
    color: UI.accent, background: "rgba(20,17,14,0.92)", border: `1px solid ${UI.border}`,
    padding: "0.85rem 1.2rem", cursor: "pointer", transition: "all 0.25s", borderRadius: "2px",
  };

  // ─── RENDER: TITLE ───────────────────────────────
  if (gameState === "title") {
    return (
      <div style={{
        width: "100%", height: "100vh", background: UI.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, serif",
      }}>
        <style>{`
          @keyframes titleIn { from { opacity:0; letter-spacing:0.5em } to { opacity:1; letter-spacing:0.3em } }
          @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        `}</style>
        <h1 style={{
          fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: "normal", color: UI.accent,
          letterSpacing: "0.3em", textTransform: "uppercase", animation: "titleIn 2s ease-out",
        }}>The Witcher</h1>
        <div style={{ width: 40, height: 1, background: UI.accentDim, margin: "1rem 0", opacity: 0.5 }} />
        <h2 style={{
          fontSize: "clamp(1.2rem,3vw,1.8rem)", fontWeight: "normal", fontStyle: "italic",
          color: UI.textDim, letterSpacing: "0.15em", opacity: 0, animation: "fadeIn 1.5s ease-out 0.5s forwards",
        }}>Marzena</h2>
        <p style={{
          fontSize: "clamp(0.85rem,1.8vw,1rem)", fontStyle: "italic", color: UI.textDim,
          textAlign: "center", maxWidth: 420, lineHeight: 1.8, marginTop: "2.5rem",
          opacity: 0, animation: "fadeIn 1.5s ease-out 1.2s forwards",
        }}>
          "There are worse things in the world than monsters.<br />Monsters, at least, are honest about what they are."
        </p>
        <button
          onClick={() => { startMusic(); setGameState("playing"); }}
          style={{
            marginTop: "2.5rem", fontFamily: "system-ui,sans-serif", fontSize: "0.8rem",
            color: UI.accent, background: "transparent", border: `1px solid ${UI.accentDim}`,
            padding: "0.7rem 2.5rem", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer",
            opacity: 0, animation: "fadeIn 1s ease-out 2s forwards",
          }}
        >Begin</button>
        <div style={{
          position: "absolute", bottom: "2rem", textAlign: "center",
          fontFamily: "system-ui,sans-serif", fontSize: "0.6rem", color: UI.textDim, opacity: 0.4, lineHeight: 1.8,
        }}>
          WASD move | Mouse look | E interact | Q senses
        </div>
      </div>
    );
  }

  // ─── RENDER: GAME / DIALOGUE / CHOICE / CINEMATIC ──
  const endData = ending ? ENDINGS[ending] : null;

  return (
    <div ref={mountRef} style={{
      width: "100%", height: "100vh", position: "relative", background: "#000",
      fontFamily: "Georgia, serif", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes yrdenPulse { 0%,100% { box-shadow: 0 0 20px rgba(120,60,200,0.3) } 50% { box-shadow: 0 0 40px rgba(120,60,200,0.6) } }
        @keyframes sensesPulse { 0%,100% { opacity: 0.7 } 50% { opacity: 1 } }
      `}</style>

      {/* Color overlay (cinematic tints, flashes) */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none",
        background: overlay.color, opacity: overlay.opacity,
        transition: "background 1.5s ease, opacity 1.5s ease",
      }} />

      {/* Crosshair */}
      {(gameState === "playing") && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10, pointerEvents: "none" }}>
          <div style={{ width: 2, height: 14, background: "rgba(200,180,140,0.25)", margin: "0 auto 3px" }} />
          <div style={{ display: "flex", justifyContent: "center", gap: 3 }}>
            <div style={{ width: 14, height: 2, background: "rgba(200,180,140,0.25)" }} />
            <div style={{ width: 14, height: 2, background: "rgba(200,180,140,0.25)" }} />
          </div>
          <div style={{ width: 2, height: 14, background: "rgba(200,180,140,0.25)", margin: "3px auto 0" }} />
        </div>
      )}

      {/* HUD top-left */}
      {(gameState === "playing" || gameState === "dialogue") && (
        <div style={{ position: "absolute", top: "1rem", left: "1.5rem", zIndex: 10, pointerEvents: "none" }}>
          <div style={{ fontFamily: "system-ui,sans-serif", fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: UI.accentDim }}>
            Marzena {flags.night_done && !flags.confrontation_done ? "- Night" : flags.confrontation_done ? "- Dawn" : "- Evening"}
          </div>
          {hint && <div style={{ fontFamily: "system-ui,sans-serif", fontSize: "0.6rem", color: UI.textDim, marginTop: "0.3rem", opacity: 0.5, fontStyle: "italic" }}>{hint}</div>}
        </div>
      )}

      {/* Volume toggle */}
      {gameState !== "title" && musicStarted && (
        <button onClick={() => {
          setMuted(!muted);
          if (musicRef.current) musicRef.current.setVolume(muted ? 0.09 : 0);
        }} style={{
          position: "absolute", top: "1rem", right: "1.5rem", zIndex: 15,
          fontFamily: "system-ui,sans-serif", fontSize: "0.55rem", color: UI.textDim,
          background: "rgba(10,9,8,0.5)", border: `1px solid ${UI.border}`,
          padding: "0.3rem 0.6rem", cursor: "pointer",
        }}>{muted ? "Sound Off" : "Sound On"}</button>
      )}

      {/* Controls hint */}
      {gameState === "playing" && (
        <div style={{
          position: "absolute", bottom: "1rem", right: "1.5rem", zIndex: 10, pointerEvents: "none",
          fontFamily: "system-ui,sans-serif", fontSize: "0.5rem", color: UI.textDim, opacity: 0.3,
        }}>WASD move | Mouse look | E interact | Q senses</div>
      )}

      {/* Interaction prompt */}
      {gameState === "playing" && nearId && (
        <div style={{
          position: "absolute", bottom: "3.5rem", left: "50%", transform: "translateX(-50%)",
          zIndex: 15, pointerEvents: "none",
        }}>
          <div style={{
            background: "rgba(10,9,8,0.88)", border: `1px solid ${UI.accentDim}`,
            padding: "0.6rem 1.5rem", fontFamily: "system-ui,sans-serif", fontSize: "0.75rem", color: UI.accent,
          }}>
            <span style={{ opacity: 0.5 }}>E</span> &nbsp; {nearLabel}
          </div>
        </div>
      )}

      {/* Dialogue overlay */}
      {gameState === "dialogue" && dialogueId && DIALOGUES[dialogueId] && (
        <div style={panelStyle} onClick={advanceDialogue}>
          <div style={{ maxWidth: 580, margin: "0 auto", cursor: "pointer" }}>
            {DIALOGUES[dialogueId][dialogueIndex].speaker && (
              <div style={{
                fontFamily: "system-ui,sans-serif", fontSize: "0.65rem", letterSpacing: "0.15em",
                textTransform: "uppercase", color: UI.accent, marginBottom: "0.5rem",
              }}>{DIALOGUES[dialogueId][dialogueIndex].speaker}</div>
            )}
            <p style={{
              fontSize: "clamp(1rem,2.5vw,1.15rem)", lineHeight: 1.8,
              color: DIALOGUES[dialogueId][dialogueIndex].speaker ? UI.text : UI.textDim,
            }}>{DIALOGUES[dialogueId][dialogueIndex].text}</p>
            <div style={{
              fontFamily: "system-ui,sans-serif", fontSize: "0.55rem", color: UI.textDim,
              marginTop: "1rem", opacity: 0.35, textAlign: "center",
            }}>
              {dialogueIndex < DIALOGUES[dialogueId].length - 1 ? "Click to continue" : "Click to close"}
              &nbsp;({dialogueIndex + 1}/{DIALOGUES[dialogueId].length})
            </div>
          </div>
        </div>
      )}

      {/* Choice overlay */}
      {gameState === "choice" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "rgba(8,7,6,0.85)", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "2rem",
        }}>
          <p style={{
            fontSize: "clamp(0.95rem,2.2vw,1.1rem)", color: UI.textDim, textAlign: "center",
            maxWidth: 500, marginBottom: "2rem", lineHeight: 1.8, fontStyle: "italic",
            animation: "fadeIn 1s ease-out",
          }}>
            She watches you with those human eyes. Waiting. The children play in impossible spring.
            You see the paths before you. None of them are clean.
          </p>
          {CHOICES.map((c, i) => (
            <button key={i} onClick={() => handleChoice(c)} style={{
              ...choiceBtnStyle,
              animation: `fadeUp 0.5s ease-out ${0.3 + i * 0.15}s backwards`,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(28,24,18,0.95)"; e.currentTarget.style.borderColor = UI.accentDim; e.currentTarget.style.paddingLeft = "1.5rem"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(20,17,14,0.92)"; e.currentTarget.style.borderColor = UI.border; e.currentTarget.style.paddingLeft = "1.2rem"; }}
            >
              {c.text}
              <span style={{ display: "block", fontFamily: "system-ui,sans-serif", fontSize: "0.68rem", color: UI.textDim, marginTop: "0.3rem" }}>{c.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Cinematic ending overlay (text over 3D) */}
      {gameState === "cinematic" && endData && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 15,
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          pointerEvents: endingLinesShown > 0 ? "auto" : "none",
          background: endingLinesShown > 0 ? "linear-gradient(transparent 20%, rgba(6,5,4,0.88) 50%)" : "transparent",
          transition: "background 2s ease",
          padding: "2rem 1.5rem 2.5rem", overflowY: "auto",
        }}>
          <div style={{ maxWidth: 580, margin: "0 auto", width: "100%" }}>
            {endingLinesShown > 0 && (
              <div style={{
                textAlign: "center", marginBottom: "1.5rem",
                animation: "fadeIn 1.5s ease-out",
              }}>
                <div style={{
                  fontFamily: "system-ui,sans-serif", fontSize: "0.55rem",
                  letterSpacing: "0.25em", textTransform: "uppercase", color: UI.accentDim, marginBottom: "0.5rem",
                }}>Epilogue</div>
                <h2 style={{
                  fontSize: "clamp(1.3rem,3.5vw,1.8rem)", fontWeight: "normal",
                  color: UI.accent, fontStyle: "italic",
                }}>{endData.title}</h2>
              </div>
            )}
            {endData.lines.slice(0, endingLinesShown).map((line, i) => (
              <p key={i} style={{
                fontSize: "clamp(0.95rem,2.3vw,1.1rem)", color: UI.text,
                marginBottom: "1rem", lineHeight: 1.8,
                animation: "fadeUp 1s ease-out",
              }}>{line}</p>
            ))}
            {showEndRestart && (
              <div style={{ textAlign: "center", marginTop: "2rem", animation: "fadeIn 1s ease-out" }}>
                <div style={{ width: 30, height: 1, background: UI.accentDim, margin: "1.5rem auto", opacity: 0.3 }} />
                <button onClick={handleRestart} style={{
                  fontFamily: "system-ui,sans-serif", fontSize: "0.75rem", color: UI.accent,
                  background: "transparent", border: `1px solid ${UI.accentDim}`,
                  padding: "0.6rem 2rem", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer",
                }}>Begin Again</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Witcher Senses overlay */}
      {sensesActive && gameState === "playing" && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5,
          background: "radial-gradient(ellipse at center, rgba(255,100,20,0.04) 0%, rgba(255,80,10,0.12) 70%, rgba(200,60,0,0.25) 100%)",
          animation: "sensesPulse 2s ease-in-out infinite",
        }} />
      )}

      {/* Witcher Senses HUD indicator */}
      {sensesActive && gameState === "playing" && (
        <div style={{
          position: "absolute", top: "1rem", left: "50%", transform: "translateX(-50%)",
          zIndex: 12, pointerEvents: "none",
          fontFamily: "system-ui,sans-serif", fontSize: "0.55rem", letterSpacing: "0.25em",
          textTransform: "uppercase", color: "#ff8844", opacity: 0.7,
          animation: "fadeIn 0.3s ease-out",
        }}>Witcher Senses</div>
      )}

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4,
        background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%)",
      }} />
    </div>
  );
}