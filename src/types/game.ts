export type PlayerCount = 2 | 3 | 4 | 5 | 6;

export type MatchStatus = "lobby" | "playing" | "finished";

export type TurnPhase = "lobby" | "roll" | "move";

export type LogTone = "info" | "move" | "capture" | "six" | "win" | "system";

export interface Player {
  id: string;
  name: string;
  seat: number;
  kind: "human" | "bot";
  peerId: string | null;
  connected: boolean;
}

export interface Token {
  id: string;
  playerId: string;
  seat: number;
  /** 0–3, also the yard slot. */
  index: number;
  /**
   * -1 yard
   * 0 .. trackLength-1 shared track (0 is this seat's start)
   * trackLength .. trackLength+homeLength-1 home lane
   * trackLength+homeLength finished in the center
   */
  progress: number;
}

export interface LogEntry {
  id: string;
  text: string;
  tone: LogTone;
}

export interface LastMove {
  id: number;
  tokenId: string;
  seat: number;
  from: number;
  to: number;
  capturedIds: string[];
}

export interface GameState {
  revision: number;
  roomId: string | null;
  hostId: string;
  maxPlayers: PlayerCount;
  status: MatchStatus;
  players: Player[];
  tokens: Token[];
  currentPlayerIndex: number;
  /** Seat index of the player who rolled the dice currently on the table. */
  rollerIndex: number;
  dice: number | null;
  rollId: number;
  phase: TurnPhase;
  consecutiveSixes: number;
  /** Players who have already brought a token out of the yard. */
  introducedIds: string[];
  /** Failed yard rolls per player, before their first token comes out. */
  openingMisses: Record<string, number>;
  rankings: string[];
  log: LogEntry[];
  busyUntil: number;
  moveSeq: number;
  lastMove: LastMove | null;
}

export interface SeatSetup {
  name: string;
  kind: "human" | "bot";
}

export type Intent =
  | { type: "roll" }
  | { type: "move"; tokenId: string }
  | { type: "start" }
  | { type: "add-bot" }
  | { type: "rematch" };

export interface LegalMove {
  tokenId: string;
  from: number;
  to: number;
  captures: string[];
}

export interface Point {
  x: number;
  y: number;
}

export interface TrackCell {
  index: number;
  x: number;
  y: number;
  size: number;
  /** Clockwise degrees so the square's top points outward. */
  rotation: number;
  zone: number;
  safe: boolean;
  startFor: number | null;
  star: boolean;
}

export interface HomeCell {
  x: number;
  y: number;
  size: number;
  rotation: number;
  seat: number;
  homeIndex: number;
}

export interface YardLayout {
  seat: number;
  polygon: Point[];
  slots: Point[];
  label: Point;
  /** Width available for the name, in viewBox units. */
  labelWidth: number;
  /** Grid rect for the classic board; null on radial boards. */
  frame: { x: number; y: number; w: number; h: number } | null;
}

export interface BoardLayout {
  playerCount: PlayerCount;
  viewBox: number;
  shape: "square" | "polygon";
  trackLength: number;
  homeLength: number;
  cellSize: number;
  track: TrackCell[];
  homes: HomeCell[][];
  yards: YardLayout[];
  starts: number[];
  safeIndices: number[];
  starIndices: number[];
  center: Point & { r: number };
  outline: Point[];
  /** Unit scale used by radial boards; 1 on the classic grid. */
  rotation: number[];
}
