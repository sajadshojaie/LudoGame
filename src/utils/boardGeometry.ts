import type {
  BoardLayout,
  HomeCell,
  PlayerCount,
  Point,
  TrackCell,
  YardLayout,
} from "@/types/game";

export const VIEW = 1000;
export const CENTER = 500;
export const TOKENS_PER_PLAYER = 4;

/** Shared-track cells contributed by each seat. Classic arms are longer. */
export function trackPerPlayer(count: PlayerCount): number {
  if (count === 4) return 14;
  if (count === 5) return 7;
  return 6;
}

export function homeLength(count: PlayerCount): number {
  return count === 4 ? 6 : 4;
}

export function trackLength(count: PlayerCount): number {
  return trackPerPlayer(count) * count;
}

export function finishProgress(count: PlayerCount): number {
  return trackLength(count) + homeLength(count);
}

const CLASSIC_PATH: Array<[number, number]> = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0],
];

const CLASSIC_HOMES: Array<Array<[number, number]>> = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
];

const CLASSIC_YARDS: Array<{ row: number; col: number }> = [
  { row: 0, col: 0 },
  { row: 0, col: 9 },
  { row: 9, col: 9 },
  { row: 9, col: 0 },
];

function starIndex(start: number, count: PlayerCount): number {
  const len = trackLength(count);
  const offset = count === 4 ? 8 : Math.floor(trackPerPlayer(count) / 2);
  return (start + offset) % len;
}

function snap(n: number): number {
  return Math.round(n * 100) / 100;
}

function snapPoint(point: Point): Point {
  return { x: snap(point.x), y: snap(point.y) };
}

export function buildLayout(playerCount: PlayerCount): BoardLayout {
  return playerCount === 4 ? buildClassic() : buildRadial(playerCount);
}

function buildClassic(): BoardLayout {
  const grid = 15;
  const size = 58;
  const origin = (VIEW - grid * size) / 2;
  const cell = (row: number, col: number): Point => ({
    x: origin + col * size + size / 2,
    y: origin + row * size + size / 2,
  });

  const starts = [0, 14, 28, 42];
  const stars = starts.map((start) => starIndex(start, 4));
  const safe = new Set<number>([...starts, ...stars]);

  const track: TrackCell[] = CLASSIC_PATH.map(([row, col], index) => {
    const p = cell(row, col);
    const startFor = starts.indexOf(index);
    return {
      index,
      x: p.x,
      y: p.y,
      size,
      rotation: 0,
      zone: Math.floor(index / 14),
      safe: safe.has(index),
      startFor: startFor === -1 ? null : startFor,
      star: stars.includes(index),
    };
  });

  const homes: HomeCell[][] = CLASSIC_HOMES.map((lane, seat) =>
    lane.map(([row, col], homeIndex) => {
      const p = cell(row, col);
      return { x: p.x, y: p.y, size, rotation: 0, seat, homeIndex };
    }),
  );

  const yards: YardLayout[] = CLASSIC_YARDS.map((yard, seat) => {
    const x = origin + yard.col * size;
    const y = origin + yard.row * size;
    const w = size * 6;
    const h = size * 6;
    const hub = { x: x + w / 2, y: y + h / 2 + size * 0.22 };
    const gap = size * 0.92;
    const slots = [
      { x: snap(hub.x - gap), y: snap(hub.y - gap) },
      { x: snap(hub.x + gap), y: snap(hub.y - gap) },
      { x: snap(hub.x - gap), y: snap(hub.y + gap) },
      { x: snap(hub.x + gap), y: snap(hub.y + gap) },
    ];
    return {
      seat,
      frame: { x, y, w, h },
      polygon: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      slots,
      label: { x: x + w / 2, y: y + size * 0.78 },
      labelWidth: w * 0.8,
    };
  });

  const outline: Point[] = [
    { x: origin, y: origin },
    { x: origin + grid * size, y: origin },
    { x: origin + grid * size, y: origin + grid * size },
    { x: origin, y: origin + grid * size },
  ];

  const centerPt = cell(7, 7);

  return {
    playerCount: 4,
    viewBox: VIEW,
    shape: "square",
    trackLength: 56,
    homeLength: 6,
    cellSize: size,
    track,
    homes,
    yards,
    starts,
    safeIndices: [...safe],
    starIndices: stars,
    center: { x: centerPt.x, y: centerPt.y, r: size * 0.95 },
    outline,
    rotation: [0, 0, 0, 0],
  };
}

