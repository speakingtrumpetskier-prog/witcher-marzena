// The photo mode's own pass, drawn over the finished frame: depth of field from the scene depth, a
// colour filter, vignette and grain, the crop mask and the border. It reads the frame back from the
// screen (copyFramebufferToTexture) after the main post pass, so the game's post chain is untouched and
// none of this costs anything outside photo mode. What is on the canvas is exactly what gets saved.
//
//   const pass = new PhotoPass(G)
//   pass.render(opts)        after the composer has drawn the frame; opts: { blur, strength, focus, filter,
//                            vignette, grain, rect: [x0, y0, x1, y1] in uv, mask, border (canvas or null) }
//   pass.depthAt(u, v)       metres from the camera to the scene at a screen point (0..1, y up), or null
//   pass.dispose()
import * as THREE from 'three';

export const FILTERS = ['None', 'Warm', 'Cold', 'Faded', 'Silver', 'Ink', 'Sepia', 'Duotone'];

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBorder;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uBlur;
uniform float uStrength;
uniform int uFilter;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform vec4 uRect;
uniform float uMask;
uniform float uBorder;
varying vec2 vUv;

float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
// Circle of confusion in pixels: how far a point at depth z is from the focal plane, relative to its depth.
float coc(float z) { return clamp(abs(z - uFocus) / max(z, 1e-3) * uStrength, 0.0, 1.0) * uBlur; }

// Gather on a golden-angle spiral; a sample counts if its own blur reaches this pixel, and samples behind
// the centre cannot blur further than twice the centre does (keeps sharp subjects from bleeding).
vec3 dof(vec2 uv) {
  vec3 base = texture2D(tColor, uv).rgb;
  if (uBlur < 0.5) return base;
  float zc = linZ(texture2D(tDepth, uv).r);
  float rc = coc(zc);
  vec3 acc = base;
  float tot = 1.0;
  float r = 0.75;
  float ang = 0.0;
  for (int i = 0; i < 140; i++) {
    if (r >= uBlur) break;
    vec2 tc = uv + vec2(cos(ang), sin(ang)) * r / uRes;
    vec3 sc = texture2D(tColor, tc).rgb;
    float zs = linZ(texture2D(tDepth, tc).r);
    float rs = coc(zs);
    if (zs > zc) rs = min(rs, rc * 2.0);
    float m = smoothstep(r - 0.5, r + 0.5, rs);
    acc += mix(acc / tot, sc, m);
    tot += 1.0;
    ang += 2.39996323;
    r += 1.25 / r;
  }
  return acc / tot;
}

float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

