// Post-processing: EffectComposer with an MSAA HDR scene target (color + depth), then one
// custom pass (render/post/MzPostPass.js) for bloom, god rays, grade, tone mapping and the
// screen effects. Exposure and grade come from G.atmosphere.grade (time of day and weather).
//
// Public (G.postfx):
//   render(dt)             called by the engine every frame
//   composer, pass         the EffectComposer and the MzPostPass (insert extra passes before it)
//   frost                  0..1 ice crystals growing in from the screen edges (cold)
//   echo                   0..1 cold blue ghostly reconstruction look (echo cutscenes)
//   flash(color, seconds)  additive full-screen flash that fades out (color: hex, Color or css)
//   bloom, rays            strength multipliers (default 1)
//   SENSES_LAYER           layer number for hunter-senses clues (5)
//   markClue(obj, on = true, color = '#ff8a3d')
//                          highlight obj (and children) while uSenses > 0: a rim glow plus
//                          bloom in `color`, added after the senses desaturation so it keeps its
//                          hue (echoes: '#9ff5ff', exported as ECHO_COLOR). Dimmed where the
//                          clue is hidden behind other geometry. on = false removes it.
//                          Objects with userData.senses = true (optional userData.sensesColor)
//                          are picked up automatically while senses are on.
// Reads uSenses (0..1). G.quality 'low' disables bloom, god rays and MSAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { MzPostPass, SENSES_LAYER } from './post/MzPostPass.js';
import { getFrostTexture } from './post/frostTex.js';
import { clamp, smoothstep } from '../core/util.js';

const WHITE = new THREE.Color(1, 1, 1);
const CLUE_DEFAULT = '#ff8a3d';
export const ECHO_COLOR = '#9ff5ff';

export async function init(G) {
  const renderer = G.renderer;
  const pr = renderer.getPixelRatio();
  const size = renderer.getSize(new THREE.Vector2());
  const samples = G.quality === 'high' ? (pr > 1.25 ? 2 : 4) : G.quality === 'medium' ? 2 : 0;
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: true,
  });
  target.depthTexture = new THREE.DepthTexture(size.x * pr, size.y * pr);
  target.depthTexture.type = THREE.UnsignedIntType;
  target.texture.name = 'mz.scene';

  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);
  const renderPass = new RenderPass(G.scene, G.camera);
  const pass = new MzPostPass(G);
  pass.scene = G.scene;
  pass.camera = G.camera;
  composer.addPass(renderPass);
  composer.addPass(pass);
  pass.renderToScreen = true;

  const sunNdc = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const flashColor = new THREE.Color();
  let flashT = 0, flashDur = 0;
  let scanClock = 0;
  const st = pass.state;

  const P = {
    composer, pass, renderPass,
    frost: 0,
    echo: 0,
    bloom: 1,
    rays: 1,
    SENSES_LAYER,
    flash(color = 0xffffff, seconds = 0.6) {
      flashColor.set(color);
      flashDur = Math.max(0.01, seconds);
      flashT = flashDur;
    },
    // Hunter-senses highlight. color: hex/css/Color, default warm orange; echoes use #9ff5ff.
    markClue(obj, on = true, color = CLUE_DEFAULT) {
      if (!obj) return;
      obj.traverse((o) => (on ? o.layers.enable(SENSES_LAYER) : o.layers.disable(SENSES_LAYER)));
      if (on) pass.clues.set(obj, new THREE.Color(color));
      else pass.clues.delete(obj);
    },
    render(dt) {
      const A = G.atmosphere;
      const gr = A?.grade;
      const U = G.uniforms;
      const c = pass.composite.uniforms;
      st.exposure = gr ? gr.exposure : 1;
      if (gr) {
        // Palette colors are linear; the grade works in display space.
        c.uLift.value.copy(gr.lift).convertLinearToSRGB().multiplyScalar(0.5);
        c.uGain.value.copy(gr.gain).convertLinearToSRGB().lerp(WHITE, 0.45);
        c.uTint.value.copy(gr.tint);
        c.uSat.value = gr.sat;
        c.uContrast.value = gr.contrast;
        c.uVignette.value = gr.vignette;
        c.uGrain.value = gr.grain;
      }
      st.time = G.clock.elapsed;
      st.senses = clamp(U.uSenses.value, 0, 1);
      if (st.senses > 0.001) st.sensesTime += dt;
      else st.sensesTime = 0;
      st.echo = clamp(P.echo, 0, 1);
      st.frost = clamp(P.frost, 0, 1);
      if (st.frost > 0.001 && !st.frostTex) st.frostTex = getFrostTexture();
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt);
        const k = flashT / flashDur;
        st.flash = k * k;
        st.flashColor.copy(flashColor);
      } else st.flash = 0;

      // Clues tagged through userData get the layer automatically while senses are active.
      if (st.senses > 0.001) {
        scanClock -= dt;
        if (scanClock <= 0) {
          scanClock = 1;
          G.scene.traverse((o) => {
            if (o.userData && o.userData.senses === true && !pass.clues.has(o)) P.markClue(o, true, o.userData.sensesColor || CLUE_DEFAULT);
          });
        }
      } else scanClock = 0;

      // Bloom: gentle by day, stronger at night (windows, fires, aurora) and in the echo look.
      const night = U.uNight.value;
      st.bloom = (0.07 + 0.08 * night + 0.25 * st.echo + 0.05 * st.senses) * P.bloom;

      // God rays toward the sun when it is in front of the camera and not hidden by weather.
      const cam = G.camera;
      const sun = U.uSunDir.value;
      cam.getWorldDirection(camDir);
      let rays = 0;
      const W = G.weather?.params;
      if (sun.y > -0.03 && camDir.dot(sun) > 0.1) {
        sunNdc.copy(cam.position).addScaledVector(sun, 1000).project(cam);
        st.sunUV.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
        const off = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
        const onScreen = 1 - smoothstep(1.0, 1.6, off);
        const low = 0.6 + 0.4 * (1 - smoothstep(0.1, 0.4, sun.y));
        const sunVis = W ? W.sunVis : 1;
        const air = W ? 1 + W.fogWhite * 0.6 + W.lake * 6 : 1;
        rays = onScreen * low * sunVis * air * smoothstep(-0.03, 0.03, sun.y);
        if (A) st.raysColor.copy(A.sunLightColor);
      }
      st.rays = rays * 0.32 * P.rays;

      composer.render(dt);
    },
  };
  G.postfx = P;

  G.events.on('resize', ({ w, h }) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  });
}
