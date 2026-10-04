import type {
  GameState,
  Intent,
  LastMove,
  LegalMove,
  LogEntry,
  LogTone,
  Player,
  PlayerCount,
  SeatSetup,
  Token,
} from "@/types/game";
import {
  TOKENS_PER_PLAYER,
  finishProgress,
  homeLength,
  seatPlan,
  trackLength,
  buildLayout,
} from "@/utils/boardGeometry";
import { faDigits } from "@/utils/palette";

export const DICE_MS = 880;
export const TURN_LIMIT_MS = 15_000;
export const HOP_MS = 340;
export const BOT_THINK_MS = 1200;

const BOT_NAMES = ["رویا", "کیان", "سارا", "نیما", "لاله", "آرمان"];

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${rand}`;
}

export function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function layoutOf(count: PlayerCount) {
  return buildLayout(count);
}

export function createTokens(players: Player[]): Token[] {
  return players.flatMap((player) =>
    Array.from({ length: TOKENS_PER_PLAYER }, (_, index) => ({
      id: `${player.id}:${index}`,
      playerId: player.id,
      seat: player.seat,
      index,
      progress: -1,
    })),
  );
}

export function createLocalMatch(count: PlayerCount, seats: SeatSetup[], hostName: string): GameState {
  const plan = seatPlan(count);
  const players: Player[] = seats.slice(0, count).map((seat, index) => ({
    id: index === 0 ? "local-you" : createId(seat.kind === "bot" ? "bot" : "local"),
    name: (index === 0 ? hostName : seat.name).trim() || defaultName(index, seat.kind),
    seat: plan[index] ?? index,
    kind: index === 0 ? "human" : seat.kind,
    peerId: null,
    connected: true,
  }));
  const state = baseState({
    roomId: null,
    hostId: players[0].id,
    maxPlayers: count,
    players,
    status: "playing",
    phase: "roll",
  });
  return { ...state, rollDeadline: rollClock(players, 0, Date.now(), 0, true) };
}

export function createLobby(options: {
  roomId: string | null;
  hostId: string;
  hostName: string;
  count: PlayerCount;
  peerId: string | null;
}): GameState {
  const host: Player = {
    id: options.hostId,
    name: options.hostName.trim() || "میزبان",
    seat: 0,
    kind: "human",
    peerId: options.peerId,
    connected: true,
  };
  return baseState({
    roomId: options.roomId,
    hostId: host.id,
    maxPlayers: options.count,
    players: [host],
    status: "lobby",
    phase: "lobby",
  });
}

function baseState(partial: {
  roomId: string | null;
  hostId: string;
  maxPlayers: PlayerCount;
  players: Player[];
  status: GameState["status"];
  phase: GameState["phase"];
}): GameState {
  return {
    revision: 1,
    roomId: partial.roomId,
    hostId: partial.hostId,
    maxPlayers: partial.maxPlayers,
    status: partial.status,
    players: partial.players,
    tokens: createTokens(partial.players),
    currentPlayerIndex: 0,
    rollerIndex: 0,
    dice: null,
    rollId: 0,
    phase: partial.phase,
    consecutiveSixes: 0,
    introducedIds: [],
    openingMisses: {},
    rankings: [],
    log: [
      entry(
        "system",
        partial.status === "lobby"
          ? "اتاق باز است. کد را بفرستید تا بقیه بنشینند."
          : "مهره‌ها در خانه هستند. با آوردن ۶ بیرون می‌آیند.",
      ),
    ],
    busyUntil: 0,
    rollDeadline: 0,
    moveSeq: 0,
    lastMove: null,
  };
}

function nextOpenSeat(state: GameState): number {
  const used = new Set(state.players.map((player) => player.seat));
  return seatPlan(state.maxPlayers).find((seat) => !used.has(seat)) ?? state.players.length;
}

function defaultName(index: number, kind: "human" | "bot"): string {
  if (kind === "bot") return BOT_NAMES[index % BOT_NAMES.length];
  return `بازیکن ${index + 1}`;
}

function entry(tone: LogTone, text: string): LogEntry {
  return { id: createId("log"), text, tone };
}

function withLog(state: GameState, tone: LogTone, text: string): LogEntry[] {
  return [...state.log, entry(tone, text)].slice(-36);
}

export function finishLine(state: GameState): number {
  return finishProgress(state.maxPlayers);
}

export function isFinishedProgress(progress: number, count: PlayerCount): boolean {
  return progress >= finishProgress(count);
}

export function playerFinished(state: GameState, playerId: string): boolean {
  const mine = state.tokens.filter((token) => token.playerId === playerId);
  return mine.length === TOKENS_PER_PLAYER && mine.every((token) => isFinishedProgress(token.progress, state.maxPlayers));
}

export function seatOf(state: GameState, playerId: string): number {
  return state.players.find((player) => player.id === playerId)?.seat ?? 0;
}

function trackIndexFor(state: GameState, token: Token): number | null {
  const len = trackLength(state.maxPlayers);
  if (token.progress < 0 || token.progress >= len) return null;
  const layout = layoutOf(state.maxPlayers);
  return (layout.starts[token.seat] + token.progress) % len;
}

function tokensOnTrackCell(state: GameState, trackIndex: number, tokens: Token[] = state.tokens): Token[] {
  return tokens.filter((token) => trackIndexFor({ ...state, tokens }, token) === trackIndex);
}

function capturesOn(state: GameState, mover: Token, trackIndex: number, tokens: Token[]): string[] {
  return tokensOnTrackCell(state, trackIndex, tokens)
    .filter((token) => token.id !== mover.id && token.playerId !== mover.playerId)
    .map((token) => token.id);
}

export function legalMoves(state: GameState, dice = state.dice): LegalMove[] {
  if (state.status !== "playing" || state.phase !== "move" || dice == null) return [];
  const player = state.players[state.currentPlayerIndex];
  if (!player || playerFinished(state, player.id)) return [];
  const len = trackLength(state.maxPlayers);
  const goal = finishLine(state);
  const moves: LegalMove[] = [];

  for (const token of state.tokens) {
    if (token.playerId !== player.id) continue;
    if (isFinishedProgress(token.progress, state.maxPlayers)) continue;

    if (token.progress < 0) {
      if (dice !== 6) continue;
      const index = layoutOf(state.maxPlayers).starts[token.seat];
      moves.push({ tokenId: token.id, from: -1, to: 0, captures: capturesOn(state, token, index, state.tokens) });
      continue;
    }

    const dest = token.progress + dice;
    if (dest > goal) continue;

    const captures: string[] = [];
    if (dest < len) {
      const index = (layoutOf(state.maxPlayers).starts[token.seat] + dest) % len;
      captures.push(...capturesOn(state, token, index, state.tokens));
    }
    moves.push({ tokenId: token.id, from: token.progress, to: dest, captures });
  }
  return moves;
}

function nextPlayerIndex(state: GameState, from: number, tokens: Token[], rankings: string[]): number {
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const index = (from + step) % total;
    const player = state.players[index];
    const done =
      rankings.includes(player.id) ||
      tokens.filter((token) => token.playerId === player.id).every((token) => isFinishedProgress(token.progress, state.maxPlayers));
    if (!done) return index;
  }
  return from;
}

function rollClock(players: Player[], index: number, now: number, busyUntil: number, playing: boolean): number {
  const player = players[index];
  if (!playing || !player || player.kind !== "human") return 0;
  return Math.max(now, busyUntil) + TURN_LIMIT_MS;
}

export function hopDuration(from: number, to: number): number {
  if (to < 0) return HOP_MS + 180;
  if (from < 0) return HOP_MS + 220;
  return Math.max(1, to - from) * HOP_MS + 160;
}

export function applyRoll(state: GameState, value: number, now: number): GameState {
  if (state.status !== "playing" || state.phase !== "roll") return state;
  const player = state.players[state.currentPlayerIndex];
  const sixes = value === 6 ? state.consecutiveSixes + 1 : 0;
  const rolled: GameState = {
    ...state,
    rollerIndex: state.currentPlayerIndex,
    dice: value,
    rollId: state.rollId + 1,
    consecutiveSixes: sixes,
    openingMisses: noteOpeningMiss(state, value),
    revision: state.revision + 1,
  };

  if (value === 6 && sixes >= 3) {
    const next = nextPlayerIndex(state, state.currentPlayerIndex, state.tokens, state.rankings);
    return {
      ...rolled,
      phase: "roll",
      consecutiveSixes: 0,
      currentPlayerIndex: next,
      busyUntil: now + DICE_MS + 420,
      rollDeadline: rollClock(state.players, next, now, now + DICE_MS + 420, true),
      log: withLog(state, "six", `${player.name} برای سومین بار ${faDigits(6)} آورد. نوبت سوخت.`),
    };
  }

  const moves = legalMoves({ ...rolled, phase: "move" }, value);
  if (moves.length === 0) {
    const next = nextPlayerIndex(state, state.currentPlayerIndex, state.tokens, state.rankings);
    return {
      ...rolled,
      phase: "roll",
      consecutiveSixes: 0,
      currentPlayerIndex: next,
      busyUntil: now + DICE_MS + 520,
      rollDeadline: rollClock(state.players, next, now, now + DICE_MS + 520, true),
      log: withLog(state, "info", `${player.name} ${faDigits(value)} آورد. حرکتی ممکن نیست.`),
    };
  }

  return {
    ...rolled,
    phase: "move",
    busyUntil: now + DICE_MS,
    rollDeadline: 0,
    log: withLog(state, value === 6 ? "six" : "info", `${player.name} ${faDigits(value)} آورد.`),
  };
}

export function passRoll(state: GameState, now: number): GameState {
  if (state.status !== "playing" || state.phase !== "roll") return state;
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  const next = nextPlayerIndex(state, state.currentPlayerIndex, state.tokens, state.rankings);
  const busyUntil = now;
  return {
    ...state,
    revision: state.revision + 1,
    phase: "roll",
    consecutiveSixes: 0,
    currentPlayerIndex: next,
    busyUntil,
    rollDeadline: rollClock(state.players, next, now, busyUntil, true),
    log: withLog(state, "info", `${player.name} در ۱۵ ثانیه تاس نینداخت.`),
  };
}

export function applyMove(state: GameState, tokenId: string, now: number): GameState {
  if (state.status !== "playing" || state.phase !== "move") return state;
  const move = legalMoves(state).find((item) => item.tokenId === tokenId);
  if (!move) return state;

  const player = state.players[state.currentPlayerIndex];
  let tokens = state.tokens.map((token) =>
    token.id === tokenId ? { ...token, progress: move.to } : token,
  );
  if (move.captures.length) {
    const captured = new Set(move.captures);
    tokens = tokens.map((token) => (captured.has(token.id) ? { ...token, progress: -1 } : token));
  }

  const justFinished = playerFinished({ ...state, tokens }, player.id);
  let rankings = state.rankings;
  if (justFinished && !rankings.includes(player.id)) rankings = [...rankings, player.id];

  const stillPlaying = state.players.filter(
    (item) => !rankings.includes(item.id) && !playerFinished({ ...state, tokens }, item.id),
  );
  const status: GameState["status"] = stillPlaying.length === 0 ? "finished" : state.status;

  const bonus = (state.dice === 6 || move.captures.length > 0) && !justFinished && status === "playing";
  const nextIndex = bonus
    ? state.currentPlayerIndex
    : nextPlayerIndex(state, state.currentPlayerIndex, tokens, rankings);

  const capturedNames = move.captures
    .map((id) => state.tokens.find((token) => token.id === id))
    .filter((token): token is Token => Boolean(token))
    .map((token) => state.players.find((item) => item.id === token.playerId)?.name ?? "یک مهره");

  const bits = [`${player.name} یک مهره را جلو برد.`];
  if (move.from < 0) bits[0] = `${player.name} یک مهره را از خانه بیرون آورد.`;
  if (isFinishedProgress(move.to, state.maxPlayers)) bits.push("به مرکز رسید.");
  if (capturedNames.length) bits.push(`${capturedNames.join(" و ")} را زد.`);
  if (justFinished) bits.push(`${player.name} نفر ${rankings.indexOf(player.id) + 1} شد.`);
  if (bonus && state.dice === 6) bits.push("یک تاس دیگر.");
  else if (bonus) bits.push("زدن مهره یک تاس دیگر می‌دهد.");

  const lastMove: LastMove = {
    id: state.moveSeq + 1,
    tokenId,
    seat: player.seat,
    from: move.from,
    to: move.to,
    capturedIds: move.captures,
  };

  const introducedIds =
    move.from < 0 && !(state.introducedIds ?? []).includes(player.id)
      ? [...(state.introducedIds ?? []), player.id]
      : (state.introducedIds ?? []);

  return {
    ...state,
    revision: state.revision + 1,
    tokens,
    introducedIds,
    rankings,
    status,
    phase: status === "finished" ? "roll" : "roll",
    currentPlayerIndex: status === "finished" ? state.currentPlayerIndex : nextIndex,
    consecutiveSixes: bonus && state.dice === 6 ? state.consecutiveSixes : 0,
    dice: state.dice,
    busyUntil: now + hopDuration(move.from, move.to) + (move.captures.length ? HOP_MS : 0),
    rollDeadline:
      status === "finished"
        ? 0
        : rollClock(
            state.players,
            nextIndex,
            now,
            now + hopDuration(move.from, move.to) + (move.captures.length ? HOP_MS : 0),
            true,
          ),
    moveSeq: state.moveSeq + 1,
    lastMove,
    log: withLog(
      state,
      justFinished ? "win" : move.captures.length ? "capture" : "move",
      bits.join(" "),
    ),
  };
}

export function addBot(state: GameState): GameState {
  if (state.status !== "lobby") return state;
  if (state.players.length >= state.maxPlayers) return state;
  const seat = nextOpenSeat(state);
  const name = BOT_NAMES.find((candidate) => state.players.every((player) => player.name !== candidate)) ?? `ربات ${seat + 1}`;
  const player: Player = {
    id: createId("bot"),
    name,
    seat,
    kind: "bot",
    peerId: null,
    connected: true,
  };
  const players = [...state.players, player];
  return {
    ...state,
    revision: state.revision + 1,
    players,
    tokens: createTokens(players),
    log: withLog(state, "system", `${name} به عنوان ربات نشست.`),
  };
}

export function addHuman(state: GameState, player: Player): GameState | null {
  if (state.status !== "lobby") return null;
  if (state.players.some((item) => item.id === player.id || item.peerId === player.peerId)) return state;
  if (state.players.length >= state.maxPlayers) return null;
  const seated: Player = { ...player, seat: nextOpenSeat(state), kind: "human", connected: true };
  const players = [...state.players, seated];
  return {
    ...state,
    revision: state.revision + 1,
    players,
    tokens: createTokens(players),
    log: withLog(state, "system", `${seated.name} به بازی پیوست.`),
  };
}

export function startMatch(state: GameState, now: number): GameState {
  if (state.status !== "lobby") return state;
  if (state.players.length < 2) return state;
  const players = state.players.map((player) => ({ ...player }));
  return {
    ...state,
    revision: state.revision + 1,
    status: "playing",
    phase: "roll",
    players,
    tokens: createTokens(players),
    currentPlayerIndex: 0,
    rollerIndex: 0,
    dice: null,
    consecutiveSixes: 0,
    introducedIds: [],
    openingMisses: {},
    rankings: [],
    busyUntil: now + 400,
    rollDeadline: rollClock(players, 0, now, now + 400, true),
    moveSeq: 0,
    lastMove: null,
    log: withLog(state, "system", `بازی شروع شد. ${players[0].name} اول تاس می‌اندازد.`),
  };
}

export function rematch(state: GameState, now: number): GameState {
  const players = state.players.map((player) => ({ ...player }));
  return {
    ...state,
    revision: state.revision + 1,
    status: "playing",
    phase: "roll",
    players,
    tokens: createTokens(players),
    currentPlayerIndex: 0,
    rollerIndex: 0,
    dice: null,
    rollId: state.rollId + 1,
    consecutiveSixes: 0,
    introducedIds: [],
    openingMisses: {},
    rankings: [],
    busyUntil: now + 400,
    rollDeadline: rollClock(players, 0, now, now + 400, true),
    moveSeq: state.moveSeq + 1,
    lastMove: null,
    log: [entry("system", "بازی دوباره. مهره‌ها برگشتند سر جای خود.")],
  };
}

export function convertPeerToBot(state: GameState, peerId: string): GameState {
  const player = state.players.find((item) => item.peerId === peerId);
  if (!player || player.kind === "bot") return state;
  const players = state.players.map((item) =>
    item.peerId === peerId ? { ...item, kind: "bot" as const, connected: true } : item,
  );
  return {
    ...state,
    revision: state.revision + 1,
    players,
    hostId: state.hostId === player.id ? state.hostId : state.hostId,
    log: withLog(state, "system", `${player.name} رفت. ربات مهره‌هایش را ادامه می‌دهد.`),
  };
}

export function applyIntent(state: GameState, intent: Intent, actorId: string, now: number): GameState | null {
  if (intent.type === "add-bot") {
    if (actorId !== state.hostId) return null;
    const next = addBot(state);
    return next === state ? null : next;
  }
  if (intent.type === "start") {
    if (actorId !== state.hostId) return null;
    const next = startMatch(state, now);
    return next === state ? null : next;
  }
  if (intent.type === "rematch") {
    if (actorId !== state.hostId) return null;
    if (state.rankings.length === 0 && state.status !== "finished") return null;
    return rematch(state, now);
  }
  if (intent.type === "pass") {
    if (actorId !== state.hostId && actorId !== state.players[state.currentPlayerIndex]?.id) return null;
    if (state.phase !== "roll" || state.status !== "playing" || now < state.busyUntil) return null;
    if (state.rollDeadline && now + 250 < state.rollDeadline) return null;
    const next = passRoll(state, now);
    return next.revision === state.revision ? null : next;
  }
  if (state.status !== "playing") return null;
  if (now < state.busyUntil) return null;
  const current = state.players[state.currentPlayerIndex];
  if (!current) return null;
  const actorIsCurrent = current.id === actorId || (current.kind === "bot" && actorId === state.hostId);
  if (!actorIsCurrent) return null;
  if (intent.type === "roll") {
    if (state.phase !== "roll") return null;
    return applyRoll(state, rollForTurn(state), now);
  }
  if (intent.type === "move") {
    const next = applyMove(state, intent.tokenId, now);
    return next === state ? null : next;
  }
  return null;
}

/**
 * True until this player has brought one token out of the yard.
 * Later sixes, including bringing out the other tokens, stay fair.
 */
export function needsOpeningSix(state: GameState): boolean {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return false;
  if ((state.introducedIds ?? []).includes(player.id)) return false;
  return state.tokens.some((token) => token.playerId === player.id && token.progress < 0);
}

/** Each face from 1 to 6 is equally likely. Rejection sampling removes modulo bias. */
export function rollDie(): number {
  return rollIndex(6) + 1;
}

/**
 * The first two tries to leave the yard use a fair die.
 * After two misses, 6 is one extra face in seven, still well short of a sure six.
 */
export function openingFaceCount(misses: number): number {
  return misses < 2 ? 6 : 7;
}

function rollForTurn(state: GameState): number {
  if (!needsOpeningSix(state)) return rollDie();
  const player = state.players[state.currentPlayerIndex];
  const misses = state.openingMisses?.[player.id] ?? 0;
  if (openingFaceCount(misses) === 6) return rollDie();
  const faces = [1, 2, 3, 4, 5, 6, 6];
  return faces[rollIndex(faces.length)];
}

function noteOpeningMiss(state: GameState, value: number): Record<string, number> {
  const misses = { ...(state.openingMisses ?? {}) };
  if (value === 6 || !needsOpeningSix(state)) return misses;
  const player = state.players[state.currentPlayerIndex];
  misses[player.id] = (misses[player.id] ?? 0) + 1;
  return misses;
}

function rollIndex(spanCount: number): number {
  const bucket = new Uint32Array(1);
  const span = 0x1_0000_0000;
  const limit = span - (span % spanCount);
  let pick = 0;
  do {
    crypto.getRandomValues(bucket);
    pick = bucket[0];
  } while (pick >= limit);
  return pick % spanCount;
}

export function describeMove(state: GameState, token: Token): string {
  const len = trackLength(state.maxPlayers);
  const home = homeLength(state.maxPlayers);
  if (token.progress < 0) return "خروج از خانه";
  if (token.progress >= len + home) return "رسیده";
  if (token.progress >= len) return "مسیر خانه";
  if (token.progress === 0) return "ترک شروع";
  if (len - token.progress <= 6) return "نزدیک خانه";
  return "روی مسیر";
}

export function activePlayer(state: GameState): Player | null {
  return state.players[state.currentPlayerIndex] ?? null;
}

export { trackLength, homeLength, finishProgress };
