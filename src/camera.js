import * as THREE from 'three';

export const CAM_MODES = ['chase', 'cabin', 'bumper', 'cinematic'];
const CAM_LABEL = { chase: 'Chase camera', cabin: 'Cabin (driver seat)', bumper: 'Bumper camera', cinematic: 'Roadside cinematic' };

export class CameraRig {
  constructor(camera, route) {
    this.camera = camera;
    this.route = route;
    this.mode = 'chase';
    this.orbitYaw = 0; this.orbitPitch = 0.22; this.dist = 19;
    this.headYaw = 0; this.headPitch = -0.14;
    this.smoothYaw = 0;
    this.shake = 0;
    this.cine = new THREE.Vector3();
    this.cineS = -1e9;
    this.tmp = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.first = true;
  }

  label() { return CAM_LABEL[this.mode]; }

  setMode(m) {
    this.mode = m;
    this.first = true;
    this.cineS = -1e9;
    this.camera.fov = m === 'cabin' ? 72 : m === 'bumper' ? 70 : 58;
    this.camera.updateProjectionMatrix();
  }

  next() { this.setMode(CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length]); }

  update(dt, bus, phys, input, playerS) {
    const cam = this.camera;
    const spec = bus.spec;
    const fwd = phys.forward(this.tmp.clone());
    const center = phys.pos.clone().addScaledVector(fwd, spec.center);
    center.y = bus.root.position.y;
    const m = input.mouse;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;

    if (this.mode === 'chase') {
      this.orbitYaw -= m.dx * 0.005;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + m.dy * 0.003, 0.02, 1.2);
      this.dist = THREE.MathUtils.clamp(this.dist * (1 + m.wheel * 0.001), 9, 60);
      if (!m.down) this.orbitYaw *= Math.pow(0.35, dt); // drift back behind the bus
      // heading lags behind the bus a little (ETS2-like)
      let dy = phys.yaw - this.smoothYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.smoothYaw += this.first ? dy : dy * Math.min(1, dt * 2.5);
      const yaw = this.smoothYaw + this.orbitYaw + (phys.v < -0.5 ? 0 : 0);
      const h = this.dist * Math.sin(this.orbitPitch) + 2.5;
      const back = this.dist * Math.cos(this.orbitPitch);
      const target = center.clone().add(new THREE.Vector3(0, 2.2, 0));
      const pos = target.clone().add(new THREE.Vector3(-Math.sin(yaw) * back, h, -Math.cos(yaw) * back));
      const pr = this.route.project(pos.x, pos.z, Math.round(playerS / this.route.DS));
      const ground = this.route.heightAt(pr.s, pr.d);
      pos.y = Math.max(pos.y, ground + 1.2);
      if (this.first) cam.position.copy(pos);
      else cam.position.lerp(pos, Math.min(1, dt * 10));
      cam.lookAt(target);
    } else if (this.mode === 'cabin' || this.mode === 'bumper') {
      bus.body.updateWorldMatrix(true, false);
      const local = this.mode === 'cabin' ? bus.driver.clone() : new THREE.Vector3(0, 1.3, spec.front + 0.4);
      if (this.mode === 'cabin') {
        this.headYaw = THREE.MathUtils.clamp(this.headYaw - m.dx * 0.004, -2.6, 2.6);
        this.headPitch = THREE.MathUtils.clamp(this.headPitch - m.dy * 0.003, -0.9, 0.6);
        if (!m.down && Math.abs(this.headYaw) < 0.6) this.headYaw *= Math.pow(0.5, dt);
        // lean the head with the body and look into turns
        local.x += THREE.MathUtils.clamp(-phys.latAcc * 0.012, -0.08, 0.08);
        local.z += THREE.MathUtils.clamp(-phys.lonAcc * 0.01, -0.06, 0.06);
      }
      cam.position.copy(local.applyMatrix4(bus.body.matrixWorld));
      const bodyQ = bus.body.getWorldQuaternion(this.tmpQ);
      const lookYaw = this.mode === 'cabin' ? this.headYaw + phys.steer * 0.25 : 0;
      const head = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.mode === 'cabin' ? this.headPitch : -0.03, Math.PI + lookYaw, 0, 'YXZ'));
      cam.quaternion.copy(bodyQ).multiply(head);
    } else {
      // roadside camera that leapfrogs ahead of the bus
      if (playerS - this.cineS > 70 || this.cineS - playerS > 260 || this.first) {
        this.cineS = playerS + 140 + Math.random() * 60;
        const side = Math.random() < 0.6 ? -1 : 1;
        this.route.pointAt(this.cineS, side * (14 + Math.random() * 10), this.cine);
        this.cine.y = this.route.heightAt(this.cineS, side * 14) + 1.6 + Math.random() * 4;
      }
      cam.position.copy(this.cine);
      cam.lookAt(center.clone().add(new THREE.Vector3(0, 1.8, 0)));
      cam.fov = THREE.MathUtils.clamp(2 * Math.atan(10 / cam.position.distanceTo(center)) * 57.3, 12, 60);
      cam.updateProjectionMatrix();
    }
    if (sh > 0) {
      cam.position.x += (Math.random() - 0.5) * sh * 0.6;
      cam.position.y += (Math.random() - 0.5) * sh * 0.6;
    }
    // road vibration in the cabin
    if (this.mode === 'cabin' && Math.abs(phys.v) > 1) cam.position.y += Math.sin(performance.now() * 0.03) * 0.002 * Math.min(1, Math.abs(phys.v) / 20);
    this.first = false;
  }
}
