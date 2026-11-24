import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const TIMES = {
  morning: { label: 'Morning', elev: 11, az: 105, turb: 9, ray: 2.4, mie: 0.006, exposure: 0.62, sun: 2.6, sunCol: 0xffdcb0, hemi: 0.45, hemiSky: 0xc9dcff, hemiGround: 0x6d6a3c, fog: 0xc8cbc0, fogD: 0.00042, env: 0.9, clock: '07:20', night: false },
  noon: { label: 'Noon', elev: 58, az: 170, turb: 6, ray: 1.6, mie: 0.005, exposure: 0.5, sun: 3.4, sunCol: 0xfff6e8, hemi: 0.5, hemiSky: 0xcfe0ff, hemiGround: 0x6f6d40, fog: 0xc6d2dc, fogD: 0.00035, env: 0.9, clock: '12:30', night: false },
  evening: { label: 'Evening', elev: 3.5, az: 255, turb: 11, ray: 3.2, mie: 0.008, exposure: 0.7, sun: 2.0, sunCol: 0xff9a55, hemi: 0.35, hemiSky: 0xffc2a0, hemiGround: 0x4f4430, fog: 0xd6ae90, fogD: 0.00048, env: 0.8, clock: '17:45', night: false },
  night: { label: 'Night', elev: -12, az: 280, turb: 4, ray: 0.6, mie: 0.004, exposure: 1.0, sun: 0.22, sunCol: 0x9db4ff, hemi: 0.16, hemiSky: 0x40507a, hemiGround: 0x15140f, fog: 0x0b0f17, fogD: 0.0006, env: 0.5, clock: '22:10', night: true },
};
export const TIME_ORDER = ['morning', 'noon', 'evening', 'night'];

export class SkySystem {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    this.sky.material.uniforms.cloudCoverage.value = 0.32;
    this.sky.material.uniforms.cloudDensity.value = 0.35;
    this.sky.material.uniforms.cloudElevation.value = 0.55;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow;
    sc.mapSize.set(quality.shadow, quality.shadow);
    const a = quality.shadowArea;
    Object.assign(sc.camera, { left: -a, right: a, top: a, bottom: -a, near: 1, far: 600 });
    sc.bias = -0.0004;
    sc.normalBias = 0.04;
    this.shadowArea = a;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6f6d40, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xc6d2dc, 0.0004);

    // stars
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.05;
      v.normalize().multiplyScalar(900);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    this.stars.visible = false;
    scene.add(this.stars);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.skyScene = new THREE.Scene();
    this.sunDir = new THREE.Vector3();
    this.envRT = null;
  }

  set(timeKey) {
    const t = TIMES[timeKey];
    this.timeKey = timeKey;
    this.preset = t;
    const u = this.sky.material.uniforms;
    u.turbidity.value = t.turb;
    u.rayleigh.value = t.ray;
    u.mieCoefficient.value = t.mie;
    u.mieDirectionalG.value = 0.8;
    u.cloudCoverage.value = t.night ? 0.15 : 0.32;
    const phi = THREE.MathUtils.degToRad(90 - t.elev);
    const theta = THREE.MathUtils.degToRad(t.az);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.renderer.toneMappingExposure = t.exposure;

    // light comes from the sun by day, from a high moon at night
    this.lightDir = t.night ? new THREE.Vector3(0.3, 0.8, 0.4).normalize() : this.sunDir.clone();
    if (this.lightDir.y < 0.08) this.lightDir.y = 0.08;
    this.lightDir.normalize();
    this.sun.color.setHex(t.sunCol);
    this.sun.intensity = t.sun;
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemi;
    this.scene.fog.color.setHex(t.fog);
    this.scene.fog.density = t.fogD;
    this.stars.visible = t.night;

    // environment map: a controlled sky gradient (the physical Sky shader is far too bright as an env map)
    this.buildEnvScene(t);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0.02, 0.1, 500);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = t.env;
  }

  buildEnvScene(t) {
    if (this.envMesh) { this.skyScene.remove(this.envMesh); this.envMesh.geometry.dispose(); }
    const g = new THREE.SphereGeometry(100, 48, 24);
    const top = new THREE.Color(t.hemiSky), hor = new THREE.Color(t.fog), gnd = new THREE.Color(t.hemiGround), sun = new THREE.Color(t.sunCol);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      if (v.y >= 0) c.copy(hor).lerp(top, Math.pow(v.y, 0.6));
      else c.copy(hor).lerp(gnd, Math.min(1, -v.y * 5));
      // warm glow around the sun
      const glow = Math.pow(Math.max(0, v.dot(this.sunDir)), 24) * (t.night ? 0 : 1.5);
      c.r += sun.r * glow; c.g += sun.g * glow; c.b += sun.b * glow;
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.envMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    this.skyScene.add(this.envMesh);
  }

  update(dt, focus, camera) {
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.sky.material.uniforms.time.value += dt;
    // shadow box follows the bus, snapped to texels to avoid shimmering
    const texel = (this.shadowArea * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.lightDir.x * 300, this.lightDir.y * 300, fz + this.lightDir.z * 300);
  }
}
