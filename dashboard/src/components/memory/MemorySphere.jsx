import { useRef, useEffect } from "react";
import * as THREE from "three";
import { FOLDER_META, nodeColor } from "@/lib/memory";

// ─────────────────────────────────────────────────────────────────────────────
// MemorySphere — the *live* vault graph (~3,500 notes) on a dot-matrix globe.
//
// PERFORMANCE: 3,500 nodes is far too many for individual sprites/meshes, so the
// graph nodes are rendered as ONE GPU points layer (same Fibonacci dot-matrix
// technique the surface already used), coloured per-project. The sparse ~325
// edges keep their slerp arc tubes. Individual glowing sprites are reserved ONLY
// for the selected node + its 1-hop neighbours + a handful of highest-degree
// hubs (a small, bounded pool that we reposition on demand) — never 3,500.
//
// Notes are positioned by project cluster so the graph reads as project regions.
// Drag to spin; click a node to select. `query` dims non-matching nodes;
// `matchIds` (from Brain search) highlights/zooms hits; `selectedId` emphasises a
// note + its neighbours and lights their arcs.
// ─────────────────────────────────────────────────────────────────────────────

const BG = 0x080a14;
const RADIUS = 2.5;
const MAX_HUB_SPRITES = 24; // bounded glow-sprite pool (selection + neighbours + hubs)

// Per-brain accent. The vault renders in its native per-project palette; the
// Cognee ("second brain") graph reuses this SAME renderer but is tinted toward a
// teal accent so the two brains read as visually distinct without a fork. The
// atmosphere rim follows suit. Node hues keep their per-cluster variety (lerp,
// not replace) so cognee clusters stay distinguishable from one another.
const COGNEE_ACCENT = 0x22d3ee; // teal/cyan — vs the vault's violet/blue families
const VAULT_ATMO = 0x4f74ff;
const COGNEE_ATMO = 0x22d3ee;

