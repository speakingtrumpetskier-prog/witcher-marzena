// GLSL for the post chain (render/post/MzPostPass.js). All passes draw a full-screen triangle.

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Bright-pass at half resolution with a soft knee, plus the hunter-senses clue mask so clues
// bloom warm orange. Firefly suppression keeps single hot pixels (sun glints) from flickering.
export const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tMask;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
uniform float uKnee;
uniform float uSenses;
uniform vec3 uClueColor;
varying vec2 vUv;
vec3 tap(vec2 o) {
  vec3 c = texture2D(tColor, vUv + o * uTexel).rgb;
  // Guard: one NaN or Inf pixel (mirror-like speculars) would smear into a black bloom blot.
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = min(c, vec3(1000.0)) * uExposure;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  c *= w;
  return c / (1.0 + max(c.r, max(c.g, c.b)) * 0.15);
}
void main() {
  vec3 c = (tap(vec2(-0.5, -0.5)) + tap(vec2(0.5, -0.5)) + tap(vec2(-0.5, 0.5)) + tap(vec2(0.5, 0.5))) * 0.25;
  if (uSenses > 0.0) c += uClueColor * texture2D(tMask, vUv).r * uSenses;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Dual-filter (Kawase) down and up sampling.
export const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}
`;

export const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform float uScatter;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tSrc, vUv + vec2(-2.0 * h.x, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, 2.0 * h.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(2.0 * h.x, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -2.0 * h.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 12.0 * uScatter, 1.0);
}
`;

// God rays, step 1 (quarter res): bright open sky around the sun. Geometry (depth < far plane)
// blocks it, so trees, ridges and buildings cut the light into shafts.
export const RAYMASK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec2 uSunUV;
uniform float uAspect;
uniform float uExposure;
varying vec2 vUv;
float tapSky(vec2 o) {
  vec2 uv = vUv + o * uTexel;
  float d = texture2D(tDepth, uv).r;
  if (d < 0.99999) return 0.0;
  vec3 c = texture2D(tColor, uv).rgb;
  if (any(isnan(c)) || any(isinf(c))) return 0.0;
  c = min(c, vec3(1000.0)) * uExposure;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  return smoothstep(0.25, 2.2, l);
}
void main() {
  float m = (tapSky(vec2(-1.0, -1.0)) + tapSky(vec2(1.0, -1.0)) + tapSky(vec2(-1.0, 1.0)) + tapSky(vec2(1.0, 1.0))) * 0.25;
  vec2 dv = (vUv - uSunUV) * vec2(uAspect, 1.0);
  float r = length(dv);
  m *= exp(-r * r * 5.0) + 0.15 * exp(-r * 2.0);
  gl_FragColor = vec4(vec3(m), 1.0);
}
`;

// God rays, step 2: radial blur toward the sun with exponential decay and a dithered start.
export const RAYBLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSunUV;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
varying vec2 vUv;
void main() {
  const int N = 40;
  vec2 delta = (vUv - uSunUV) * uDensity / float(N);
  float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 uv = vUv - delta * dith;
  float illum = 1.0;
  float acc = 0.0;
  for (int i = 0; i < N; i++) {
    acc += texture2D(tSrc, uv).r * illum;
    illum *= uDecay;
    uv -= delta;
  }
  gl_FragColor = vec4(vec3(acc * uWeight / float(N)), 1.0);
}
`;

