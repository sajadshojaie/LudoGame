"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardLayout, LastMove, Player, Point, Token, TrackCell, YardLayout } from "@/types/game";
import { HOP_MS } from "@/utils/gameRules";
import { nextTrackPoint, pointForProgress, routePoints } from "@/utils/boardGeometry";
import { themeFor } from "@/utils/palette";

interface LudoBoardProps {
  layout: BoardLayout;
  tokens: Token[];
  players: Player[];
  currentSeat: number | null;
  legalTokenIds: string[];
  lastMove: LastMove | null;
  onToken?: (tokenId: string) => void;
}

interface Pose {
  x: number;
  y: number;
  heading: number;
}

export function LudoBoard({
  layout,
  tokens,
  players,
  currentSeat,
  legalTokenIds,
  lastMove,
  onToken,
}: LudoBoardProps) {
  const nameById = useMemo(() => new Map(players.map((player) => [player.id, player.name])), [players]);
  const offsets = useMemo(() => stackOffsets(layout, tokens), [layout, tokens]);

  return (
    <div className="board-shell">
      <div className="board-frame">
        <svg viewBox={`0 0 ${layout.viewBox} ${layout.viewBox}`} className="h-full w-full" role="img" aria-label="صفحه منچ">
          {layout.shape === "square" ? (
            <ClassicBoard layout={layout} players={players} currentSeat={currentSeat} nameById={nameById} />
          ) : (
            <RadialBoard layout={layout} players={players} currentSeat={currentSeat} nameById={nameById} />
          )}
        </svg>

        {tokens.map((token) => (
          <TokenSprite
            key={token.id}
            token={token}
            layout={layout}
            legal={legalTokenIds.includes(token.id)}
            offset={offsets.get(token.id) ?? { dx: 0, dy: 0 }}
            moveSeq={lastMove?.tokenId === token.id || lastMove?.capturedIds.includes(token.id) ? lastMove.id : 0}
            holdMs={captureHold(lastMove, token.id)}
            rising={lastMove?.tokenId === token.id}
            onToken={onToken}
          />
        ))}
      </div>
    </div>
  );
}

function ClassicBoard({
  layout,
  players,
  currentSeat,
  nameById,
}: {
  layout: BoardLayout;
  players: Player[];
  currentSeat: number | null;
  nameById: Map<string, string>;
}) {
  return (
    <>
      <polygon points={pts(layout.outline)} fill="#8ecff2" stroke="#f7fcff" strokeWidth={8} />
      {layout.yards.map((yard) => (
        <ClassicYard key={`yard-${yard.seat}`} layout={layout} yard={yard} players={players} currentSeat={currentSeat} nameById={nameById} />
      ))}
      <CenterDiamond layout={layout} />
      {layout.track.map((cell) => (
        <TrackStone key={`t-${cell.index}`} layout={layout} cell={cell} />
      ))}
      {layout.homes.flat().map((cell) => (
        <FlatDisc
          key={`h-${cell.seat}-${cell.homeIndex}`}
          cx={cell.x}
          cy={cell.y}
          r={cell.size * 0.46}
          fill={themeFor(cell.seat).hex}
          ring="#ffffff"
        />
      ))}
    </>
  );
}

function ClassicYard({
  layout,
  yard,
  players,
  currentSeat,
  nameById,
}: {
  layout: BoardLayout;
  yard: YardLayout;
  players: Player[];
  currentSeat: number | null;
  nameById: Map<string, string>;
}) {
  const theme = themeFor(yard.seat);
  const active = currentSeat === yard.seat;
  const player = players.find((item) => item.seat === yard.seat);
  const name = truncate(player ? nameById.get(player.id) || theme.label : theme.label, 12);
  return (
    <g>
      <polygon points={pts(yard.polygon)} fill={theme.hex} stroke={active ? "#fff6c8" : "#ffffff"} strokeWidth={active ? 6 : 3} />
      {yard.slots.map((slot, index) => (
        <FlatDisc key={index} cx={slot.x} cy={slot.y} r={layout.cellSize * 0.5} fill="#ffffff" ring={theme.deep} />
      ))}
      <text x={fmt(yard.label.x)} y={fmt(yard.label.y)} textAnchor="middle" className="board-name" fill={theme.ink} fontSize={22}>
        {name}
      </text>
    </g>
  );
}

