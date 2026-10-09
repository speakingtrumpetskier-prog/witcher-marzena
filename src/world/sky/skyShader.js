// Sky dome GLSL. One full-screen-ish pass drawn at the far plane after opaque geometry, so
// terrain occludes it early (cheap). The fog from fogChunk.js is applied to the dome with an
// "infinite" ray, so the horizon is exactly the color distant terrain fades into.
import { FOG_UNIFORMS_GLSL, FOG_FUNCS_GLSL } from '../../render/fogChunk.js';

export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
${FOG_UNIFORMS_GLSL}
uniform sampler2D uNoise;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlowColor;
uniform float uGlowI;
uniform vec3 uSunDisk;
uniform float uSunVis;
uniform float uSunSize;
uniform float uTwilight;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonPhase;
uniform float uMoonVis;
uniform float uStars;
uniform float uAurora;
uniform float uAuroraTime;
uniform float uCover;
uniform float uOvercast;
uniform float uCirrus;
uniform vec2 uCloudOffset;
uniform vec2 uCirrusOffset;
uniform vec2 uWindDir;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uEnvMode;
uniform vec3 uGroundColor;
uniform float uPixelAngle;
uniform float uSkyFog;
uniform float uTime;
${FOG_FUNCS_GLSL}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float hg(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

// One layer of stars from a 3D cell grid on the unit sphere.
vec3 starLayer(vec3 rd, float n, float prob, float gain) {
  vec3 p = rd * n;
  vec3 c = floor(p);
  float h = hash13(c);
  if (h > prob) return vec3(0.0);
  vec3 j = hash33(c + 17.0);
  vec3 sp = normalize(c + 0.25 + j * 0.5);
  if (any(notEqual(floor(sp * n), c))) return vec3(0.0);
  float ang = length(rd - sp);
  float sz = uPixelAngle * 0.85;
  float mag = pow(hash13(c + 5.0), 7.0) * 0.9 + 0.1;
  float tw = 0.65 + 0.35 * sin(uTime * (2.0 + j.x * 6.0) + j.y * 60.0);
  tw = mix(1.0, tw, 0.4 + 0.6 * (1.0 - clamp(rd.y * 2.0, 0.0, 1.0)));
  vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.84, 0.66), j.z * j.z);
  return tint * mag * tw * gain * exp(-ang * ang / (sz * sz));
}

vec3 stars(vec3 rd) {
  vec3 mwN = normalize(vec3(0.35, 0.42, 0.84));
  float mw = exp(-pow(dot(rd, mwN) / 0.2, 2.0));
  vec2 mwUV = vec2(atan(rd.x, rd.z) * 0.6, dot(rd, mwN) * 2.0);
  float dust = texture2D(uNoise, mwUV * 0.7).g;
  float lanes = smoothstep(0.35, 0.65, texture2D(uNoise, mwUV * 1.6 + 0.3).b);
  vec3 s = starLayer(rd, 95.0, 0.05, 1.0);
  s += starLayer(rd, 210.0, 0.035 + 0.12 * mw * lanes, 0.35);
  vec3 band = vec3(0.55, 0.62, 0.85) * mw * (0.35 + 0.9 * dust) * lanes * 0.045;
  return s * 0.9 + band;
}