vec3 grade(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (uFilter == 1) { // warm: late-afternoon paper
    c = c * vec3(1.07, 1.0, 0.88) + vec3(0.025, 0.012, 0.0);
  } else if (uFilter == 2) { // cold: blue shadows, clean highlights
    c = mix(c * vec3(0.82, 0.93, 1.12), c * vec3(0.98, 1.0, 1.03), smoothstep(0.2, 0.8, l));
  } else if (uFilter == 3) { // faded print
    c = mix(vec3(l), c, 0.68) * 0.84 + vec3(0.085, 0.08, 0.07);
  } else if (uFilter == 4) { // silver gelatin
    c = vec3(smoothstep(-0.04, 1.04, l)) * vec3(1.0, 1.0, 1.025);
  } else if (uFilter == 5) { // ink: hard black and white
    c = vec3(smoothstep(0.2, 0.74, l));
  } else if (uFilter == 6) { // sepia tintype
    vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
    c = mix(vec3(l), s, 0.85) * 0.96 + 0.02;
  } else if (uFilter == 7) { // duotone: folk red and cream, like the paper cuts
    c = mix(vec3(0.29, 0.065, 0.05), vec3(0.95, 0.91, 0.82), smoothstep(0.06, 0.88, l));
  }
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec3 c = grade(dof(uv));
  // Frame-local coordinates, so the vignette and border follow the crop.
  vec2 fr = (uv - uRect.xy) / (uRect.zw - uRect.xy);
  bool inside = fr.x >= 0.0 && fr.x <= 1.0 && fr.y >= 0.0 && fr.y <= 1.0;
  float aspect = (uRect.z - uRect.x) * uRes.x / ((uRect.w - uRect.y) * uRes.y);
  vec2 q = (fr - 0.5) * vec2(aspect, 1.0) / sqrt(aspect * aspect + 1.0) * 2.0;
  float vig = smoothstep(1.05, 0.25, length(q));
  c *= mix(1.0, vig * vig, uVignette);
  float n = hash(gl_FragCoord.xy + uSeed * 97.0) - 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += n * uGrain * 0.11 * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
  if (uBorder > 0.5 && inside) {
    vec4 b = texture2D(tBorder, vec2(fr.x, fr.y));
    c = mix(c, b.rgb, b.a);
  }
  if (!inside) c *= 1.0 - uMask;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

// Depth at one pixel, packed into RGBA8 so it can be read back on any WebGL2 device.
const PICK_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uAt;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, uAt).r;
  float z = uNear * uFar / (uFar - d * (uFar - uNear));
  float v = clamp(z / uFar, 0.0, 0.9999999);
  vec4 enc = fract(v * vec4(1.0, 255.0, 65025.0, 16581375.0));
  enc -= enc.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = enc;
}
`;

export class PhotoPass {
  constructor(G) {
    this.G = G;
    this.size = new THREE.Vector2();
    this.tex = null;
    this.borderTex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.borderTex.colorSpace = THREE.NoColorSpace;
    this.borderTex.minFilter = THREE.LinearFilter;
    this.borderTex.generateMipmaps = false;
    this._borderSrc = null;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tBorder: { value: this.borderTex },
        uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 9000 },
        uFocus: { value: 5 }, uBlur: { value: 0 }, uStrength: { value: 1 }, uFilter: { value: 0 },
        uVignette: { value: 0 }, uGrain: { value: 0 }, uSeed: { value: 0 },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uMask: { value: 0 }, uBorder: { value: 0 },
      },
    });
    this.pickMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PICK_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { tDepth: { value: null }, uAt: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 9000 } },
    });
    this.pickTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.pickBuf = new Uint8Array(4);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _depthTexture() {
    return this.G.postfx?.pass?.lastDepth || null;
  }

  _ensureTex() {
    const R = this.G.renderer;
    R.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x)), h = Math.max(1, Math.floor(this.size.y));
    if (this.tex && this.tex.image.width === w && this.tex.image.height === h) return;
    this.tex?.dispose();
    this.tex = new THREE.FramebufferTexture(w, h);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
  }

  // A new texture per border canvas: its size changes with the crop, and a texture keeps its first size.
  setBorder(canvas) {
    if (canvas === this._borderSrc) return;
    this._borderSrc = canvas;
    if (!canvas) return;
    this.borderTex.dispose();
    this.borderTex = new THREE.CanvasTexture(canvas);
    this.borderTex.colorSpace = THREE.NoColorSpace;
    this.borderTex.minFilter = THREE.LinearFilter;
    this.borderTex.generateMipmaps = false;
    this.mat.uniforms.tBorder.value = this.borderTex;
  }

  render(o) {
    const G = this.G, R = G.renderer, cam = G.camera;
    this._ensureTex();
    const prevTarget = R.getRenderTarget();
    const prevAuto = R.autoClear;
    R.setRenderTarget(null);
    R.copyFramebufferToTexture(this.tex);
    const u = this.mat.uniforms;
    const hScale = this.size.y / 1080;
    u.tColor.value = this.tex;
    u.tDepth.value = this._depthTexture();
    u.uRes.value.set(this.size.x, this.size.y);
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uFocus.value = Math.max(0.2, o.focus || 5);
    u.uBlur.value = u.tDepth.value ? Math.min(30, (o.blur || 0) * hScale) : 0;
    u.uStrength.value = o.strength ?? 1;
    u.uFilter.value = Math.max(0, FILTERS.indexOf(o.filter));
    u.uVignette.value = o.vignette || 0;
    u.uGrain.value = o.grain || 0;
    u.uSeed.value = o.seed || 0;
    const r = o.rect || [0, 0, 1, 1];
    u.uRect.value.set(r[0], r[1], r[2], r[3]);
    u.uMask.value = o.mask ?? 0;
    this.setBorder(o.border || null);
    u.uBorder.value = o.border ? 1 : 0;
    R.autoClear = false;
    R.render(this.scene, this.cam);
    R.autoClear = prevAuto;
    R.setRenderTarget(prevTarget);
  }

  // Metres to the scene at (u, v), v measured from the bottom. Uses the depth of the last frame drawn.
  depthAt(u, v) {
    const G = this.G, R = G.renderer, dt = this._depthTexture();
    if (!dt) return null;
    const pu = this.pickMat.uniforms;
    pu.tDepth.value = dt;
    pu.uAt.value.set(u, v);
    pu.uNear.value = G.camera.near;
    pu.uFar.value = G.camera.far;
    this.quad.material = this.pickMat;
    const prev = R.getRenderTarget();
    R.setRenderTarget(this.pickTarget);
    R.render(this.scene, this.cam);
    R.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickBuf);
    R.setRenderTarget(prev);
    this.quad.material = this.mat;
    const b = this.pickBuf;
    const v01 = b[0] / 255 + b[1] / 65025 + b[2] / 16581375 + b[3] / 4228250625;
    const z = v01 * G.camera.far;
    return z > 0 && z < G.camera.far * 0.98 ? z : null;
  }

  dispose() {
    this.tex?.dispose();
    this.borderTex.dispose();
    this.pickTarget.dispose();
    this.mat.dispose();
    this.pickMat.dispose();
    this.quad.geometry.dispose();
  }
}
