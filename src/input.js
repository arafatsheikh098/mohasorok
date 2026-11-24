// Keyboard + gamepad input with smoothing for keyboard steering.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();     // edge-triggered this frame
    this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = false; this.horn = false;
    this.mouse = { dx: 0, dy: 0, down: false, wheel: 0 };
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', (e) => { if (e.target.tagName === 'CANVAS') this.mouse.down = true; });
    addEventListener('mouseup', () => (this.mouse.down = false));
    addEventListener('mousemove', (e) => {
      if (this.mouse.down || document.pointerLockElement) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    addEventListener('wheel', (e) => { this.mouse.wheel += e.deltaY; }, { passive: true });
  }

  has(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }

  update(dt) {
    const left = this.has('KeyA', 'ArrowLeft'), right = this.has('KeyD', 'ArrowRight');
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    // keyboard steering ramps in/out (bus wheels are heavy)
    const rate = target === 0 ? 3.2 : 1.9;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    if (Math.abs(this.steer) < 0.01 && target === 0) this.steer = 0;
    this.throttle = this.has('KeyW', 'ArrowUp') ? 1 : 0;
    this.brake = this.has('KeyS', 'ArrowDown') ? 1 : 0;
    this.handbrake = this.has('Space');
    this.horn = this.has('KeyH');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.08) this.steer = -Math.sign(ax) * ((Math.abs(ax) - 0.08) / 0.92) ** 1.4;
      const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
      if (rt > 0.05) this.throttle = rt;
      if (lt > 0.05) this.brake = lt;
      if (gp.buttons[0]?.pressed) this.horn = true;
      if (gp.buttons[1]?.pressed) this.handbrake = true;
      const cx = gp.axes[2] || 0, cy = gp.axes[3] || 0;
      if (Math.abs(cx) > 0.15) this.mouse.dx += cx * 12;
      if (Math.abs(cy) > 0.15) this.mouse.dy += cy * 8;
    }
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
  }
}