vec3 aurora(vec3 rd) {
  if (rd.y < 0.015 || rd.z > 0.35) return vec3(0.0);
  float t = uAuroraTime;
  // Coordinate along the curtains: east-west position where the ray meets the curtain distance.
  float xc = rd.x / max(-rd.z + 0.25, 0.08) * 5.0;
  float w1 = texture2D(uNoise, vec2(xc * 0.018 + t * 0.0035, 0.37)).r - 0.5;
  float w2 = texture2D(uNoise, vec2(xc * 0.06 - t * 0.009, 0.71)).g - 0.5;
  float w3 = texture2D(uNoise, vec2(xc * 0.022 - t * 0.004, 0.11)).r - 0.5;
  float czA = -5.0 + w1 * 7.0 + w2 * 1.8;
  float czB = -7.5 + w3 * 8.0 - w2 * 1.2;
  float raysA = texture2D(uNoise, vec2(xc * 0.55 + t * 0.012, 0.13 + t * 0.0007)).b;
  float raysB = texture2D(uNoise, vec2(xc * 0.8 - t * 0.016, 0.53)).b;
  raysA = 0.25 + 1.1 * smoothstep(0.38, 0.85, raysA);
  raysB = 0.25 + 1.1 * smoothstep(0.38, 0.85, raysB);
  float pulse = 0.7 + 0.3 * texture2D(uNoise, vec2(xc * 0.01 + t * 0.02, t * 0.003)).g * 2.0;
  float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 acc = vec3(0.0);
  const int N = 18;
  for (int i = 0; i < N; i++) {
    float fi = (float(i) + dith) / float(N);
    float h = 1.0 + fi * 2.6;
    float pz = rd.z * h / rd.y;
    float dA = pz - czA, dB = pz - czB;
    float bA = exp(-dA * dA * 3.5) * raysA;
    float bB = exp(-dB * dB * 2.5) * raysB * 0.6;
    float prof = exp(-fi * 2.4) * smoothstep(0.0, 0.06, fi + 0.02);
    vec3 col = mix(vec3(0.18, 1.0, 0.55), vec3(0.5, 0.3, 1.0), smoothstep(0.12, 0.65, fi));
    col = mix(col, vec3(1.0, 0.3, 0.55), smoothstep(0.75, 1.0, fi) * 0.5);
    acc += col * (bA + bB) * prof;
  }
  float horizonFade = smoothstep(0.015, 0.12, rd.y);
  float spread = smoothstep(16.0, 6.0, abs(xc + 2.0));
  return acc * (3.0 / float(N)) * horizonFade * spread * pulse * uAurora;
}

vec3 moon(vec3 rd, out float cover) {
  cover = 0.0;
  float md = dot(rd, uMoonDir);
  if (md < 0.95 || uMoonVis <= 0.0) return vec3(0.0);
  float R = 0.0165;
  vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
  vec3 mu = cross(uMoonDir, mr);
  vec2 q = vec2(dot(rd, mr), dot(rd, mu)) / R;
  float r = length(q);
  float ang = sqrt(max(2.0 * (1.0 - md), 0.0));
  vec3 halo = uMoonColor * (exp(-ang * ang / 0.0045) * 0.10 + exp(-ang / 0.18) * 0.02);
  if (r > 1.0) return halo * uMoonVis;
  vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));
  vec3 st = uSunDir - uMoonDir * dot(uSunDir, uMoonDir);
  vec2 s2 = normalize(vec2(dot(st, mr), dot(st, mu)) + 1e-4);
  float ca = 2.0 * uMoonPhase - 1.0;
  float sa = sqrt(max(1.0 - ca * ca, 0.0));
  vec3 L = vec3(s2 * sa, ca);
  float lit = smoothstep(-0.04, 0.12, dot(n, L));
  float maria = texture2D(uNoise, q * 0.18 + 0.4).r;
  float crat = texture2D(uNoise, q * 0.45 + 0.1).a;
  float albedo = 0.62 + 0.38 * smoothstep(0.35, 0.65, maria) - 0.08 * crat;
  float limb = 0.55 + 0.45 * n.z;
  cover = smoothstep(1.0, 0.94, r);
  vec3 disk = uMoonColor * 2.2 * albedo * limb * (lit + 0.025);
  return (disk * cover + halo) * uMoonVis;
}

