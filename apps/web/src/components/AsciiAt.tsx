import { useEffect, useRef, useState } from "react";

const AT_ROWS = 17;
const AT_COLS = 34;
const AT_SHADES = " .:-=+*#%@";

const segmentDistance = (
  px: number,
  py: number,
  [ax, ay, bx, by]: [number, number, number, number],
) => {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const arcDistance = (
  px: number,
  py: number,
  [cx, cy, r, fromDeg, toDeg]: [number, number, number, number, number],
) => {
  const [a0, a1] = [(fromDeg * Math.PI) / 180, (toDeg * Math.PI) / 180];
  let angle = Math.atan2(py - cy, px - cx);
  while (angle < a0) angle += 2 * Math.PI;
  if (angle <= a1) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  const toEnd = (t: number) =>
    Math.hypot(px - (cx + r * Math.cos(t)), py - (cy + r * Math.sin(t)));
  return Math.min(toEnd(a0), toEnd(a1));
};

const AT_BASE: number[] = (() => {
  const shades: number[] = [];
  for (let row = 0; row < AT_ROWS; row++) {
    for (let col = 0; col < AT_COLS; col++) {
      const x = (col + 0.5 - AT_COLS / 2) / (AT_COLS / 2);
      const y = (AT_ROWS / 2 - row - 0.5) / (AT_ROWS / 2);
      const d = Math.min(
        arcDistance(x, y, [0, 0, 0.33, 0, 360]),
        segmentDistance(x, y, [0.33, 0.4, 0.33, -0.2]),
        arcDistance(x, y, [0.55, -0.2, 0.22, 180, 360]),
        arcDistance(x, y, [0, 0, 0.88, -13, 280]),
      );
      const strength = Math.max(0, 1 - d / 0.13);
      shades.push(Math.ceil(strength * (AT_SHADES.length - 1)));
    }
  }
  return shades;
})();
const AT_LIT = AT_BASE.flatMap((shade, i) => (shade > 0 ? [i] : []));

interface Glow {
  col: number;
  row: number;
}

const GLOW_RADIUS = 5;

function renderAt(offsets: Int8Array, glow: Glow | null) {
  let out = "";
  for (let row = 0; row < AT_ROWS; row++) {
    for (let col = 0; col < AT_COLS; col++) {
      const i = row * AT_COLS + col;
      const base = AT_BASE[i] ?? 0;
      // Columns are half as wide as rows are tall, so halve the x distance.
      const distance = glow
        ? Math.hypot((col - glow.col) / 2, row - glow.row)
        : Infinity;
      const boost = Math.round(2 * Math.max(0, 1 - distance / GLOW_RADIUS));
      const shade =
        base &&
        Math.min(
          AT_SHADES.length - 1,
          Math.max(1, base + (offsets[i] ?? 0) + boost),
        );
      out += AT_SHADES[shade] ?? " ";
    }
    out += "\n";
  }
  return out;
}

const strokeDistance = (x: number, y: number) =>
  Math.min(
    arcDistance(x, y, [0, 0, 0.33, 0, 360]),
    segmentDistance(x, y, [0.33, 0.4, 0.33, -0.2]),
    arcDistance(x, y, [0.55, -0.2, 0.22, 180, 360]),
    arcDistance(x, y, [0, 0, 0.88, -13, 280]),
  ) - 0.13;

const SAMPLE_STEP = 0.014;
const SLAB_DEPTH = 0.14;
const CAMERA = 4;

const flatIndex = (x: number, y: number) => {
  const col = Math.floor(((x + 1) / 2) * AT_COLS);
  const row = Math.floor(((1 - y) / 2) * AT_ROWS);
  return col < 0 || col >= AT_COLS || row < 0 || row >= AT_ROWS
    ? -1
    : row * AT_COLS + col;
};

const SURFACE = (() => {
  const faces: [x: number, y: number, shade: number][] = [];
  const walls: [x: number, y: number, nx: number, ny: number][] = [];
  for (let x = -1.05; x <= 1.05; x += SAMPLE_STEP) {
    for (let y = -1.05; y <= 1.05; y += SAMPLE_STEP) {
      const d = strokeDistance(x, y);
      const shade = AT_BASE[flatIndex(x, y)] ?? 0;
      if (d < 0 && shade > 0) faces.push([x, y, shade]);
      if (Math.abs(d) < SAMPLE_STEP * 0.7) {
        const e = 0.004;
        const gx = strokeDistance(x + e, y) - strokeDistance(x - e, y);
        const gy = strokeDistance(x, y + e) - strokeDistance(x, y - e);
        const len = Math.hypot(gx, gy) || 1;
        walls.push([x, y, gx / len, gy / len]);
      }
    }
  }
  return { faces, walls };
})();

const LIGHT = (() => {
  const [x, y, z] = [-0.4, 0.5, -0.75];
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len] as const;
})();

