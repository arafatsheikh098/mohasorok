// On-screen controls for phones and tablets: a steering wheel you turn with a finger,
// throttle and brake pedals, and buttons for horn, door, indicators, camera, lights, mirrors, refuel, pause.
// They feed the same Input object the keyboard uses.

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const IS_PHONE = IS_TOUCH && Math.min(screen.width, screen.height) < 600;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.root = document.getElementById('touch');
    if (!IS_TOUCH || !this.root) return;
    this.root.style.display = 'block';
    this.wheel = document.getElementById('t-wheel');
    this.wheelImg = document.getElementById('t-wheel-img');
    this.angle = 0;
    this.wheelPointer = null;

    // steering wheel: rotate by dragging around its centre (±135° = full lock)
    const angleAt = (e) => {
      const r = this.wheel.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    };
    this.wheel.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.wheel.setPointerCapture(e.pointerId);
      this.wheelPointer = e.pointerId;
      this.grab = angleAt(e) - this.angle;
    });
    this.wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.wheelPointer) return;
      let a = angleAt(e) - this.grab;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      this.angle = Math.max(-2.35, Math.min(2.35, a));
    });
    const release = (e) => { if (e.pointerId === this.wheelPointer) this.wheelPointer = null; };
    this.wheel.addEventListener('pointerup', release);
    this.wheel.addEventListener('pointercancel', release);

    // pedals and hold-buttons map to keys
    const hold = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => { e.preventDefault(); el.classList.add('down'); input.keys.add(code); input.pressed.add(code); };
      const off = (e) => { e.preventDefault(); el.classList.remove('down'); input.keys.delete(code); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold('t-gas', 'KeyW');
    hold('t-brake', 'KeyS');
    hold('t-horn', 'KeyH');
    // tap buttons map to a single key press
    const tap = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressed.add(code); el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 150); });
    };
    tap('t-indl', 'KeyQ'); tap('t-indr', 'KeyE'); tap('t-door', 'KeyG'); tap('t-cam', 'KeyC'); tap('t-lights', 'KeyL');
    tap('t-mirror', 'KeyV'); tap('t-fuel', 'KeyF'); tap('t-pause', 'KeyP'); tap('t-reset', 'KeyR'); tap('t-cruise', 'KeyX'); tap('t-music', 'KeyB');
    // ☰ opens the tray of less-used buttons; it closes again after one of them is used
    const setTray = (on) => { this.root.classList.toggle('open', on); document.body.classList.toggle('tray-open', on); };
    document.getElementById('t-more')?.addEventListener('pointerdown', (e) => { e.preventDefault(); setTray(!this.root.classList.contains('open')); });
    for (const el of this.root.querySelectorAll('.tray')) el.addEventListener('pointerup', () => setTimeout(() => setTray(false), 160));

    // one finger dragging on the 3D view looks around (camera)
    const view = document.getElementById('view');
    let lookId = null, lx = 0, ly = 0;
    view.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; input.mouse.down = true; });
    view.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      input.mouse.dx += (e.clientX - lx) * 1.5; input.mouse.dy += (e.clientY - ly) * 1.5;
      lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lookId) { lookId = null; input.mouse.down = false; } };
    view.addEventListener('pointerup', endLook);
    view.addEventListener('pointercancel', endLook);
  }

  // called every frame before the physics
  update(dt) {
    if (!IS_TOUCH || !this.wheel) return;
    // self-centring when the finger is off the wheel
    if (this.wheelPointer === null) this.angle *= Math.pow(0.02, dt);
    this.wheelImg.style.transform = `rotate(${this.angle}rad)`;
    const steer = -this.angle / 2.35;          // turn left (anticlockwise) = positive steer
    if (this.wheelPointer !== null || Math.abs(this.angle) > 0.01) this.input.steer = steer;
  }

  show(on) { if (this.root) this.root.style.display = on && IS_TOUCH ? 'block' : 'none'; }
}
