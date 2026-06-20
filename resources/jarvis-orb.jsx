import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// JARVIS — liquid audio-reactive orb
// Deep ink field, bioluminescent liquid core that morphs to sound.
// States: idle · listening · thinking · speaking
// Mic reactivity via Web Audio AnalyserNode; falls back to a synthetic drive
// when mic is unavailable (e.g. a sandboxed preview) so it's never dead.
// ─────────────────────────────────────────────────────────────────────────────

const STATES = {
  idle:      { label: "idle",      cool: [0.49, 0.36, 1.0],  warm: [0.31, 0.78, 1.0], disp: 0.10, freq: 1.3, spin: 0.06, sens: 0.25 },
  listening: { label: "listening", cool: [0.21, 0.88, 0.83], warm: [0.31, 0.78, 1.0], disp: 0.16, freq: 1.7, spin: 0.10, sens: 1.00 },
  thinking:  { label: "thinking",  cool: [0.49, 0.36, 1.0],  warm: [1.0, 0.24, 0.55], disp: 0.30, freq: 2.6, spin: 0.55, sens: 0.40 },
  speaking:  { label: "speaking",  cool: [1.0, 0.42, 0.24],  warm: [1.0, 0.24, 0.55], disp: 0.22, freq: 2.0, spin: 0.16, sens: 0.95 },
};

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
  // two octaves of liquid turbulence, lifted by live audio
  float n1 = snoise(position * uFreq + vec3(t));
  float n2 = 0.5 * snoise(position * (uFreq*2.1) - vec3(t*1.3));
  float amp = uDisp + uAudio * (uDisp * 2.2 + 0.18);
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
  // iridescent mix driven by curvature + displacement + audio
  float band = sin(vDispl * 9.0 + uTime * 0.8 + vWorld.y * 1.5) * 0.5 + 0.5;
  vec3 body = mix(uCool, uWarm, band * (0.55 + uAudio * 0.45));
  vec3 rim  = mix(uWarm, vec3(1.0), 0.4) * (fres * (1.2 + uAudio * 1.6));
  vec3 col  = body * (0.25 + 0.55 * (0.5 + 0.5*N.y)) + rim;
  col += uAudio * uWarm * 0.25;            // pulse on sound
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
  gl_FragColor = vec4(uCool, a * 0.65);
}
`;

function lerp3(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

export default function JarvisOrb() {
  const mountRef = useRef(null);
  const stateRef = useRef("idle");
  const audioRef = useRef({ level: 0, target: 0 });
  const analyserRef = useRef(null);
  const dataRef = useRef(null);

  const [uiState, setUiState] = useState("idle");
  const [micOn, setMicOn] = useState(false);
  const [micErr, setMicErr] = useState("");
  const [level, setLevel] = useState(0);

  const setState = (s) => { stateRef.current = s; setUiState(s); };

  const connectMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024; an.smoothingTimeConstant = 0.75;
      src.connect(an);
      analyserRef.current = an;
      dataRef.current = new Uint8Array(an.fftSize);
      setMicOn(true); setMicErr("");
      if (stateRef.current === "idle") setState("listening");
    } catch (e) {
      setMicErr("mic unavailable here — running synthetic drive");
      setMicOn(false);
    }
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth, H = mount.clientHeight;
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

    // drifting particle haze
    const pCount = 700, pGeo = new THREE.BufferGeometry(), pos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const r = 2.1 + Math.random() * 2.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2*Math.random()-1);
      pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3+1] = r*Math.sin(ph)*Math.sin(th); pos[i*3+2] = r*Math.cos(ph);
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.018, color: 0x8aa0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(particles);

    let raf, t = 0, cool = [...STATES.idle.cool], warm = [...STATES.idle.warm], disp = 0.1, freq = 1.3, spin = 0.06;
    const clock = new THREE.Clock();

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;
      const cfg = STATES[stateRef.current];

      // audio level: real analyser RMS, else synthetic shimmer
      let raw = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(dataRef.current);
        let sum = 0;
        for (let i = 0; i < dataRef.current.length; i++) { const v = (dataRef.current[i]-128)/128; sum += v*v; }
        raw = Math.min(1, Math.sqrt(sum / dataRef.current.length) * 3.2);
      } else if (stateRef.current === "listening" || stateRef.current === "speaking" || stateRef.current === "thinking") {
        raw = (Math.sin(t*5.1)*0.5+0.5) * (Math.sin(t*2.3)*0.5+0.5) * 0.7 + Math.random()*0.08;
      }
      const a = audioRef.current;
      a.target = raw * cfg.sens;
      a.level += (a.target - a.level) * (reduce ? 0.06 : 0.16);

      // ease visual params toward state targets
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
      particles.rotation.y -= dt * 0.04; particles.material.opacity = 0.35 + a.level * 0.4;
      const s = 1 + a.level * 0.06; core.scale.setScalar(s); glow.scale.setScalar(s);

      renderer.render(scene, camera);
      if (uiState !== undefined) {} // noop
      setLevelThrottled(a.level);
      raf = requestAnimationFrame(tick);
    };

    let lastUi = 0;
    const setLevelThrottled = (v) => { const n = performance.now(); if (n - lastUi > 80) { lastUi = n; setLevel(v); } };

    tick();
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); renderer.dispose(); geo.dispose(); mount.removeChild(renderer.domElement); };
  }, []);

  const cfg = STATES[uiState];
  const accent = `rgb(${cfg.cool.map(c => Math.round(c*255)).join(",")})`;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#06070D] font-sans select-none">
      {/* ambient color bloom behind the orb */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[42vmin] h-[42vmin] rounded-full blur-[80px] opacity-40 transition-colors duration-1000"
           style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 40%, #06070D 90%)" }} />

      <div ref={mountRef} className="absolute inset-0" />

      {/* top telemetry strip */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 font-mono text-[11px] tracking-widest text-[#7782A6] uppercase">
        <span className="text-[#AEB6D6]">JARVIS</span>
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
          <span style={{ color: accent }}>{cfg.label}</span>
        </div>
        <span>{micOn ? "mic · live" : "mic · off"}</span>
      </div>

      {/* live level meter */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 h-40 w-[3px] rounded-full bg-white/5 overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 rounded-full transition-[height] duration-75"
             style={{ height: `${Math.min(100, level*130)}%`, background: accent, boxShadow: `0 0 12px ${accent}` }} />
      </div>

      {/* big state word */}
      <div className="absolute left-1/2 bottom-[26%] -translate-x-1/2 text-center pointer-events-none">
        <div className="text-5xl font-light tracking-tight text-white/90 lowercase transition-all duration-500">{cfg.label}</div>
        <div className="mt-2 font-mono text-[11px] tracking-[0.3em] text-[#5B658C] uppercase">
          {uiState === "listening" ? "speak — the orb follows your voice" : uiState === "idle" ? "say “hey jarvis”" : uiState === "thinking" ? "routing to claude code" : "responding"}
        </div>
      </div>

      {/* controls — seed of the control panel */}
      <div className="absolute left-1/2 bottom-10 -translate-x-1/2 flex flex-col items-center gap-4">
        <div className="flex gap-1.5 p-1.5 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/5">
          {Object.keys(STATES).map((s) => (
            <button key={s} onClick={() => setState(s)}
              className="px-4 py-2 rounded-full text-xs font-mono tracking-wide lowercase transition-all"
              style={uiState === s
                ? { background: accent, color: "#06070D", fontWeight: 600 }
                : { color: "#8A93B8" }}>
              {s}
            </button>
          ))}
        </div>
        {!micOn ? (
          <button onClick={connectMic}
            className="px-6 py-2.5 rounded-full text-xs font-mono tracking-widest uppercase text-white/80 border border-white/15 hover:border-white/40 hover:text-white transition-all">
            connect microphone
          </button>
        ) : (
          <span className="font-mono text-[10px] tracking-widest uppercase text-[#36E0D4]/70">live · reacting to your voice</span>
        )}
        {micErr && <span className="font-mono text-[10px] tracking-wide text-[#FF6A3D]/70">{micErr}</span>}
      </div>
    </div>
  );
}
