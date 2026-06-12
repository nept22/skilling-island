import * as THREE from 'three';

// The "Webfishing" look: render the 3D scene into a low internal resolution,
// then upscale to the canvas with nearest-neighbour filtering. Smooth geometry
// gets a chunky, hand-pixelled grid — and because the HUD is separate HTML, the
// UI stays crisp while only the world pixelates.
//
// `pixelScale` is how many screen pixels each rendered pixel becomes (an integer
// block). Lower = sharper / higher-res, higher = chunkier. Using an integer
// block — plus rendering at 1:1 device pixels and a hard-edged canvas — keeps
// the pixels uniform and crisp instead of the fractional smear you get from a
// non-integer internal resolution.
//
// The blit pass also posterizes color and adds ordered (Bayer) dithering in
// low-res pixel space so the dither dots align with the chunky pixels. Press T
// in-game to toggle the style pass on/off.

// 4×4 Bayer ordered dithering threshold matrix, mapped to [0, 255].
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayerData = new Uint8Array(BAYER.map((v) => Math.round(((v + 0.5) / 16) * 255)));
const bayerTex = new THREE.DataTexture(bayerData, 4, 4, THREE.RedFormat);
bayerTex.wrapS = bayerTex.wrapT = THREE.RepeatWrapping;
bayerTex.minFilter = bayerTex.magFilter = THREE.NearestFilter;
bayerTex.needsUpdate = true;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBayer;
uniform vec2 uInternalRes;
uniform float uColorLevels;
uniform float uDitherStrength;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (uDitherStrength > 0.0) {
    // Threshold in low-res pixel space so dither dots match the chunky pixels.
    vec2 px = floor(vUv * uInternalRes);
    float threshold = texture2D(tBayer, (px + 0.5) / 4.0).r - 0.5;
    c += threshold * (uDitherStrength / uColorLevels);
  }
  c = floor(c * uColorLevels + 0.5) / uColorLevels;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class PixelRenderer {
  enabled = true;

  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private quadMaterial: THREE.ShaderMaterial;

  // Style-pass tunables. Private fields hold the configured values so toggling
  // styleEnabled round-trips back to them without loss.
  private _colorLevels = 40;
  private _ditherStrength = 0.5;
  private _styleEnabled = true;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private pixelScale = 3,
  ) {
    // Crispness: render at 1:1 device pixels (no 2x backbuffer that the browser
    // then bilinear-shrinks) and tell the browser not to smooth the canvas, so
    // the only scaling is our own nearest-neighbour blit.
    renderer.setPixelRatio(1);
    renderer.domElement.style.imageRendering = 'pixelated';

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });

    this.quadMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        tBayer: { value: bayerTex },
        uInternalRes: { value: new THREE.Vector2(1, 1) },
        uColorLevels: { value: this._colorLevels },
        uDitherStrength: { value: this._ditherStrength },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMaterial));
    this.quadCamera.position.z = 1;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w: number, h: number): void {
    // Ignore degenerate sizes (e.g. a transient 0/1px resize) — they'd collapse
    // the internal target to a sliver.
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h);
    const iw = Math.max(2, Math.round(w / this.pixelScale));
    const ih = Math.max(2, Math.round(h / this.pixelScale));
    this.target.setSize(iw, ih);
    // Keep the dither aligned to the actual internal resolution.
    (this.quadMaterial.uniforms.uInternalRes.value as THREE.Vector2).set(iw, ih);
  }

  // Live-tunable from the console: __game.pixel.setPixelScale(2) for sharper,
  // 4 for chunkier.
  setPixelScale(scale: number): void {
    this.pixelScale = Math.max(1, Math.round(scale));
    this.setSize(window.innerWidth, window.innerHeight);
  }

  // Clamp to [2, 256] — fewer steps look solarised, more is indistinguishable.
  setColorLevels(n: number): void {
    this._colorLevels = Math.max(2, Math.min(256, n));
    if (this._styleEnabled) {
      this.quadMaterial.uniforms.uColorLevels.value = this._colorLevels;
    }
  }

  // Clamp to [0, 1] — 0 disables dithering entirely.
  setDitherStrength(s: number): void {
    this._ditherStrength = Math.max(0, Math.min(1, s));
    if (this._styleEnabled) {
      this.quadMaterial.uniforms.uDitherStrength.value = this._ditherStrength;
    }
  }

  // Toggle the posterize + dither style pass. When off, uniforms are set to
  // neutral values (full color depth, no dither) so the blit is a plain copy.
  get styleEnabled(): boolean {
    return this._styleEnabled;
  }

  set styleEnabled(on: boolean) {
    this._styleEnabled = on;
    if (on) {
      this.quadMaterial.uniforms.uColorLevels.value = this._colorLevels;
      this.quadMaterial.uniforms.uDitherStrength.value = this._ditherStrength;
    } else {
      this.quadMaterial.uniforms.uColorLevels.value = 256;
      this.quadMaterial.uniforms.uDitherStrength.value = 0;
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}
