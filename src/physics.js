// Simple but weighty bus dynamics: kinematic bicycle model around the rear axle,
// torque curve + 6-speed automatic gearbox, air brakes, aero + rolling drag.
import * as THREE from 'three';

const GEARS = [5.0, 3.1, 2.05, 1.45, 1.05, 0.74];
const REV = 4.8;
const FINAL = 3.6;
const G = 9.81;
const TORQUE = [[500, 900], [800, 1500], [1100, 1950], [1500, 1950], [1900, 1750], [2300, 1450], [2600, 0]];

function torqueAt(rpm) {
  for (let i = 0; i < TORQUE.length - 1; i++) {
    const [r0, t0] = TORQUE[i], [r1, t1] = TORQUE[i + 1];
    if (rpm <= r1) return t0 + ((t1 - t0) * (Math.max(rpm, r0) - r0)) / (r1 - r0);
  }
  return 0;
}

export class BusPhysics {
  constructor(spec) {
    this.spec = spec;
    this.mass = spec.mass;
    this.torqueScale = spec.power / 300;
    this.wheelR = spec.wheelR;
    this.wheelbase = spec.wheelbase;
    this.pos = new THREE.Vector3();   // rear axle, ground
    this.yaw = 0;
    this.v = 0;                       // m/s along heading (negative = reversing)
    this.steer = 0;                   // front wheel angle (rad)
    this.gear = 1;                    // -1 = R
    this.rpm = 600;
    this.shiftTimer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.roll = 0; this.pitch = 0;
    this.latAcc = 0; this.lonAcc = 0;
    this.wheelSpin = 0;
    this.reverseHold = 0;
    this.cruise = null;
    this.offroad = 0;
    this.governor = 140 / 3.6;      // top speed limiter
  }

  place(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.v = 0; this.steer = 0; this.gear = 1; this.rpm = 600;
    this.cruise = null;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt, input) {
    const spec = this.spec;
    let thr = input.throttle, brk = input.brake;
    const speed = Math.abs(this.v);

    // auto reverse: hold brake while stopped
    if (this.gear > 0) {
      if (speed < 0.3 && brk > 0.5 && thr < 0.05) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.6) { this.gear = -1; this.reverseHold = 0; }
      } else this.reverseHold = 0;
    } else {
      if (speed < 0.3 && thr > 0.5 && brk < 0.05) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.3) { this.gear = 1; this.reverseHold = 0; }
      } else this.reverseHold = 0;
      // in reverse: S drives backwards, W brakes
      [thr, brk] = [brk, thr];
    }

    // cruise control
    if (this.cruise != null) {
      if (brk > 0.1 || this.gear < 0) this.cruise = null;
      else if (thr < 0.05) thr = THREE.MathUtils.clamp((this.cruise - this.v) * 0.6, 0, 1);
    }
    this.throttle = thr;
    this.brake = brk;

    // gearbox
    const wheelRpm = (speed / this.wheelR) * (60 / (2 * Math.PI));
    const ratio = this.gear < 0 ? REV : GEARS[this.gear - 1];
    let engineRpm = wheelRpm * ratio * FINAL;
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    if (this.gear > 0 && this.shiftTimer <= 0) {
      if (engineRpm > 1750 && this.gear < GEARS.length) { this.gear++; this.shiftTimer = 0.45; }
      else if (engineRpm < 950 && this.gear > 1) { this.gear--; this.shiftTimer = 0.35; }
    }
    const idle = 600;
    const clutchRpm = Math.max(engineRpm, idle + thr * 700);
    this.rpm += (clutchRpm - this.rpm) * Math.min(1, dt * 6);

    let drive = 0;
    if (this.shiftTimer <= 0 && thr > 0) {
      const T = torqueAt(this.rpm) * this.torqueScale;
      drive = (thr * T * ratio * FINAL * 0.88) / this.wheelR;
      if (this.gear > 0 && this.v > this.governor) drive *= Math.max(0, 1 - (this.v - this.governor) * 2);
      if (this.gear < 0 && speed > 4) drive = 0;
    }
    const dir = this.gear < 0 ? -1 : 1;
    const sgn = Math.sign(this.v) || dir;
    const aero = 0.5 * 1.2 * 0.6 * 8.2 * this.v * this.v;
    const roll = (0.009 + this.offroad * 0.05) * this.mass * G;
    const brakeF = brk * 6.5 * this.mass + (input.handbrake ? 4 * this.mass : 0);
    // engine braking / retarder when off throttle
    const engBrake = thr < 0.05 && speed > 1 ? 0.25 * this.mass * (this.gear > 0 ? 1 / this.gear + 0.15 : 0.2) : 0;

    const push = (dir * drive) / this.mass;
    const resist = (aero + roll + brakeF + engBrake) / this.mass;
    const v0 = this.v;
    if (speed > 0.05) {
      // resistances oppose motion and can stop the bus, never push it backwards
      const nv = v0 + (push - sgn * resist) * dt;
      this.v = Math.sign(nv) !== Math.sign(v0) && Math.abs(push) < resist ? 0 : nv;
    } else if (Math.abs(push) > resist) {
      this.v = v0 + (push - Math.sign(push) * resist) * dt;
    } else this.v = 0;
    this.lonAcc = (this.v - v0) / Math.max(dt, 1e-4);

    // steering: speed-sensitive lock sized so full lock always gives ~6 m/s² of cornering
    // (about 0.6 g, what a coach on good tyres can hold). Before, a grip cap and an extra
    // understeer factor stacked up to only ~3 m/s² at 90 km/h, so curves and quick
    // overtakes could not be made.
    const under = 1 / (1 + (speed / 40) ** 2 * 0.5);
    const A_MAX = 6.0;
    const maxSteer = Math.min(0.62 / (1 + (speed / 14) ** 2), Math.atan((A_MAX * this.wheelbase) / Math.max(1, speed * speed * under)));
    this.maxSteer = maxSteer;
    const target = input.steer * maxSteer;
    const rate = (input.steer === 0 ? 2.4 : 1.8) * (1 / (1 + speed / 25)) + 0.5;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate * dt, rate * dt);

    const yawRate = (this.v * Math.tan(this.steer) * under) / this.wheelbase;
    this.yaw += yawRate * dt;
    this.latAcc = this.v * yawRate;
    this.pos.x += Math.sin(this.yaw) * this.v * dt;
    this.pos.z += Math.cos(this.yaw) * this.v * dt;

    // body motion (springy)
    const rollT = THREE.MathUtils.clamp(this.latAcc * 0.014, -0.07, 0.07); // lean to the outside of the turn
    const pitchT = THREE.MathUtils.clamp(-this.lonAcc * 0.006, -0.04, 0.04);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 3.5);
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 4);
    this.wheelSpin += (this.v / this.wheelR) * dt;
    void spec;
  }

  gearLabel() {
    if (this.gear < 0) return 'R';
    if (Math.abs(this.v) < 0.2 && this.throttle < 0.05) return 'N';
    return 'D' + this.gear;
  }
}