// Lower deck: stratocumulus banks lit from the sun side. Returns color (rgb) and alpha.
vec4 cloudDeck(vec3 rd, float mu) {
  float y = rd.y;
  float t = 1.0 / (y + 0.06);
  vec2 p = rd.xz * t * 0.16 + uCloudOffset;
  float a = texture2D(uNoise, p * 0.55).r;
  float b = texture2D(uNoise, p * 1.3 + 0.21).a;
  float c = texture2D(uNoise, p * 3.1 + 0.57).g;
  float d = a * 0.55 + b * 0.35 + c * 0.18;
  float cov = mix(uCover, 1.0, uOvercast);
  float th = 1.02 - cov * 0.62;
  float dens = smoothstep(th - 0.06, th + 0.22, d);
  // Lit side: density sampled a step toward the sun; thinner there means a lit edge.
  vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.05;
  float ds = texture2D(uNoise, (p + toSun) * 0.55).r * 0.55 + texture2D(uNoise, (p + toSun) * 1.3 + 0.21).a * 0.35
           + texture2D(uNoise, (p + toSun) * 3.1 + 0.57).g * 0.18;
  float lit = clamp(0.55 + (d - ds) * 6.0, 0.0, 1.0);
  lit = mix(lit, 0.45, uOvercast * 0.85);
  float thick = smoothstep(th, th + 0.5, d);
  vec3 col = mix(uCloudShade, uCloudLit, lit * (1.0 - thick * 0.45));
  // Silver lining: forward scattering through thin edges near the sun.
  float edge = dens * (1.0 - smoothstep(th + 0.02, th + 0.25, d));
  col += uSunDisk * 0.012 * hg(mu, 0.72) * edge * uSunVis * (1.0 - uOvercast);
  // Overcast decks: broad soft variation instead of crisp banks.
  float deck = 0.82 + 0.36 * (a - 0.5) + 0.15 * (b - 0.5);
  col = mix(col, uCloudShade * deck * 1.05, uOvercast * 0.6);
  float horizon = smoothstep(0.0, 0.08, y);
  float alpha = mix(dens, 1.0, uOvercast * smoothstep(0.0, 0.05, y)) * horizon;
  return vec4(col, alpha);
}

// High cirrus: thin streaks stretched along the wind.
vec4 cirrus(vec3 rd, float mu) {
  float y = rd.y;
  if (uCirrus <= 0.0) return vec4(0.0);
  float t = 1.0 / (y + 0.03);
  vec2 p = rd.xz * t * 0.05 + uCirrusOffset;
  vec2 w = normalize(uWindDir + 1e-4);
  vec2 q = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
  float s = texture2D(uNoise, q * vec2(0.35, 2.4)).g;
  float s2 = texture2D(uNoise, q * vec2(1.1, 6.0) + 0.5).b;
  float m = texture2D(uNoise, p * 0.25 + 0.7).r;
  float dens = smoothstep(0.52, 0.85, s * 0.7 + s2 * 0.3) * smoothstep(0.35, 0.7, m);
  dens *= uCirrus * smoothstep(0.0, 0.12, y);
  vec3 col = uCloudLit * 1.15 + uSunDisk * 0.004 * hg(mu, 0.6);
  return vec4(col, dens * 0.75);
}