function TrackStone({ layout, cell }: { layout: BoardLayout; cell: TrackCell }) {
  const start = cell.startFor != null ? themeFor(cell.startFor) : null;
  const next = nextTrackPoint(layout, cell.index);
  const angle = (Math.atan2(next.y - cell.y, next.x - cell.x) * 180) / Math.PI;
  const r = cell.size * 0.46;
  return (
    <g>
      <FlatDisc cx={cell.x} cy={cell.y} r={r} fill={start ? themeFor(cell.startFor ?? cell.zone).hex : "#ffffff"} ring={start ? "#ffffff" : "#d5e8f4"} />
      {start ? (
        <polygon
          points={arrowPolygon(r * 0.42)}
          fill="#ffffff"
          transform={`translate(${fmt(cell.x)} ${fmt(cell.y)}) rotate(${fmt(angle)})`}
        />
      ) : null}
    </g>
  );
}

function CenterDiamond({ layout }: { layout: BoardLayout }) {
  const { x: cx, y: cy } = layout.center;
  const r = layout.cellSize * 0.7;
  const tl = { x: cx - r, y: cy - r };
  const tr = { x: cx + r, y: cy - r };
  const br = { x: cx + r, y: cy + r };
  const bl = { x: cx - r, y: cy + r };
  const c = { x: cx, y: cy };
  const slices = [
    { seat: 1, points: [tl, tr, c] },
    { seat: 2, points: [tr, br, c] },
    { seat: 3, points: [br, bl, c] },
    { seat: 0, points: [bl, tl, c] },
  ];
  return (
    <g>
      {slices.map((slice) => (
        <polygon key={slice.seat} points={pts(slice.points)} fill={themeFor(slice.seat).hex} stroke="#ffffff" strokeWidth={3} />
      ))}
    </g>
  );
}

function RadialBoard({
  layout,
  players,
  currentSeat,
  nameById,
}: {
  layout: BoardLayout;
  players: Player[];
  currentSeat: number | null;
  nameById: Map<string, string>;
}) {
  return (
    <>
      <polygon points={pts(layout.outline)} fill="#8ecff2" stroke="#f7fcff" strokeWidth={8} />
      {layout.yards.map((yard) => {
        const theme = themeFor(yard.seat);
        const active = currentSeat === yard.seat;
        const player = players.find((item) => item.seat === yard.seat);
        const name = truncate(player ? nameById.get(player.id) || theme.label : theme.label, 10);
        return (
          <g key={`yard-${yard.seat}`}>
            <polygon points={pts(yard.polygon)} fill={theme.hex} stroke={active ? "#fff6c8" : "#ffffff"} strokeWidth={active ? 6 : 3} />
            {yard.slots.map((slot, index) => (
              <FlatDisc key={index} cx={slot.x} cy={slot.y} r={layout.cellSize * 0.34} fill="#ffffff" ring={theme.deep} />
            ))}
            <YardName layout={layout} yard={yard} name={name} />
          </g>
        );
      })}
      {layout.track.map((cell) => (
        <TrackStone key={`t-${cell.index}`} layout={layout} cell={cell} />
      ))}
      {layout.homes.flat().map((cell) => (
        <FlatDisc
          key={`h-${cell.seat}-${cell.homeIndex}`}
          cx={cell.x}
          cy={cell.y}
          r={cell.size * 0.46}
          fill={themeFor(cell.seat).hex}
          ring="#ffffff"
        />
      ))}
      {Array.from({ length: layout.playerCount }, (_, seat) => {
        const slice = (Math.PI * 2) / layout.playerCount;
        const start = -Math.PI / 2 + seat * slice - slice / 2;
        return (
          <path
            key={`pie-${seat}`}
            d={wedge(layout.center.x, layout.center.y, layout.center.r, start, start + slice)}
            fill={themeFor(seat).hex}
            stroke="#ffffff"
            strokeWidth={2}
          />
        );
      })}
    </>
  );
}

function captureHold(lastMove: LastMove | null, tokenId: string): number {
  if (!lastMove?.capturedIds.includes(tokenId)) return 0;
  const steps = lastMove.from < 0 ? 1 : Math.max(1, lastMove.to - lastMove.from);
  return steps * HOP_MS;
}