function buildRadial(count: 5 | 6): BoardLayout {
  const per = trackPerPlayer(count);
  const total = per * count;
  const homeLen = homeLength(count);
  const ringR = 1 / (2 * Math.sin(Math.PI / total));
  const baseR = ringR + 0.46;
  const yardH = count === 6 ? 2.7 : 2.85;
  const vertexR = baseR + yardH;
  const pad = 52;
  const scale = (VIEW / 2 - pad) / vertexR;
  const cellSize = snap(scale);

  const starts = Array.from({ length: count }, (_, seat) => seat * per);
  const stars = starts.map((start) => starIndex(start, count));
  const safe = new Set<number>([...starts, ...stars]);

  const track: TrackCell[] = Array.from({ length: total }, (_, index) => {
    const phi = (index * 2 * Math.PI) / total;
    const p = polar(0, ringR, phi, scale);
    const seat = Math.floor(index / per);
    return {
      index,
      x: p.x,
      y: p.y,
      size: cellSize,
      rotation: snap((phi * 180) / Math.PI),
      zone: seat,
      safe: safe.has(index),
      startFor: starts.includes(index) ? seat : null,
      star: stars.includes(index),
    };
  });

  const homes: HomeCell[][] = Array.from({ length: count }, (_, seat) => {
    const phi = outwardPhi(seat, count);
    return Array.from({ length: homeLen }, (__, homeIndex) => {
      const p = polar(0, ringR - (homeIndex + 1), phi, scale);
      return {
        x: p.x,
        y: p.y,
        size: cellSize,
        rotation: snap((phi * 180) / Math.PI),
        seat,
        homeIndex,
      };
    });
  });

  const yards: YardLayout[] = Array.from({ length: count }, (_, seat) => {
    const phi = outwardPhi(seat, count);
    const alpha = (2 * Math.PI) / count;
    const t = (1 - baseR / vertexR) / (1 - Math.cos(alpha));
    const baseX = t * vertexR * Math.sin(alpha);
    const tip = polar(0, vertexR, phi, scale);
    const left = polar(-baseX, baseR, phi, scale);
    const right = polar(baseX, baseR, phi, scale);
    const slotLocal: Array<[number, number]> = [
      [0, baseR + yardH * 0.5],
      [-0.72, baseR + yardH * 0.32],
      [0.72, baseR + yardH * 0.32],
      [0, baseR + yardH * 0.22],
    ];
    const labelFromTip = 0.62;
    const labelY = vertexR - labelFromTip;
    const labelHalf = baseX * (labelFromTip / yardH);
    return {
      seat,
      frame: null,
      polygon: [tip, right, left],
      slots: slotLocal.map(([lx, ly]) => polar(lx, ly, phi, scale)),
      label: polar(0, labelY, phi, scale),
      labelWidth: snap(labelHalf * 2 * scale * 0.9),
    };
  });

  const outline = Array.from({ length: count }, (_, seat) => polar(0, vertexR, outwardPhi(seat, count), scale));
  const innerHome = ringR - homeLen;
  const centerR = snap(Math.max(cellSize * 0.9, (innerHome - 0.58) * scale));

  return {
    playerCount: count,
    viewBox: VIEW,
    shape: "polygon",
    trackLength: total,
    homeLength: homeLen,
    cellSize,
    track,
    homes,
    yards,
    starts,
    safeIndices: [...safe],
    starIndices: stars,
    center: { x: CENTER, y: CENTER, r: centerR },
    outline,
    rotation: Array.from({ length: count }, (_, seat) => snap((outwardPhi(seat, count) * 180) / Math.PI)),
  };
}

function outwardPhi(seat: number, count: number): number {
  return seat * ((2 * Math.PI) / count);
}

function polar(lx: number, ly: number, phi: number, scale: number): Point {
  const outwardX = Math.sin(phi);
  const outwardY = -Math.cos(phi);
  const tangentX = Math.cos(phi);
  const tangentY = Math.sin(phi);
  return snapPoint({
    x: CENTER + (lx * tangentX + ly * outwardX) * scale,
    y: CENTER + (lx * tangentY + ly * outwardY) * scale,
  });
}

export function pointForProgress(
  layout: BoardLayout,
  seat: number,
  yardSlot: number,
  progress: number,
): Point {
  if (progress < 0) {
    return layout.yards[seat].slots[yardSlot] ?? layout.yards[seat].slots[0];
  }
  if (progress < layout.trackLength) {
    const index = (layout.starts[seat] + progress) % layout.trackLength;
    const cell = layout.track[index];
    return { x: cell.x, y: cell.y };
  }
  const homeIndex = progress - layout.trackLength;
  if (homeIndex < layout.homeLength) {
    const home = layout.homes[seat][homeIndex];
    return { x: home.x, y: home.y };
  }
  return { x: layout.center.x, y: layout.center.y };
}

export function routePoints(
  layout: BoardLayout,
  seat: number,
  yardSlot: number,
  from: number,
  to: number,
): Point[] {
  if (from === to) return [pointForProgress(layout, seat, yardSlot, to)];
  if (to < 0) {
    return [
      pointForProgress(layout, seat, yardSlot, from),
      pointForProgress(layout, seat, yardSlot, -1),
    ];
  }
  const start = Math.max(from, -1);
  const points: Point[] = [pointForProgress(layout, seat, yardSlot, start)];
  const first = start < 0 ? 0 : start + 1;
  for (let progress = first; progress <= to; progress++) {
    points.push(pointForProgress(layout, seat, yardSlot, progress));
  }
  return points;
}

export function nextTrackPoint(layout: BoardLayout, index: number): Point {
  const next = layout.track[(index + 1) % layout.track.length];
  return { x: next.x, y: next.y };
}

export function minCenterDistance(layout: BoardLayout): number {
  const pts = [
    ...layout.track.map((cell) => ({ x: cell.x, y: cell.y, size: cell.size })),
    ...layout.homes.flat().map((cell) => ({ x: cell.x, y: cell.y, size: cell.size })),
  ];
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      const allow = (pts[i].size + pts[j].size) / 2;
      min = Math.min(min, d / allow);
    }
  }
  return min;
}