// soft round sprite (white; tinted per-sprite)
function makeDotTexture(soft) {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  if (soft) {
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.55)");
    g.addColorStop(0.5, "rgba(255,255,255,0.14)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.6)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Great-circle (slerp) arc that bows outward over the globe — always rides on/
// above the surface, so it never dips behind the sphere randomly.
function arcCurve(a, b, bulge, seg = 48) {
  const da = a.clone().normalize();
  const db = b.clone().normalize();
  const dot = THREE.MathUtils.clamp(da.dot(db), -1, 1);
  const omega = Math.acos(dot);
  const sinO = Math.sin(omega);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    let dir;
    if (omega < 1e-4) {
      dir = da.clone();
    } else {
      const s1 = Math.sin((1 - t) * omega) / sinO;
      const s2 = Math.sin(t * omega) / sinO;
      dir = da.clone().multiplyScalar(s1).addScaledVector(db, s2).normalize();
    }
    const lift = 1 + bulge * Math.sin(Math.PI * t);
    pts.push(dir.multiplyScalar(RADIUS * lift));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// dot-matrix surface — evenly spread via a Fibonacci sphere (no pole pinching).
function buildDotGrid() {
  const N = 2600;
  const phi = Math.PI * (3 - Math.sqrt(5));
  const pos = [], col = [];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pos.push(Math.cos(theta) * r * RADIUS, y * RADIUS, Math.sin(theta) * r * RADIUS);
    const b = 0.5 + Math.random() * 0.5;
    c.setRGB(0.3 * b, 0.52 * b, 0.86 * b);
    col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// ── Project-clustered placement ─────────────────────────────────────────────
// Each project gets a "cluster centre" spread evenly over the globe (Fibonacci),
// and its notes are scattered in a small cap around that centre so the graph
// reads as project regions. Notes without a project fall onto a generic ring.
function clusterPositions(nodes) {
  const projects = [...new Set(nodes.map((n) => n.project).filter(Boolean))];
  const phi = Math.PI * (3 - Math.sqrt(5));
  const centres = new Map();
  const total = Math.max(projects.length, 1);
  projects.forEach((p, i) => {
    const y = 1 - (i / Math.max(total - 1, 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    centres.set(p, new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize());
  });
  // a "no project" pseudo-centre at the south so unclustered notes don't pile up
  const fallback = new THREE.Vector3(0, -1, 0);

  // deterministic per-id jitter so positions are stable across reloads
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  };

  const positions = nodes.map((n) => {
    const centre = (n.project && centres.get(n.project)) || fallback;
    // small random cap around the cluster centre (spread grows slightly with
    // cluster size so big projects don't overlap into a single dot)
    const u = hash(n.id + ":u");
    const v = hash(n.id + ":v");
    const cap = 0.42; // angular radius of a cluster (radians)
    const angle = Math.acos(1 - u * (1 - Math.cos(cap)));
    const az = v * Math.PI * 2;
    // build a basis around the centre direction
    const dir = centre.clone();
    const tangent = new THREE.Vector3(0, 1, 0).cross(dir);
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    tangent.normalize();
    const bitangent = dir.clone().cross(tangent).normalize();
    const offset = tangent
      .clone()
      .multiplyScalar(Math.sin(angle) * Math.cos(az))
      .addScaledVector(bitangent, Math.sin(angle) * Math.sin(az));
    const p = dir.clone().multiplyScalar(Math.cos(angle)).add(offset).normalize();
    return p.multiplyScalar(RADIUS);
  });
  return positions;
}

export default function MemorySphere({
  nodes = [],
  links = [],
  softLinks = [],
  showSoftEdges = true,
  query = "",
  matchIds = null,
  selectedId = null,
  neighborIds = null,
  onSelect,
  // "vault" (default) | "cognee" — selects the accent palette only; the geometry,
  // layout, and interaction are identical across brains (reuse, not fork).
  variant = "vault",
}) {
  const mountRef = useRef(null);
  const tipRef = useRef(null);
  const propsRef = useRef({ query, matchIds, selectedId, neighborIds, showSoftEdges, onSelect });
  propsRef.current = { query, matchIds, selectedId, neighborIds, showSoftEdges, onSelect };
  const applyRef = useRef(() => {});
  // Rebuild the scene whenever the graph identity changes (count is a cheap proxy
  // that also covers the empty→loaded transition). softLinks count is included so
  // a late-arriving soft layer triggers a rebuild.
  const graphKey = `${variant}:${nodes.length}:${links.length}:${softLinks.length}`;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || nodes.length === 0) return;
    let W = mount.clientWidth || 600;
    let H = mount.clientHeight || 600;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Arc geometry scales with graph size so a 3.5K-node globe stays readable.
    const arcBulge = THREE.MathUtils.clamp(1.2 / Math.sqrt(nodes.length), 0.16, 0.42);
    const arcRadius = THREE.MathUtils.clamp(0.026 / Math.sqrt(nodes.length), 0.0035, 0.01);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.05);
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
    camera.position.z = 8.8;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x223055, 1));
    const key = new THREE.DirectionalLight(0x9ab4ff, 1.4);
    key.position.set(-3, 4, 5);
    scene.add(key);

    const group = new THREE.Group();
    scene.add(group);

    // ── derived graph data ────────────────────────────────────────────────────
    const indexById = new Map(nodes.map((n, i) => [n.id, i]));
    const positions = clusterPositions(nodes);
    // Cognee brain: pull every cluster hue toward the teal accent so the graph
    // reads as a different brain, while keeping per-cluster variety (lerp, not
    // overwrite). Vault keeps its native palette.
    const cogneeAccent = new THREE.Color(COGNEE_ACCENT);
    const colors = nodes.map((n) => {
      const c = new THREE.Color(nodeColor(n));
      return variant === "cognee" ? c.lerp(cogneeAccent, 0.55) : c;
    });
    const surfacePos = positions.map((p) => p.clone().multiplyScalar(1.012));

    // adjacency for neighbour lighting (used when the parent doesn't supply it)
    const adj = new Map();
    for (const l of links) {
      if (!adj.has(l.source)) adj.set(l.source, new Set());
      if (!adj.has(l.target)) adj.set(l.target, new Set());
      adj.get(l.source).add(l.target);
      adj.get(l.target).add(l.source);
    }
    const neighborsOf = (id) => (adj.get(id) ? [...adj.get(id)] : []);

    // highest-degree hubs always get a glow sprite for a sense of "centres"
    const hubIds = [...nodes]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 8)
      .map((n) => n.id);

    const softTex = makeDotTexture(true);
    const white = new THREE.Color(0xffffff);

    // ── starfield ───────────────────────────────────────────────────────────
    const starCount = 320;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 8 + Math.random() * 6, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      sp[i * 3 + 2] = r * Math.cos(ph);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.03, transparent: true, opacity: 0.28, depthWrite: false }));
    scene.add(stars);

    // ── SOLID globe — opaque shaded fill (occludes the far side) ────────────
    const fillGeo = new THREE.SphereGeometry(RADIUS * 0.985, 64, 48);
    const fillMat = new THREE.MeshLambertMaterial({ color: 0x0a1c3e, emissive: 0x05101f });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    group.add(fill);

    // ── dot-matrix surface ──────────────────────────────────────────────────
    const dotGeo = buildDotGrid();
    const dotTex = makeDotTexture(false);
    const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({
      map: dotTex, size: 0.05, vertexColors: true, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.25,
    }));
    group.add(dots);

    // ── atmosphere rim ────────────────────────────────────────────────────────
    const atmoGeo = new THREE.SphereGeometry(RADIUS * 1.035, 48, 48);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(variant === "cognee" ? COGNEE_ATMO : VAULT_ATMO) } },
      vertexShader: `varying vec3 vN; varying vec3 vW;
        void main(){ vN=normalize(normalMatrix*normal); vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 V=normalize(cameraPosition-vW); float f=pow(1.0-abs(dot(normalize(vN),V)),3.0); gl_FragColor=vec4(uColor, f*0.5); }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });
    group.add(new THREE.Mesh(atmoGeo, atmoMat));

    // ── NODES as ONE GPU points layer (per-project colour) ──────────────────
    // This is the core perf decision: all ~3,500 notes live in a single
    // BufferGeometry rendered by one PointsMaterial. We mutate per-vertex colour
    // (dim/lit) in place instead of touching 3,500 objects.
    const nodePos = new Float32Array(nodes.length * 3);
    const nodeCol = new Float32Array(nodes.length * 3);
    const nodeBaseCol = new Float32Array(nodes.length * 3); // lit colour, immutable
    for (let i = 0; i < nodes.length; i++) {
      const s = surfacePos[i];
      nodePos[i * 3] = s.x; nodePos[i * 3 + 1] = s.y; nodePos[i * 3 + 2] = s.z;
      const c = colors[i].clone().lerp(white, 0.25);
      nodeCol[i * 3] = c.r; nodeCol[i * 3 + 1] = c.g; nodeCol[i * 3 + 2] = c.b;
      nodeBaseCol[i * 3] = c.r; nodeBaseCol[i * 3 + 1] = c.g; nodeBaseCol[i * 3 + 2] = c.b;
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    nodeGeo.setAttribute("color", new THREE.BufferAttribute(nodeCol, 3));
    const nodeColAttr = nodeGeo.getAttribute("color");
    const nodeTex = makeDotTexture(false);
    const nodePoints = new THREE.Points(nodeGeo, new THREE.PointsMaterial({
      map: nodeTex, size: 0.08, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.2,
    }));
    group.add(nodePoints);

    // ── soft links — ambient "related" web (shared tag/folder) ──────────────
    // A SECONDARY layer beneath the bright wiki arcs: one THREE.LineSegments
    // object (single draw call) for all ≤600 soft edges, thin and low-opacity so
    // it reads as "related", clearly recessive vs the real [[link]] arcs. Built
    // first so it sits under them; soft edges never drive node size or the
    // primary neighbour highlight — they're context only.
    const SOFT_BULGE = arcBulge * 0.45; // hug the surface, below the wiki arcs
    const softSeg = 16;
    let softLines = null;
    if (softLinks.length > 0) {
      const segPos = [];
      for (const sl of softLinks) {
        const si = indexById.get(sl.source), ti = indexById.get(sl.target);
        if (si == null || ti == null) continue;
        const curve = arcCurve(positions[si], positions[ti], SOFT_BULGE, softSeg);
        const pts = curve.getPoints(softSeg);
        // expand the polyline into line *segments* (pairs of consecutive points)
        for (let k = 0; k < pts.length - 1; k++) {
          segPos.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
        }
      }
      if (segPos.length > 0) {
        const softGeo = new THREE.BufferGeometry();
        softGeo.setAttribute("position", new THREE.Float32BufferAttribute(segPos, 3));
        const softMat = new THREE.LineBasicMaterial({
          color: 0x6b7280, // muted neutral slate — distinct from the coloured wiki arcs
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
          fog: true,
        });
        softLines = new THREE.LineSegments(softGeo, softMat);
        softLines.visible = propsRef.current.showSoftEdges;
        group.add(softLines);
      }
    }

    // ── links — thin slerp arcs (sparse, so real tubes are fine) ────────────
    const tubeObjs = links.map((l) => {
      const si = indexById.get(l.source), ti = indexById.get(l.target);
      if (si == null || ti == null) return null;
      const geo = new THREE.TubeGeometry(arcCurve(positions[si], positions[ti], arcBulge), 56, arcRadius, 8, false);
      const base = colors[si].clone().lerp(colors[ti], 0.5).lerp(white, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return { mesh, link: l, base };
    }).filter(Boolean);

    // ── bounded glow-sprite pool (selection + neighbours + hubs) ────────────
    // A small fixed pool of sprites we reposition on demand. NEVER one-per-node.
    const sprites = [];
    for (let i = 0; i < MAX_HUB_SPRITES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: white, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      group.add(s);
      sprites.push(s);
    }
    // a single small "core" sprite-bright marker for the selected node
    const focusCore = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: white, transparent: true, opacity: 0 }),
    );
    focusCore.visible = false;
    group.add(focusCore);

    // ── highlight / state application ───────────────────────────────────────
    const matchTrue = (id, qq, matchSet) => {
      if (matchSet) return matchSet.has(id);
      if (!qq) return true;
      const n = nodes[indexById.get(id)];
      return (
        n.title.toLowerCase().includes(qq) ||
        n.tags.some((t) => t.toLowerCase().includes(qq)) ||
        (n.project && n.project.toLowerCase().includes(qq)) ||
        n.folder.toLowerCase().includes(qq)
      );
    };

    const dim = new THREE.Color();
    applyRef.current = () => {
      const { query: q, matchIds: mIds, selectedId: sel, neighborIds: nIds, showSoftEdges: showSoft } = propsRef.current;
      const qq = (q || "").trim().toLowerCase();
      const matchSet = mIds ? new Set(mIds) : null;

      // soft layer is ambient context: toggled wholesale, and also hidden while a
      // search/selection is narrowing focus so it never competes with the result.
      if (softLines) softLines.visible = showSoft && !matchSet && !sel;
      const neighborSet = sel
        ? new Set([sel, ...(nIds ?? neighborsOf(sel))])
        : null;

      // recolour the points layer in place: lit = base colour, else dimmed.
      const litSet = new Set();
      for (let i = 0; i < nodes.length; i++) {
        const id = nodes[i].id;
        const matched = matchTrue(id, qq, matchSet);
        const inSel = !neighborSet || neighborSet.has(id);
        const lit = matched && inSel;
        if (lit) litSet.add(id);
        if (lit) {
          nodeColAttr.array[i * 3] = nodeBaseCol[i * 3];
          nodeColAttr.array[i * 3 + 1] = nodeBaseCol[i * 3 + 1];
          nodeColAttr.array[i * 3 + 2] = nodeBaseCol[i * 3 + 2];
        } else {
          dim.setRGB(nodeBaseCol[i * 3], nodeBaseCol[i * 3 + 1], nodeBaseCol[i * 3 + 2]).multiplyScalar(0.18);
          nodeColAttr.array[i * 3] = dim.r;
          nodeColAttr.array[i * 3 + 1] = dim.g;
          nodeColAttr.array[i * 3 + 2] = dim.b;
        }
      }
      nodeColAttr.needsUpdate = true;
      // when something is highlighted, brighten the whole points layer a touch
      nodePoints.material.opacity = matchSet || neighborSet ? 1 : 0.95;

      // links: shown only when both endpoints are lit.
      tubeObjs.forEach(({ mesh, link, base }) => {
        const bothLit = litSet.has(link.source) && litSet.has(link.target);
        mesh.visible = bothLit;
        if (!bothLit) return;
        const connected = sel && (link.source === sel || link.target === sel);
        mesh.material.opacity = connected ? 0.95 : 0.5;
        mesh.material.color.copy(connected ? base.clone().lerp(white, 0.35) : base);
      });

      // glow sprites: selected + neighbours + hubs (capped). Build the id list,
      // then assign pool slots; spare sprites are hidden.
      const glowIds = [];
      const seen = new Set();
      const push = (id) => {
        if (id == null || seen.has(id) || indexById.get(id) == null) return;
        if (matchSet && !matchSet.has(id) && id !== sel) return; // respect search dim
        seen.add(id);
        glowIds.push(id);
      };
      if (sel) {
        push(sel);
        neighborsOf(sel).forEach(push);
      }
      hubIds.forEach(push);

      sprites.forEach((sprite, i) => {
        const id = glowIds[i];
        if (id == null) { sprite.visible = false; sprite.material.opacity = 0; return; }
        const idx = indexById.get(id);
        sprite.position.copy(surfacePos[idx]);
        const focus = id === sel;
        const r = 0.05 + nodes[idx].degree * 0.0085;
        sprite.material.color.copy(colors[idx]);
        sprite.material.opacity = focus ? 0.6 : 0.34;
        sprite.scale.setScalar(r * (focus ? 7 : 6));
        sprite.visible = true;
      });

      // bright core on the selected node
      if (sel && indexById.get(sel) != null) {
        const idx = indexById.get(sel);
        focusCore.position.copy(surfacePos[idx]);
        focusCore.material.color.copy(colors[idx].clone().lerp(white, 0.5));
        focusCore.material.opacity = 1;
        focusCore.scale.setScalar((0.05 + nodes[idx].degree * 0.0085) * 1.6);
        focusCore.visible = true;
      } else {
        focusCore.visible = false;
        focusCore.material.opacity = 0;
      }
    };
    applyRef.current();

    // ── interaction ─────────────────────────────────────────────────────────
    // Picking against a 3,500-point cloud: raycaster Points threshold finds the
    // nearest point, then we reject it if the solid globe is closer (back side).
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.06 };
    const ndc = new THREE.Vector2();
    let hovered = null, dragging = false, moved = false, last = { x: 0, y: 0 };
    let velY = reduce ? 0 : 0.0012;
    const tmp = new THREE.Vector3();

    const setTip = (id) => {
      const tip = tipRef.current;
      if (!tip) return;
      if (id == null || indexById.get(id) == null) { tip.style.opacity = "0"; return; }
      const idx = indexById.get(id);
      tmp.copy(surfacePos[idx]);
      group.localToWorld(tmp);
      tmp.project(camera);
      if (tmp.z > 1) { tip.style.opacity = "0"; return; }
      tip.style.transform = `translate(-50%, -150%) translate(${(tmp.x * 0.5 + 0.5) * W}px, ${(-tmp.y * 0.5 + 0.5) * H}px)`;
      tip.style.opacity = "1";
      tip.textContent = nodes[idx].title;
    };

    const pickNode = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const ptHits = raycaster.intersectObject(nodePoints, false);
      if (!ptHits.length) return null;
      const pt = ptHits[0];
      // reject if the opaque globe is in front of the picked point
      const globeHit = raycaster.intersectObject(fill, false)[0];
      if (globeHit && globeHit.distance < pt.distance - 0.02) return null;
      return nodes[pt.index]?.id ?? null;
    };

    const onMove = (e) => {
      if (dragging) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        group.rotation.y += dx * 0.005;
        group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + dy * 0.005, -1.1, 1.1);
        velY = dx * 0.005;
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      hovered = pickNode(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    };
    const onDown = (e) => { dragging = true; moved = false; last = { x: e.clientX, y: e.clientY }; renderer.domElement.style.cursor = "grabbing"; };
    const onUp = () => { if (dragging && !moved) propsRef.current.onSelect?.(hovered ?? null); dragging = false; renderer.domElement.style.cursor = hovered ? "pointer" : "grab"; };

    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.style.cursor = "grab";

    let raf;
    const idle = reduce ? 0 : 0.0012;
    const tick = () => {
      if (!dragging) { group.rotation.y += velY; velY += (idle - velY) * 0.02; }
      stars.rotation.y += 0.0003;
      setTip(propsRef.current.selectedId ?? hovered);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => { W = mount.clientWidth; H = mount.clientHeight; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.dispose();
      starGeo.dispose(); softTex.dispose(); dotTex.dispose(); nodeTex.dispose();
      fillGeo.dispose(); fillMat.dispose(); dotGeo.dispose(); dots.material.dispose();
      atmoGeo.dispose(); atmoMat.dispose(); stars.material.dispose();
      nodeGeo.dispose(); nodePoints.material.dispose();
      focusCore.geometry.dispose(); focusCore.material.dispose();
      tubeObjs.forEach((t) => { t.mesh.geometry.dispose(); t.mesh.material.dispose(); });
      if (softLines) { softLines.geometry.dispose(); softLines.material.dispose(); }
      sprites.forEach((s) => s.material.dispose());
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey]);

  useEffect(() => { applyRef.current(); }, [query, matchIds, selectedId, neighborIds, showSoftEdges]);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="absolute inset-0" />
      <div
        ref={tipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-150"
      />
    </div>
  );
}
