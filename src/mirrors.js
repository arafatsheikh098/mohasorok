import * as THREE from 'three';

// Live rear-view mirrors. Each bull-horn mirror glass gets its own camera that
// looks along the reflection of the driver's line of sight (convex-mirror FOV),
// rendered into a texture shown on the glass and, optionally, in the HUD.
export class Mirrors {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.items = [];
    this.hudOn = true;        // screen mirrors in outside views
    this.hudCabin = false;    // and in the cab (the bus's own mirrors are visible there)
    this.frame = 0;
    // HUD overlay
    this.hudScene = new THREE.Scene();
    this.hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.tmp = { p: new THREE.Vector3(), n: new THREE.Vector3(), e: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3() };
  }

  attach(bus) {
    for (const it of this.items) { it.rt.dispose(); this.hudScene.remove(it.hud, it.frame); }
    this.items = [];
    this.bus = bus;
    for (const glass of bus.mirrorGlass) {
      const { w, h, side } = glass.userData;
      const rt = new THREE.WebGLRenderTarget(Math.round(360 * w / h), 360, { samples: 2 });
      const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 900);
      const tex = rt.texture;
      glass.material = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, dim: { value: 0.9 } },
        vertexShader: [
          '#include <common>', '#include <logdepthbuf_pars_vertex>', 'varying vec2 vUv;', 'void main() {',
          '  vUv = vec2(1.0 - uv.x, uv.y);', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '  #include <logdepthbuf_vertex>', '}',
        ].join('\n'),
        fragmentShader: [
          '#include <common>', '#include <logdepthbuf_pars_fragment>',
          'uniform sampler2D map;', 'uniform float dim;', 'varying vec2 vUv;', 'void main() {', '  #include <logdepthbuf_fragment>',
          '  vec4 c = texture2D(map, vUv);', '  gl_FragColor = vec4(c.rgb * dim, 1.0);',
          '  #include <tonemapping_fragment>', '  #include <colorspace_fragment>', '}',
        ].join('\n'),
        toneMapped: true,
      });
      // HUD quad
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b0d10 }));
      const hud = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glass.material);
      this.hudScene.add(frame, hud);
      this.items.push({ glass, rt, cam, side, hud, frame, aspect: w / h });
    }
  }

  layoutHUD(W, H) {
    this.hudCam.left = 0; this.hudCam.right = W; this.hudCam.top = H; this.hudCam.bottom = 0;
    this.hudCam.updateProjectionMatrix();
    const mh = Math.min(260, H * 0.3), mw = mh * (this.items[0]?.aspect || 0.55);
    for (const it of this.items) {
      // driver-side (right, side -1) mirror on the right edge, kerb-side on the left
      const x = it.side < 0 ? W - 18 - mw / 2 : 18 + mw / 2;
      const y = H - 270 - mh / 2;
      it.hud.position.set(x, y, 0); it.hud.scale.set(mw, mh, 1);
      it.frame.position.set(x, y, -0.1); it.frame.scale.set(mw + 8, mh + 8, 1);
    }
  }

  // eye: world position of the driver's eye
  update(eye, needGlass, needHud) {
    if (!this.items.length || (!needGlass && !needHud)) return;
    // on phones refresh the mirrors every other frame
    this.frame++;
    if (this.lowRes && this.frame % 2) return;
    const { p, n, e } = this.tmp;
    const r = this.renderer;
    const prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    for (const it of this.items) it.glass.visible = false;
    for (const it of this.items) {
      it.glass.updateWorldMatrix(true, false);
      it.glass.getWorldPosition(p);
      n.set(0, 0, 1).transformDirection(it.glass.matrixWorld);
      // reflect the view ray off the glass
      e.copy(p).sub(eye).normalize();
      e.addScaledVector(n, -2 * e.dot(n));
      it.cam.position.copy(p).addScaledVector(n, 0.02);
      it.cam.up.set(0, 1, 0).transformDirection(this.bus.body.matrixWorld);
      it.cam.lookAt(p.clone().add(e));
      it.cam.updateMatrixWorld();
      r.setRenderTarget(it.rt);
      r.render(this.scene, it.cam);
    }
    r.setRenderTarget(null);
    for (const it of this.items) it.glass.visible = true;
    r.shadowMap.autoUpdate = prevAuto;
  }

  renderHUD() {
    if (!this.items.length) return;
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.hudScene, this.hudCam);
    r.autoClear = ac;
  }
}
