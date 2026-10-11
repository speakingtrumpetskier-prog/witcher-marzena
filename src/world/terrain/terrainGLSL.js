// GLSL shared by the terrain, ice, river and waterfall shaders: sampling of the baked height,
// normal and mask textures with the exact triangulation of World.terrainAt.
//
// Uniforms (created by Terrain.js, see terrainUniforms()):
//   uMzNearH, uMzFarH   R32F heights (near 1.5625 m over +-800, far 6.25 m over +-4000)
//   uMzNearN, uMzFarN   RGBA8: rg = world normal xz, b = small concavity, a = large concavity
//   uMzMask             RGBA8 near masks: r signed road distance, g road half width,
//                       b lake SDF, a river distance
//   uMzNear, uMzFar     vec4(half, res, 1/cell, cell)
import * as THREE from 'three';

export function terrainUniforms(t) {
  return {
    uMzNearH: { value: t.nearH },
    uMzFarH: { value: t.farH },
    uMzNearN: { value: t.nearN },
    uMzFarN: { value: t.farN },
    uMzMask: { value: t.mask },
    uMzNear: { value: new THREE.Vector4(t.near.half, t.near.res, 1 / t.near.cell, t.near.cell) },
    uMzFar: { value: new THREE.Vector4(t.far.half, t.far.res, 1 / t.far.cell, t.far.cell) },
  };
}

export const TERRAIN_UNIFORM_NAMES = ['uMzNearH', 'uMzFarH', 'uMzNearN', 'uMzFarN', 'uMzMask', 'uMzNear', 'uMzFar'];

export const TERRAIN_SAMPLE_GLSL = /* glsl */ `
#ifndef MZ_TERRAIN_SAMPLE
#define MZ_TERRAIN_SAMPLE
uniform highp sampler2D uMzNearH;
uniform highp sampler2D uMzFarH;
uniform sampler2D uMzNearN;
uniform sampler2D uMzFarN;
uniform sampler2D uMzMask;
uniform vec4 uMzNear;
uniform vec4 uMzFar;

float mzTexH(highp sampler2D t, vec4 inf, vec2 xz) {
  vec2 f = clamp((xz + inf.x) * inf.z, vec2(0.0), vec2(inf.y - 1.0001));
  vec2 rf = floor(f + 0.5);
  if (all(lessThan(abs(f - rf), vec2(1e-3)))) return texelFetch(t, ivec2(rf), 0).r;
  vec2 i = floor(f);
  vec2 tt = f - i;
  ivec2 ii = ivec2(i);
  float a = texelFetch(t, ii, 0).r;
  float b = texelFetch(t, ii + ivec2(1, 0), 0).r;
  float c = texelFetch(t, ii + ivec2(0, 1), 0).r;
  float d = texelFetch(t, ii + ivec2(1, 1), 0).r;
  return (tt.x + tt.y <= 1.0) ? a + (b - a) * tt.x + (c - a) * tt.y
                              : d + (c - d) * (1.0 - tt.x) + (b - d) * (1.0 - tt.y);
}
// Terrain height (same triangles as World.terrainAt).
float mzHeight(vec2 xz) {
  vec2 a = abs(xz);
  if (max(a.x, a.y) <= uMzNear.x) return mzTexH(uMzNearH, uMzNear, xz);
  return mzTexH(uMzFarH, uMzFar, xz);
}
vec2 mzTexUV(vec4 inf, vec2 xz) {
  return ((xz + inf.x) * inf.z + 0.5) / inf.y;
}
// Normal texture: xyz world normal, w small concavity (m), plus large concavity in the out.
vec4 mzDecodeN(vec4 t, out float large) {
  vec2 nxz = t.rg * 2.0 - 1.0;
  large = (t.a - 0.5) * 24.0;
  return vec4(nxz.x, sqrt(max(0.0, 1.0 - dot(nxz, nxz))), nxz.y, (t.b - 0.5) * 4.0);
}
vec4 mzTerrainNormal(vec2 xz, out float large) {
  vec2 a = abs(xz);
  float m = max(a.x, a.y);
  if (m >= uMzNear.x) return mzDecodeN(texture(uMzFarN, mzTexUV(uMzFar, xz)), large);
  vec4 tn = texture(uMzNearN, mzTexUV(uMzNear, xz));
  if (m < uMzNear.x - 40.0) return mzDecodeN(tn, large);
  vec4 tf = texture(uMzFarN, mzTexUV(uMzFar, xz));
  float w = smoothstep(uMzNear.x - 40.0, uMzNear.x, m);
  vec4 r = mzDecodeN(mix(tn, tf, w), large);
  r.xyz = normalize(r.xyz);
  return r;
}
vec4 mzTerrainNormalLod(vec2 xz, float lod) {
  vec2 a = abs(xz);
  vec4 t = max(a.x, a.y) <= uMzNear.x ? textureLod(uMzNearN, mzTexUV(uMzNear, xz), lod) : textureLod(uMzFarN, mzTexUV(uMzFar, xz), lod);
  vec2 nxz = t.rg * 2.0 - 1.0;
  return vec4(nxz.x, sqrt(max(0.0, 1.0 - dot(nxz, nxz))), nxz.y, 0.0);
}
// Masks in meters: x signed road distance, y road half width, z lake SDF, w river distance.
vec4 mzTerrainMask(vec2 xz) {
  vec2 a = abs(xz);
  if (max(a.x, a.y) >= uMzNear.x - 2.0) return vec4(8.0, 0.0, 64.0, 40.0);
  vec4 t = texture(uMzMask, mzTexUV(uMzNear, xz));
  return vec4((t.r - 0.5) * 16.0, t.g * (255.0 / 32.0), t.b * 96.0 - 32.0, t.a * 40.0);
}
#endif
`;