// Final composite: bloom, rays, exposure, white balance, filmic tone map (ACES fit, same curve
// as three's ACESFilmicToneMapping so the game reads the same with post disabled), then the
// display-space grade (contrast, lift/gain split toning, saturation), screen effects (hunter
// senses, echo, frost, flash), vignette, grain and sRGB output.
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform sampler2D tMask;
uniform sampler2D tFrost;
uniform vec2 uTexel;
uniform vec2 uMaskTexel;
uniform float uAspect;
uniform float uExposure;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRaysColor;
uniform vec3 uTint;
uniform vec2 uShoulder;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
uniform float uContrast;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uSenses;
uniform float uSensesTime;
uniform vec3 uClueColor;
uniform float uEcho;
uniform float uFrost;
uniform vec3 uFlashColor;
uniform float uFlash;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 uv = vUv;
  vec2 cuv = (vUv - 0.5) * vec2(uAspect, 1.0);
  float rad = length(cuv);

  // Frost on the screen edges: a growth front driven by distance to the nearest edge.
  float frostM = 0.0;
  vec4 fr = vec4(0.0);
  float e = 1.0, reach = 0.0;
  if (uFrost > 0.001) {
    vec2 fuv = vUv * vec2(uAspect, 1.0) * 0.8;
    fr = texture2D(tFrost, fuv);
    float ex = min(vUv.x, 1.0 - vUv.x) * uAspect;
    float ey = min(vUv.y, 1.0 - vUv.y);
    // Corners freeze first, then the edges; an irregular front creeps inward.
    e = min(ex, ey) * 0.7 + sqrt(ex * ey) * 0.45;
    reach = uFrost * 0.32;
    e += (fr.g - 0.5) * 0.11 - fr.r * 0.025;
    frostM = smoothstep(reach, reach - 0.11, e);
    vec2 grad = vec2(texture2D(tFrost, fuv + vec2(0.004, 0.0)).b - fr.b, texture2D(tFrost, fuv + vec2(0.0, 0.004)).b - fr.b);
    uv += grad * 0.12 * frostM;
  }

  vec3 c = texture2D(tColor, uv).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = min(c, vec3(1000.0));
  if (uEcho > 0.001) {
    vec2 dir = (vUv - 0.5) * 0.006 * uEcho;
    c.r = texture2D(tColor, uv + dir).r;
    c.b = texture2D(tColor, uv - dir).b;
  }
  if (frostM > 0.001) {
    vec3 blur = texture2D(tColor, uv + vec2(3.0, 1.0) * uTexel).rgb + texture2D(tColor, uv + vec2(-1.0, 3.0) * uTexel).rgb
              + texture2D(tColor, uv + vec2(-3.0, -1.0) * uTexel).rgb + texture2D(tColor, uv + vec2(1.0, -3.0) * uTexel).rgb;
    c = mix(c, blur * 0.25, frostM * 0.65);
  }

  vec3 bloom = texture2D(tBloom, vUv).rgb;
  c *= uExposure;
  c += bloom * uBloom;
  c += texture2D(tRays, vUv).rgb * uRaysColor * uRays;
  c *= uTint;

  // Highlight shoulder on luminance (hue kept): sunlit snow keeps its drifts and sparkle
  // instead of flattening into the top of the tone curve.
  float lum = luma(c);
  if (lum > uShoulder.x) {
    float nl = uShoulder.x + (lum - uShoulder.x) / (1.0 + (lum - uShoulder.x) * uShoulder.y);
    c *= nl / lum;
  }

  vec3 t = acesFilmic(c);
  vec3 g = pow(t, vec3(1.0 / 2.2));

  // Display-space grade.
  g = (g - 0.46) * uContrast + 0.46;
  g = max(g, 0.0);
  g = g * uGain + uLift * (1.0 - g);
  float l = luma(g);
  g = mix(vec3(l), g, uSat);

  // Hunter senses: cold grey world, slow radial pulse, dark edges, clues glow warm.
  if (uSenses > 0.001) {
    float s = uSenses;
    float lg = luma(g);
    g = mix(g, vec3(lg) * vec3(0.84, 0.9, 1.0), s * 0.86);
    float ph = fract(uSensesTime * 0.35);
    float ring = exp(-pow((rad - ph * 1.25) / 0.045, 2.0)) * (1.0 - ph);
    g += vec3(0.05, 0.065, 0.08) * ring * s;
    g *= 1.0 - s * 0.5 * smoothstep(0.35, 0.95, rad);
    float core = texture2D(tMask, vUv).r;
    float glow = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      glow += texture2D(tMask, vUv + vec2(cos(a), sin(a)) * uMaskTexel * 3.0).r;
      glow += texture2D(tMask, vUv + vec2(cos(a + 0.39), sin(a + 0.39)) * uMaskTexel * 7.0).r * 0.6;
    }
    glow /= 12.8;
    float rim = clamp(glow - core * 0.6, 0.0, 1.0);
    g += uClueColor * (rim * 1.1 + core * 0.4) * s;
  }

  // Echo: a cold blue reconstruction, like memory seen through ice.
  if (uEcho > 0.001) {
    float e = uEcho;
    float le = luma(g);
    vec3 ghost = mix(vec3(0.015, 0.05, 0.12), vec3(0.62, 0.96, 1.0), smoothstep(0.02, 0.85, le));
    g = mix(g, ghost, e * 0.88);
    g += vec3(0.2, 0.5, 0.6) * luma(bloom) * e * 0.35;
    g *= 1.0 - e * 0.035 * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.3 + uTime * 6.0));
    g *= 1.0 - e * 0.55 * smoothstep(0.3, 1.0, rad);
  }

  // Frost overlay: pale crystals with bright fern lines.
  if (frostM > 0.001) {
    vec3 ice = vec3(0.8, 0.88, 0.97);
    g = mix(g, ice * (0.82 + 0.18 * fr.b), frostM * 0.32);
    float fern = smoothstep(0.25, 0.9, fr.r);
    g += vec3(0.75, 0.86, 1.0) * fern * frostM * 0.28 * (0.6 + 0.4 * smoothstep(0.0, 0.08, e - (reach - 0.11)));
  }

  // Vignette (slightly cool in the corners), flash, grain, dither.
  float vig = smoothstep(0.45, 1.05, rad);
  g *= 1.0 - uVignette * vig;
  g += uFlashColor * uFlash;
  float n = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
  g += n * uGrain * (1.0 - 0.5 * luma(g));
  g += (hash12(gl_FragCoord.yx * 1.37 + 3.1) - 0.5) / 255.0;

  vec3 lin = pow(max(g, 0.0), vec3(2.2));
  gl_FragColor = vec4(toSRGB(lin), 1.0);
}
`;