const REST_LIGHT = -LIGHT[2];

function render3d(yaw: number, pitch: number) {
  const chars = new Array<string>(AT_ROWS * AT_COLS).fill(" ");
  const nearest = new Float32Array(AT_ROWS * AT_COLS).fill(Infinity);
  const [cy, sy, cp, sp] = [
    Math.cos(yaw),
    Math.sin(yaw),
    Math.cos(pitch),
    Math.sin(pitch),
  ];
  const rotate = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp] as const;
  };
  const lit = (nx: number, ny: number, nz: number) => {
    const [rx, ry, rz] = rotate(nx, ny, nz);
    if (rz > -0.05) return null;
    return Math.max(0, rx * LIGHT[0] + ry * LIGHT[1] + rz * LIGHT[2]);
  };

  const plot = (
    x: number,
    y: number,
    z: number,
    shade: number,
    wins: boolean,
  ) => {
    const [px, py, pz] = rotate(x, y, z);
    const scale = CAMERA / (CAMERA + pz + SLAB_DEPTH);
    const i = flatIndex(px * scale, py * scale);
    if (i < 0) return;
    const depth = nearest[i] ?? Infinity;
    if (wins ? pz > depth + 1e-6 : pz >= depth) return;
    nearest[i] = pz;
    chars[i] = AT_SHADES[shade] ?? " ";
  };

  const max = AT_SHADES.length - 1;
  for (const [x, y, nx, ny] of SURFACE.walls) {
    const light = lit(nx, ny, 0);
    if (light === null) continue;
    const shade = Math.min(max, 1 + Math.floor(light ** 2 * max));
    for (let z = -SLAB_DEPTH; z <= SLAB_DEPTH; z += SAMPLE_STEP) {
      plot(x, y, z, shade, false);
    }
  }

  for (const [nz, z] of [
    [-1, -SLAB_DEPTH],
    [1, SLAB_DEPTH],
  ] as const) {
    const light = lit(0, 0, nz);
    if (light === null) continue;
    const brightness = Math.min(1.4, light / REST_LIGHT);
    for (const [x, y, base] of SURFACE.faces) {
      const shade = Math.max(1, Math.min(max, Math.round(base * brightness)));
      plot(x, y, z, shade, true);
    }
  }

  let out = "";
  for (let row = 0; row < AT_ROWS; row++) {
    out += chars.slice(row * AT_COLS, (row + 1) * AT_COLS).join("") + "\n";
  }
  return out;
}

const TURN = 2 * Math.PI;

const SPIN_SECONDS = 3.2;