function TokenSprite({
  token,
  layout,
  legal,
  offset,
  moveSeq,
  holdMs,
  rising,
  onToken,
}: {
  token: Token;
  layout: BoardLayout;
  legal: boolean;
  offset: { dx: number; dy: number };
  moveSeq: number;
  holdMs: number;
  rising: boolean;
  onToken?: (tokenId: string) => void;
}) {
  const target = pointForProgress(layout, token.seat, token.index, token.progress);
  const idle = idleHeading(layout, token);
  const [pose, setPose] = useState<Pose>({ x: target.x + offset.dx, y: target.y + offset.dy, heading: idle });
  const progressRef = useRef(token.progress);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = progressRef.current;
    const to = token.progress;
    const end: Pose = { x: target.x + offset.dx, y: target.y + offset.dy, heading: idleHeading(layout, token) };
    let frame = 0;
    let stopped = false;
    const finish = () => {
      progressRef.current = to;
      setPose(end);
    };
    if (from === to || reduced) {
      finish();
      return;
    }
    const raw = routePoints(layout, token.seat, token.index, from, to).filter(
      (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    const points = raw.map((point, index) =>
      index === raw.length - 1 ? { x: point.x + offset.dx, y: point.y + offset.dy } : point,
    );
    if (points.length < 2) {
      finish();
      return;
    }
    const hops = points.length - 1;
    const total = Math.max(HOP_MS, hops * HOP_MS);
    const wait = to < 0 ? holdMs : 0;
    if (wait > 0) {
      const hit = points[0];
      setPose((current) => ({ x: hit.x, y: hit.y, heading: current.heading }));
    }
    let started = 0;
    const tick = (now: number) => {
      if (stopped) return;
      const t = Math.min(1, (now - started) / total);
      const scaled = t * hops;
      const i0 = Math.min(hops, Math.max(0, Math.floor(scaled)));
      const i1 = Math.min(hops, i0 + 1);
      const a = points[i0];
      const b = points[i1] ?? a;
      if (!a || !b) {
        finish();
        return;
      }
      const local = stepEase(scaled - i0);
      const hop = Math.sin(Math.min(1, Math.max(0, scaled - i0)) * Math.PI) * layout.cellSize * 0.12;
      setPose({
        x: a.x + (b.x - a.x) * local,
        y: a.y + (b.y - a.y) * local - hop,
        heading: headingFrom(a, b, end.heading),
      });
      if (t < 1) frame = requestAnimationFrame(tick);
      else finish();
    };
    const launch = () => {
      if (stopped) return;
      started = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const timer = wait > 0 ? window.setTimeout(launch, wait) : 0;
    if (wait === 0) launch();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [holdMs, layout, moveSeq, offset.dx, offset.dy, target.x, target.y, token]);

  const theme = themeFor(token.seat);
  const parked = token.progress < 0;
  const yardDiameter = layout.shape === "polygon" ? 0.68 : 1;
  const size = layout.cellSize * (parked ? yardDiameter * 0.86 : 0.58);

  return (
    <button
      type="button"
      className={`token-btn ${legal ? "token-legal" : ""}`}
      style={{
        left: `${(pose.x / layout.viewBox) * 100}%`,
        top: `${(pose.y / layout.viewBox) * 100}%`,
        width: `${(size / layout.viewBox) * 100}%`,
        height: `${(size / layout.viewBox) * 100}%`,
        zIndex: rising ? 6 : undefined,
      }}
      onClick={() => legal && onToken?.(token.id)}
      disabled={!legal}
      aria-label={`${theme.label}، مهره ${token.index + 1}${legal ? "، قابل حرکت" : ""}`}
    >
      <span className="token-shadow" />
      {token.progress === 0 ? <span className="token-pad" /> : null}
      {legal ? <span className="token-ring" /> : null}
      <span className="token-rot" style={{ transform: `rotate(${pose.heading}deg)` }}>
        <Airplane color={theme.hex} deep={theme.deep} soft={theme.soft} />
      </span>
    </button>
  );
}

function Airplane({ color, deep, soft }: { color: string; deep: string; soft: string }) {
  const body = "M32 2.5 37.2 24.5 58 33.2 58 39.2 37.4 36.4 35.2 50.5 43.5 56.2 43.5 60.4 32 56.4 20.5 60.4 20.5 56.2 28.8 50.5 26.6 36.4 6 39.2 6 33.2 26.8 24.5Z";
  return (
    <svg viewBox="0 0 64 64" className="token-plane" aria-hidden>
      <path d={body} fill={deep} transform="translate(0 3.2)" />
      <path fill={color} stroke="#12324c" strokeWidth="2.2" strokeLinejoin="round" d={body} />
      <path fill="#ffffff" d="M30 8.5h4l2.2 14H27.8z" opacity="0.9" />
      <path fill="rgba(255,255,255,0.45)" d="M32 4 36.5 24 32 22 27.5 24Z" />
      <circle cx="32" cy="13.5" r="1.7" fill="#12324c" />
    </svg>
  );
}

function stackOffsets(layout: BoardLayout, tokens: Token[]) {
  const groups = new Map<string, Token[]>();
  for (const token of tokens) {
    const key = cellKey(layout, token);
    const list = groups.get(key) ?? [];
    list.push(token);
    groups.set(key, list);
  }
  const map = new Map<string, { dx: number; dy: number }>();
  for (const [key, group] of groups) {
    if (group.length === 1 && !key.startsWith("center")) {
      map.set(group[0].id, { dx: 0, dy: 0 });
      continue;
    }
    const radius = key.startsWith("center") ? layout.center.r * 0.55 : layout.cellSize * 0.16;
    group.forEach((token, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / group.length;
      map.set(token.id, { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius });
    });
  }
  return map;
}

function cellKey(layout: BoardLayout, token: Token): string {
  if (token.progress < 0) return `yard-${token.id}`;
  if (token.progress >= layout.trackLength + layout.homeLength) return "center";
  if (token.progress >= layout.trackLength) return `home-${token.seat}-${token.progress}`;
  const index = (layout.starts[token.seat] + token.progress) % layout.trackLength;
  return `track-${index}`;
}

function idleHeading(layout: BoardLayout, token: Token): number {
  if (token.progress < 0) {
    const yard = centroid(layout.yards[token.seat]?.polygon ?? []);
    return headingFrom(yard, layout.center, 0);
  }
  if (token.progress >= layout.trackLength + layout.homeLength) {
    const yard = centroid(layout.yards[token.seat]?.polygon ?? []);
    return headingFrom(layout.center, yard, 0);
  }
  const here = pointForProgress(layout, token.seat, token.index, token.progress);
  const ahead = pointForProgress(layout, token.seat, token.index, token.progress + 1);
  return headingFrom(here, ahead, 0);
}

function headingFrom(a: Point, b: Point, fallback: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * dx + dy * dy < 9) return fallback;
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}

function stepEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 2.4);
}