void main() {
  vec3 rd = normalize(vDir);
  float mu = dot(rd, uSunDir);
  float y = rd.y;
  float yy = max(y, 0.0);

  // Gradient: rich zenith blue down to a horizon built from the fog in-scatter color, so the
  // sky meets fogged terrain without a seam.
  // Three stops (horizon, pale middle, zenith) so warm sunset horizons pass through pale gold
  // into blue instead of mixing through lavender.
  vec3 fogL = mzFogInscatter(rd);
  vec3 hor = mix(uHorizon, fogL, 0.7);
  float t = pow(yy, 0.4);
  float hl = dot(hor, vec3(0.3, 0.5, 0.2));
  vec3 mid = mix(vec3(hl) * vec3(0.96, 1.0, 1.06), uZenith, 0.45);
  mid = mix(mid, hor, 0.25);
  vec3 sky = mix(hor, mid, smoothstep(0.0, 0.5, t));
  sky = mix(sky, uZenith, smoothstep(0.35, 1.0, t));
  sky *= 1.0 + 0.12 * exp(-yy * 18.0);

  // Warm horizon on the sun side, Mie glow around the sun.
  vec2 rxz = normalize(rd.xz + 1e-5);
  vec2 sxz = normalize(uSunDir.xz + 1e-5);
  float az = dot(rxz, sxz) * 0.5 + 0.5;
  float sunUp = smoothstep(-0.2, 0.05, uSunDir.y);
  sky += uGlowColor * uGlowI * pow(az, 4.0) * exp(-yy * 7.0) * 0.55 * sunUp;
  sky += uGlowColor * uGlowI * (hg(mu, 0.8) * 0.05 + hg(mu, 0.35) * 0.18) * sunUp;

  // Twilight: pink anti-twilight arch (Belt of Venus) above the bluish earth shadow.
  float anti = pow(1.0 - az, 2.0);
  float belt = exp(-pow((y - 0.1) / 0.07, 2.0));
  sky += vec3(0.32, 0.17, 0.22) * belt * anti * uTwilight * 0.5 * uHorizon.b * 4.0;
  sky *= 1.0 - 0.25 * anti * uTwilight * smoothstep(0.08, 0.0, y);

  // Night: stars, aurora, moon. Hidden by clouds and fog below.
  vec3 night = vec3(0.0);
  float moonCover = 0.0;
  if (uStars > 0.001) night += stars(rd) * uStars * smoothstep(0.0, 0.2, y) * (1.0 - uEnvMode);
  if (uAurora > 0.001) night += aurora(rd);
  night += moon(rd, moonCover);
  sky += night;

  // Clouds.
  float sunMask = 1.0;
  if (y > 0.0) {
    vec4 ci = cirrus(rd, mu);
    sky = mix(sky, ci.rgb, ci.a);
    vec4 cl = cloudDeck(rd, mu);
    sky = mix(sky, cl.rgb, cl.a);
    sunMask = (1.0 - cl.a) * (1.0 - ci.a * 0.5);
  }

  // Environment capture: the lower hemisphere is sunlit snow.
  if (uEnvMode > 0.5 && y < 0.0) sky = uGroundColor;

  // Fog over the whole dome with an "infinite" ray, matching distant terrain.
  float dist = uEnvMode > 0.5 && y < 0.0 ? min(60.0 / max(-y, 0.01), 20000.0) : 30000.0;
  // The dome already contains the clear-air scattering, so the aerial haze counts only
  // partly here; ground fog, lake fog and storms count fully.
  float od = mzExpOD(uFogDensity, uFogHeightFalloff, uFogBaseHeight, cameraPosition.y, rd.y, dist)
           + mzExpOD(uFogHaze.x, uFogHaze.y, 0.0, cameraPosition.y, rd.y, dist) * mix(uSkyFog, 1.0, step(y, 0.0))
           + mzLayerOD(cameraPosition, rd, dist);
  float T = exp(-od);
  vec3 col = sky * T + fogL * (1.0 - T);

  // Sun disk on top, dimmed by the air and by clouds. Through a thin deck it is a pale smudge.
  float sd = sqrt(max(2.0 * (1.0 - mu), 0.0));
  float disk = smoothstep(uSunSize, uSunSize * 0.82, sd);
  float limb = 1.0 - 0.35 * pow(clamp(sd / uSunSize, 0.0, 1.0), 2.0);
  float vis = uSunVis * sunMask * pow(T, 0.35) * smoothstep(-0.012, 0.004, y) * (1.0 - uEnvMode * 0.85);
  col += uSunDisk * disk * limb * vis;
  float smudge = exp(-sd * sd / 0.004) * uOvercast * (1.0 - uOvercast * 0.6) * smoothstep(-0.05, 0.05, uSunDir.y);
  col += uSunDisk * 0.004 * smudge;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