export function InteractiveAt() {
  const offsets = useRef(new Int8Array(AT_BASE.length));
  const glow = useRef<Glow | null>(null);
  const motion = useRef({
    spinning: false,
    dragging: false,
    yaw: 0,
    pitch: 0,
    velocity: 0,
    lastX: 0,
    lastY: 0,
    spinAt: null as number | null,
  });
  const [frame, setFrame] = useState(() => renderAt(offsets.current, null));
  const drawFlat = () => setFrame(renderAt(offsets.current, glow.current));

  const step = () => {
    const m = motion.current;
    if (m.spinAt !== null && !m.dragging) {
      const t = (performance.now() - m.spinAt) / 1000 / SPIN_SECONDS;
      if (t >= 1) {
        m.spinAt = null;
        m.spinning = false;
        m.yaw = m.pitch = m.velocity = 0;
        drawFlat();
        return;
      }
      const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      m.yaw = TURN * eased;
      m.pitch = 0.12 * Math.sin(t * Math.PI);
      setFrame(render3d(m.yaw, m.pitch));
      requestAnimationFrame(step);
      return;
    }
    if (!m.dragging) {
      m.pitch *= 0.88;
      if (Math.abs(m.velocity) > 0.03) {
        m.yaw += m.velocity;
        m.velocity *= 0.96;
      } else {
        const target = Math.round(m.yaw / TURN) * TURN;
        m.velocity = m.velocity * 0.82 + (target - m.yaw) * 0.04;
        m.yaw += m.velocity;
        if (
          Math.abs(target - m.yaw) < 0.004 &&
          Math.abs(m.velocity) < 0.002 &&
          Math.abs(m.pitch) < 0.004
        ) {
          m.spinning = false;
          m.yaw = m.pitch = m.velocity = 0;
          drawFlat();
          return;
        }
      }
    }
    setFrame(render3d(m.yaw, m.pitch));
    requestAnimationFrame(step);
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const randomLit = () =>
      AT_LIT[Math.floor(Math.random() * AT_LIT.length)] ?? 0;
    const id = setInterval(() => {
      for (let n = 0; n < 4; n++)
        offsets.current[randomLit()] = Math.random() < 0.5 ? -1 : 1;
      for (let n = 0; n < 4; n++) offsets.current[randomLit()] = 0;
      if (!motion.current.spinning) drawFlat();
    }, 140);

    const spin = () => {
      const m = motion.current;
      if (m.spinning || document.hidden) return;
      m.spinAt = performance.now();
      m.spinning = true;
      glow.current = null;
      requestAnimationFrame(step);
    };
    const first = setTimeout(spin, 1500);
    const every = setInterval(spin, 9000);
    return () => {
      clearInterval(id);
      clearTimeout(first);
      clearInterval(every);
    };
    // step reads refs only, so the first render's copy is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <pre
      aria-hidden
      className="cursor-grab touch-none select-none text-[8px] leading-[1.15] active:cursor-grabbing sm:text-[11px]"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const m = motion.current;
        e.currentTarget.setPointerCapture(e.pointerId);
        m.dragging = true;
        m.spinAt = null;
        m.velocity = 0;
        m.lastX = e.clientX;
        m.lastY = e.clientY;
        glow.current = null;
        if (!m.spinning) {
          m.spinning = true;
          requestAnimationFrame(step);
        }
      }}
      onPointerMove={(e) => {
        const m = motion.current;
        if (m.dragging) {
          const dx = e.clientX - m.lastX;
          const dy = e.clientY - m.lastY;
          m.lastX = e.clientX;
          m.lastY = e.clientY;
          m.yaw += dx * 0.012;
          m.pitch = Math.max(-0.6, Math.min(0.6, m.pitch - dy * 0.008));
          m.velocity = dx * 0.012;
          return;
        }
        if (e.pointerType !== "mouse" || m.spinning) return;
        const rect = e.currentTarget.getBoundingClientRect();
        glow.current = {
          col: ((e.clientX - rect.left) / rect.width) * AT_COLS,
          row: ((e.clientY - rect.top) / rect.height) * AT_ROWS,
        };
        drawFlat();
      }}
      onPointerUp={() => {
        const m = motion.current;
        m.dragging = false;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
          m.velocity = 0;
      }}
      onLostPointerCapture={() => {
        motion.current.dragging = false;
      }}
      onPointerLeave={() => {
        glow.current = null;
        if (!motion.current.spinning) drawFlat();
      }}
    >
      {frame}
    </pre>
  );
}
