import { useRef, useEffect, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// AuroraOrb — liquid bioluminescent orb (adapted from resources/jarvis-orb.jsx).
// Exact shaders/geometry/state palettes preserved. Chrome (telemetry, meter,
// controls) removed — this is just the centerpiece orb + a subtle ambient bloom.
// Driven by a `state` prop; if omitted, gently cycles the four states.
// Kept subtle: contained size, low-opacity bloom, slightly tamed motion.
// ─────────────────────────────────────────────────────────────────────────────

const STATES = {
  idle:      { cool: [0.49, 0.36, 1.0],  warm: [0.31, 0.78, 1.0], disp: 0.06, freq: 1.3, spin: 0.05, sens: 0.18 },
  listening: { cool: [0.21, 0.88, 0.83], warm: [0.31, 0.78, 1.0], disp: 0.09, freq: 1.7, spin: 0.09, sens: 0.55 },
  thinking:  { cool: [0.49, 0.36, 1.0],  warm: [1.0, 0.24, 0.55], disp: 0.14, freq: 2.3, spin: 0.30, sens: 0.32 },
  working:   { cool: [1.0, 0.42, 0.24],  warm: [1.0, 0.24, 0.55], disp: 0.12, freq: 2.0, spin: 0.14, sens: 0.50 },
};
const ORDER = ["idle", "listening", "thinking", "working"];

const VERT = `
uniform float uTime; uniform float uAudio; uniform float uDisp; uniform float uFreq;
varying vec3 vNormal; varying vec3 vWorld; varying float vDispl;

vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+1.0*C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx;
  i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

void main(){
  vNormal = normal;
  float t = uTime * 0.5;
  float n1 = snoise(position * uFreq + vec3(t));
  float n2 = 0.5 * snoise(position * (uFreq*2.1) - vec3(t*1.3));
  float amp = uDisp + uAudio * (uDisp * 1.2 + 0.08);
  float d = (n1 + n2) * amp;
  vDispl = d;
  vec3 pos = position + normal * d;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = `
precision highp float;
uniform vec3 uCool; uniform vec3 uWarm; uniform float uAudio; uniform float uTime;
varying vec3 vNormal; varying vec3 vWorld; varying float vDispl;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  float band = sin(vDispl * 9.0 + uTime * 0.8 + vWorld.y * 1.5) * 0.5 + 0.5;
  vec3 body = mix(uCool, uWarm, band * (0.55 + uAudio * 0.45));
  vec3 rim  = mix(uWarm, vec3(1.0), 0.4) * (fres * (1.2 + uAudio * 1.6));
  vec3 col  = body * (0.25 + 0.55 * (0.5 + 0.5*N.y)) + rim;
  col += uAudio * uWarm * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

const GLOW_FRAG = `
precision highp float;
uniform vec3 uCool; uniform float uAudio;
varying vec3 vNormal; varying vec3 vWorld;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
  float a = fres * (0.5 + uAudio * 0.9);
  gl_FragColor = vec4(uCool, a * 0.55);
}
`;

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export default function AuroraOrb({ state, size = 380, cycle = true, className = "" }) {
  const mountRef = useRef(null);
  const stateRef = useRef(state || "idle");
  const audioRef = useRef({ level: 0, target: 0 });
  const [ui, setUi] = useState(state || "idle");

  // Follow a controlled `state` prop when provided.
  useEffect(() => {
    if (state) {
      stateRef.current = state;
      setUi(state);
    }
  }, [state]);

  // Otherwise gently cycle the four states (mockup demo behaviour).
  useEffect(() => {
    if (state || !cycle) return;
    let i = ORDER.indexOf(stateRef.current);
    const id = setInterval(() => {
      i = (i + 1) % ORDER.length;
      stateRef.current = ORDER[i];
      setUi(ORDER[i]);
    }, 3200);
    return () => clearInterval(id);
  }, [state, cycle]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth || size;
    const H = mount.clientHeight || size;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 4.2;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const geo = new THREE.IcosahedronGeometry(1.25, 20);
    const uniforms = {
      uTime: { value: 0 }, uAudio: { value: 0 }, uDisp: { value: 0.1 }, uFreq: { value: 1.3 },
      uCool: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() },
    };
    const core = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
    }));
    scene.add(core);

    const glowGeo = new THREE.IcosahedronGeometry(1.55, 12);
    const glow = new THREE.Mesh(glowGeo, new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: GLOW_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    }));
    scene.add(glow);

    // drifting particle haze (toned down for subtlety)
    const pCount = 420, pGeo = new THREE.BufferGeometry(), pos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const r = 2.1 + Math.random() * 2.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.016, color: 0x8aa0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(particles);

    let raf, t = 0;
    let cool = [...STATES.idle.cool], warm = [...STATES.idle.warm], disp = 0.1, freq = 1.3, spin = 0.05;
    const clock = new THREE.Clock();

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;
      const cfg = STATES[stateRef.current] || STATES.idle;

      // synthetic shimmer when not idle (no mic — keeps it calm + permission-free)
      let raw = 0;
      if (stateRef.current !== "idle") {
        raw = (Math.sin(t * 5.1) * 0.5 + 0.5) * (Math.sin(t * 2.3) * 0.5 + 0.5) * 0.6 + Math.random() * 0.05;
      }
      const a = audioRef.current;
      a.target = raw * cfg.sens;
      a.level += (a.target - a.level) * (reduce ? 0.06 : 0.16);

      cool = lerp3(cool, cfg.cool, 0.05); warm = lerp3(warm, cfg.warm, 0.05);
      disp += (cfg.disp - disp) * 0.05; freq += (cfg.freq - freq) * 0.05; spin += (cfg.spin - spin) * 0.05;

      uniforms.uTime.value = t;
      uniforms.uAudio.value = a.level;
      uniforms.uDisp.value = disp;
      uniforms.uFreq.value = freq;
      uniforms.uCool.value.setRGB(cool[0], cool[1], cool[2]);
      uniforms.uWarm.value.setRGB(warm[0], warm[1], warm[2]);

      const rot = (reduce ? 0.2 : 1) * (spin + a.level * 0.4) * dt;
      core.rotation.y += rot; core.rotation.x += rot * 0.4; glow.rotation.copy(core.rotation);
      particles.rotation.y -= dt * 0.04; particles.material.opacity = 0.25 + a.level * 0.35;
      const s = 1 + a.level * 0.03; core.scale.setScalar(s); glow.scale.setScalar(s);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    tick();
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geo.dispose();
      glowGeo.dispose();
      pGeo.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [size]);

  const cfg = STATES[ui] || STATES.idle;
  const accent = `rgb(${cfg.cool.map((c) => Math.round(c * 255)).join(",")})`;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* subtle ambient bloom behind the orb, tinted to the current state */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full blur-[70px] transition-colors duration-1000"
        style={{
          inset: "-18%",
          opacity: 0.22,
          background: `radial-gradient(circle, ${accent}, transparent 70%)`,
        }}
      />
      {/* WebGL canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}