function YardName({ layout, yard, name }: { layout: BoardLayout; yard: YardLayout; name: string }) {
  const fontSize = Math.max(12, Math.min(layout.cellSize * 0.36, yard.labelWidth / Math.max(name.length, 1) / 0.62));
  const width = Math.min(yard.labelWidth, fontSize * name.length * 0.62 + fontSize * 0.8);
  return (
    <g>
      <rect
        x={fmt(yard.label.x - width / 2)}
        y={fmt(yard.label.y - fontSize * 0.78)}
        width={fmt(width)}
        height={fmt(fontSize * 1.25)}
        rx={fmt(fontSize * 0.45)}
        fill="rgba(12,8,4,0.55)"
      />
      <text x={fmt(yard.label.x)} y={fmt(yard.label.y + fontSize * 0.18)} textAnchor="middle" className="board-name" fill="#fffaf0" fontSize={fmt(fontSize)}>
        {name}
      </text>
    </g>
  );
}

function FlatDisc({ cx, cy, r, fill, ring }: { cx: number; cy: number; r: number; fill: string; ring?: string }) {
  return <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={fill} stroke={ring ?? "#ffffff"} strokeWidth={2.5} />;
}

function fmt(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function pts(points: Point[]): string {
  return points.map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(" ");
}

function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function truncate(value: string, max: number): string {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function arrowPolygon(len: number): string {
  return `0,${fmt(-len * 0.72)} ${fmt(len)},0 0,${fmt(len * 0.72)} ${fmt(-len * 0.2)},0`;
}

function wedge(cx: number, cy: number, r: number, start: number, end: number): string {
  const x0 = cx + r * Math.cos(start);
  const y0 = cy + r * Math.sin(start);
  const x1 = cx + r * Math.cos(end);
  const y1 = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${fmt(cx)} ${fmt(cy)} L ${fmt(x0)} ${fmt(y0)} A ${fmt(r)} ${fmt(r)} 0 ${large} 1 ${fmt(x1)} ${fmt(y1)} Z`;
}
