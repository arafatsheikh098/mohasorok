// Oriented-box collision (top-down, x/z plane) and an impulse response between two bodies.
// A box: { x, z, yaw, hw (half width), hl (half length) }. Forward = (sin yaw, cos yaw).

function axes(b) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  return [[s, c], [c, -s]]; // forward, right
}

function project(b, ax) {
  const [f, r] = axes(b);
  const centre = b.x * ax[0] + b.z * ax[1];
  const ext = Math.abs(f[0] * ax[0] + f[1] * ax[1]) * b.hl + Math.abs(r[0] * ax[0] + r[1] * ax[1]) * b.hw;
  return [centre - ext, centre + ext];
}

// Separating-axis test. Returns null, or { depth, nx, nz } where n pushes `a` away from `b`.
export function obbOverlap(a, b) {
  let best = null;
  for (const ax of [...axes(a), ...axes(b)]) {
    const [a0, a1] = project(a, ax);
    const [b0, b1] = project(b, ax);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return null;
    if (!best || o < best.depth) {
      const dir = (a.x - b.x) * ax[0] + (a.z - b.z) * ax[1] >= 0 ? 1 : -1;
      best = { depth: o, nx: ax[0] * dir, nz: ax[1] * dir };
    }
  }
  return best;
}

// Exchange momentum along the contact normal (restitution e). Velocities are {x, z} objects, mutated.
// Returns the closing speed along the normal (m/s) before the impulse.
export function resolveImpulse(va, ma, vb, mb, n, e = 0.15) {
  const rel = (va.x - vb.x) * n.nx + (va.z - vb.z) * n.nz;
  if (rel >= 0) return 0; // already separating
  const j = (-(1 + e) * rel) / (1 / ma + 1 / mb);
  va.x += (j / ma) * n.nx; va.z += (j / ma) * n.nz;
  vb.x -= (j / mb) * n.nx; vb.z -= (j / mb) * n.nz;
  return -rel;
}
