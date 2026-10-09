import assert from "node:assert/strict";
import { buildLayout, homeLength, minCenterDistance, seatOrder, seatPlan, trackLength } from "../src/utils/boardGeometry.ts";
import {
  addBot,
  addHuman,
  applyIntent,
  applyMove,
  applyRoll,
  createLocalMatch,
  legalMoves,
  needsOpeningSix,
  openingFaceCount,
  startMatch,
  createLobby,
  findReturningPlayer,
  markPeerAway,
  reattachHuman,
  tokenParked,
} from "../src/utils/gameRules.ts";
import type { PlayerCount } from "../src/types/game.ts";

function adjacent(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

const classicCells: Array<[number, number]> = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0],
];

assert.equal(classicCells.length, 56);
for (let i = 0; i < classicCells.length; i++) {
  const next = classicCells[(i + 1) % classicCells.length];
  assert.equal(adjacent(classicCells[i], next), true, `classic step ${i} is not orthogonal`);
}

assert.equal(trackLength(2), 56);
assert.equal(trackLength(3), 56);
assert.equal(homeLength(2), 5);
assert.equal(homeLength(5), 4);
assert.deepEqual(seatPlan(2), [0, 2]);
assert.deepEqual(seatPlan(3), [0, 1, 2]);
assert.deepEqual(seatOrder(2, 3), [3, 1]);
assert.deepEqual(seatOrder(3, 1), [1, 2, 3]);
assert.deepEqual(seatOrder(4, 2), [2, 3, 0, 1]);
assert.equal(buildLayout(2).track.length, 56);
assert.equal(buildLayout(3).homes.length, 4);

for (const count of [4, 5, 6] as PlayerCount[]) {
  const layout = buildLayout(count);
  assert.equal(layout.track.length, trackLength(count));
  assert.equal(layout.homes.length, count);
  assert.equal(layout.homes[0].length, layout.homeLength);
  assert.equal(layout.yards.length, count);
  assert.equal(new Set(layout.track.map((cell) => cell.index)).size, layout.track.length);
  const gap = minCenterDistance(layout);
  console.log(`layout ${count}: cells ${layout.track.length}, gap ratio ${gap.toFixed(3)}, cell ${layout.cellSize.toFixed(1)}`);
  assert.ok(gap > 0.9, `layout ${count} cells overlap (${gap})`);
  for (let i = 0; i < layout.track.length; i++) {
    const a = layout.track[i];
    const b = layout.track[(i + 1) % layout.track.length];
    const step = Math.hypot(a.x - b.x, a.y - b.y) / a.size;
    assert.ok(step < 1.08, `layout ${count} track step ${i} is loose (${step})`);
  }
  for (const seat of layout.starts) {
    assert.ok(layout.track[seat].startFor != null);
  }
}

{
  const match = fresh(2);
  assert.equal(match.players.length, 2);
  assert.deepEqual(match.players.map((player) => player.seat), [0, 2]);
  assert.equal(match.maxPlayers, 2);
}

function fresh(count: PlayerCount = 4) {
  return createLocalMatch(
    count,
    Array.from({ length: count }, (_, index) => ({ name: `P${index}`, kind: index === 0 ? "human" : "bot" })),
    "Rose",
  );
}

{
  let state = fresh();
  assert.equal(needsOpeningSix(state), true);
  state = applyRoll(state, 6, 0);
  state = applyMove(state, legalMoves(state)[0].tokenId, 0);
  assert.equal(needsOpeningSix(state), false);
  const home = state.tokens.filter((token) => token.playerId === state.players[0].id && token.progress < 0);
  assert.equal(home.length, 3);
  state = { ...state, currentPlayerIndex: 1 };
  assert.equal(needsOpeningSix(state), true);
  assert.equal(openingFaceCount(0), 6);
  assert.equal(openingFaceCount(1), 6);
  assert.equal(openingFaceCount(2), 7);
}

{
  let state = fresh();
  const id = state.players[0].id;
  state = applyRoll(state, 2, 0);
  assert.equal(state.openingMisses[id], 1);
  state = { ...state, currentPlayerIndex: 0, phase: "roll", busyUntil: 0 };
  state = applyRoll(state, 4, 0);
  assert.equal(state.openingMisses[id], 2);
  state = { ...state, currentPlayerIndex: 0, phase: "roll", busyUntil: 0 };
  state = applyRoll(state, 6, 0);
  assert.equal(state.openingMisses[id], 2);
}

{
  let state = fresh();
  const before = state.currentPlayerIndex;
  state = applyRoll(state, 3, 0);
  assert.equal(state.dice, 3);
  assert.equal(state.phase, "roll");
  assert.equal(state.rollerIndex, before);
  assert.notEqual(state.currentPlayerIndex, before);
  assert.equal(legalMoves(state).length, 0);
}

{
  let state = fresh();
  state = applyRoll(state, 6, 0);
  assert.equal(state.phase, "move");
  const moves = legalMoves(state);
  assert.equal(moves.length, 4);
  assert.ok(moves.every((move) => move.from === -1 && move.to === 0));
  state = applyMove(state, moves[0].tokenId, 0);
  assert.equal(state.phase, "roll");
  assert.equal(state.currentPlayerIndex, 0);
  assert.equal(state.consecutiveSixes, 1);
  const token = state.tokens.find((item) => item.id === moves[0].tokenId);
  assert.equal(token?.progress, 0);
}

{
  let state = fresh();
  state = applyRoll(state, 6, 0);
  state = applyMove(state, legalMoves(state)[0].tokenId, 0);
  state = applyRoll(state, 6, 0);
  state = applyMove(state, legalMoves(state).find((move) => move.from < 0)!.tokenId, 0);
  state = applyRoll(state, 6, 0);
  assert.equal(state.currentPlayerIndex, 1);
  assert.equal(state.consecutiveSixes, 0);
}

{
  let state = fresh(4);
  const red = state.players[0];
  const green = state.players[1];
  state = {
    ...state,
    phase: "move",
    dice: 1,
    tokens: state.tokens.map((token) => {
      if (token.playerId === red.id && token.index === 0) return { ...token, progress: 3 };
      if (token.playerId === green.id && token.index === 0) return { ...token, progress: 13 };
      return token;
    }),
  };
  // Red progress 3 is absolute start+3. Green progress 13 is start(14)+13 = 27.
  // Place green on the square red will land on.
  const layout = buildLayout(4);
  const redStart = layout.starts[0];
  const landing = (redStart + 4) % layout.trackLength;
  const greenProgress = (landing - layout.starts[1] + layout.trackLength) % layout.trackLength;
  state = {
    ...state,
    tokens: state.tokens.map((token) => {
      if (token.playerId === red.id && token.index === 0) return { ...token, progress: 3 };
      if (token.playerId === green.id && token.index === 0) return { ...token, progress: greenProgress };
      return token;
    }),
  };
  const redToken = state.tokens.find((token) => token.playerId === red.id && token.index === 0)!;
  const moves = legalMoves(state);
  const capture = moves.find((move) => move.tokenId === redToken.id);
  assert.ok(capture);
  assert.equal(capture!.captures.length, 1);
  state = applyMove(state, redToken.id, 0);
  const victim = state.tokens.find((token) => token.playerId === green.id && token.index === 0);
  assert.equal(victim?.progress, -1);
  assert.equal(state.currentPlayerIndex, 0);
}

{
  let state = fresh(4);
  const layout = buildLayout(4);
  const red = state.players[0];
  const green = state.players[1];
  const star = layout.starIndices[0];
  const redProgress = (star - layout.starts[0] + layout.trackLength) % layout.trackLength;
  const greenProgress = (star - layout.starts[1] + layout.trackLength) % layout.trackLength;
  state = {
    ...state,
    phase: "move",
    dice: 1,
    tokens: state.tokens.map((token) => {
      if (token.playerId === red.id && token.index === 0) return { ...token, progress: redProgress - 1 };
      if (token.playerId === green.id && token.index === 0) return { ...token, progress: greenProgress };
      return token;
    }),
  };
  const redToken = state.tokens.find((token) => token.playerId === red.id && token.index === 0)!;
  const move = legalMoves(state).find((item) => item.tokenId === redToken.id)!;
  assert.equal(move.captures.length, 1);
  state = applyMove(state, redToken.id, 0);
  const victim = state.tokens.find((token) => token.playerId === green.id && token.index === 0);
  assert.equal(victim?.progress, -1);
}

{
  let state = fresh(4);
  const layout = buildLayout(4);
  const red = state.players[0];
  const green = state.players[1];
  const start = layout.starts[0];
  const greenProgress = (start - layout.starts[1] + layout.trackLength) % layout.trackLength;
  state = {
    ...state,
    phase: "move",
    dice: 6,
    tokens: state.tokens.map((token) =>
      token.playerId === green.id && token.index === 0 ? { ...token, progress: greenProgress } : token,
    ),
  };
  const redToken = state.tokens.find((token) => token.playerId === red.id && token.index === 0)!;
  const move = legalMoves(state).find((item) => item.tokenId === redToken.id)!;
  assert.equal(move.from, -1);
  assert.equal(move.captures.length, 1);
  state = applyMove(state, redToken.id, 0);
  assert.equal(state.tokens.find((token) => token.playerId === green.id && token.index === 0)?.progress, -1);
  assert.equal(state.tokens.find((token) => token.id === redToken.id)?.progress, 0);
}

{
  let state = fresh(4);
  const len = trackLength(4);
  const red = state.players[0];
  const first = state.tokens.find((item) => item.playerId === red.id && item.index === 0)!;
  const second = state.tokens.find((item) => item.playerId === red.id && item.index === 1)!;
  state = {
    ...state,
    phase: "move",
    dice: 6,
    tokens: state.tokens.map((token) => (token.id === first.id ? { ...token, progress: len - 1 } : token)),
  };
  assert.equal(legalMoves(state).some((move) => move.tokenId === first.id), false);
  state = { ...state, dice: 5 };
  const exact = legalMoves(state).find((move) => move.tokenId === first.id);
  assert.equal(exact?.to, len + 4);
  assert.equal(exact?.finishes, true);
  state = applyMove(state, first.id, 0);
  assert.equal(tokenParked(state, first.id), true);

  state = {
    ...state,
    phase: "move",
    dice: 5,
    currentPlayerIndex: 0,
    tokens: state.tokens.map((token) => (token.id === second.id ? { ...token, progress: len - 1 } : token)),
  };
  assert.equal(legalMoves(state).some((move) => move.tokenId === second.id), false);
  state = { ...state, dice: 4 };
  const behind = legalMoves(state).find((move) => move.tokenId === second.id);
  assert.equal(behind?.to, len + 3);
  assert.equal(behind?.finishes, true);
  state = applyMove(state, second.id, 0);
  assert.equal(tokenParked(state, second.id), true);
  assert.equal(state.tokens.find((item) => item.id === first.id)?.progress, len + 4);
}

{
  const lobby = createLobby({ roomId: "ABCDE", hostId: "host", hostName: "Rose", count: 6, peerId: "host" });
  const started = startMatch(
    {
      ...lobby,
      players: [
        ...lobby.players,
        { id: "b", name: "Kian", seat: 1, kind: "bot", peerId: null, connected: true },
      ],
    },
    0,
  );
  assert.equal(started.status, "playing");
  assert.equal(started.tokens.length, 8);
  assert.equal(started.maxPlayers, 6);
  assert.deepEqual(started.players.map((player) => player.seat), [0, 1]);
}

{
  const lobby = createLobby({ roomId: "PAIR", hostId: "host", hostName: "Rose", count: 2, peerId: "host" });
  const withBot = addBot(lobby);
  const started = startMatch(withBot, 0);
  assert.deepEqual(started.players.map((player) => player.seat), [0, 2]);
  assert.deepEqual(
    [...new Set(started.tokens.map((token) => token.seat))].sort(),
    [0, 2],
  );
}

{
  const match = createLocalMatch(
    2,
    [
      { name: "ساجد", kind: "human", seat: 3 },
      { name: "ربات", kind: "bot", seat: 1 },
    ],
    "ساجد",
  );
  assert.deepEqual(match.players.map((player) => player.seat), [3, 1]);
  const lobby = createLobby({
    roomId: "RED1",
    hostId: "host",
    hostName: "ساجد",
    count: 2,
    peerId: "host",
    hostSeat: 3,
  });
  assert.equal(lobby.players[0]?.seat, 3);
  const joined = addHuman(
    lobby,
    { id: "guest", name: "نیما", seat: 3, kind: "human", peerId: "g", connected: true },
    3,
  );
  assert.equal(joined?.players[1]?.seat, 1);
  const open = createLobby({
    roomId: "OPEN",
    hostId: "host",
    hostName: "ساجد",
    count: 4,
    peerId: "host",
    hostSeat: 0,
  });
  const claimed = addHuman(
    open,
    { id: "guest", name: "نیما", seat: 3, kind: "human", peerId: "g", connected: true },
    3,
  );
  assert.equal(claimed?.players[1]?.seat, 3);
}

{
  let state = fresh(4);
  const layout = buildLayout(4);
  const red = state.players[0];
  const green = state.players[1];
  const landing = (layout.starts[0] + 4) % layout.trackLength;
  const greenProgress = (landing - layout.starts[1] + layout.trackLength) % layout.trackLength;
  state = {
    ...state,
    phase: "move",
    dice: 1,
    tokens: state.tokens.map((token) => {
      if (token.playerId === red.id && token.index === 0) return { ...token, progress: 3 };
      if (token.playerId === green.id && token.index <= 1) return { ...token, progress: greenProgress };
      return token;
    }),
  };
  const redToken = state.tokens.find((token) => token.playerId === red.id && token.index === 0)!;
  const pile = legalMoves(state).find((move) => move.tokenId === redToken.id);
  assert.ok(pile);
  assert.equal(pile!.captures.length, 2);
  state = applyMove(state, redToken.id, 0);
  const sentHome = state.tokens.filter((token) => token.playerId === green.id && token.progress < 0);
  assert.equal(sentHome.length, 4);
}

{
  let state = fresh(4);
  const layout = buildLayout(4);
  const red = state.players[0];
  const green = state.players[1];
  const ahead = (layout.starts[0] + 2) % layout.trackLength;
  const greenProgress = (ahead - layout.starts[1] + layout.trackLength) % layout.trackLength;
  state = {
    ...state,
    phase: "move",
    dice: 4,
    tokens: state.tokens.map((token) => {
      if (token.playerId === red.id && token.index === 0) return { ...token, progress: 1 };
      if (token.playerId === green.id && token.index <= 1) return { ...token, progress: greenProgress };
      return token;
    }),
  };
  const redToken = state.tokens.find((token) => token.playerId === red.id && token.index === 0)!;
  const move = legalMoves(state).find((item) => item.tokenId === redToken.id);
  assert.ok(move);
  assert.equal(move!.to, 5);
  assert.equal(move!.captures.length, 0);
  state = applyMove(state, redToken.id, 0);
  const stillThere = state.tokens.filter((token) => token.playerId === green.id && token.progress === greenProgress);
  assert.equal(stillThere.length, 2);
}

{
  let state = fresh(2);
  const before = state.currentPlayerIndex;
  assert.ok(state.rollDeadline > Date.now());
  const early = applyIntent(state, { type: "pass" }, state.hostId, Date.now());
  assert.equal(early, null);
  state = applyIntent(state, { type: "pass" }, state.hostId, state.rollDeadline)!;
  assert.notEqual(state.currentPlayerIndex, before);
}

{
  let state = fresh(2);
  const human = state.players[0];
  state = { ...state, players: state.players.map((player) => (player.id === human.id ? { ...player, peerId: "peer-a", connected: true } : player)) };
  const away = markPeerAway(state, "peer-a");
  assert.equal(away.players[0].kind, "human");
  assert.equal(away.players[0].connected, false);
  assert.equal(away.rollDeadline, 0);
  assert.equal(applyIntent(away, { type: "pass" }, away.hostId, Date.now() + 60_000), null);
  const back = reattachHuman(away, human.id, "peer-b");
  assert.equal(back.players[0].connected, true);
  assert.equal(back.players[0].peerId, "peer-b");
  assert.equal(back.players[0].kind, "human");
  assert.ok(back.rollDeadline > Date.now());
}

{
  const lobby = createLobby({ roomId: "BACK", hostId: "host", hostName: "سجاد", count: 2, peerId: "host" });
  const seated = addHuman(
    lobby,
    { id: "guest", name: "میلاد", seat: 2, kind: "human", peerId: "old", connected: true },
    2,
  )!;
  const started = startMatch(seated, 0);
  const away = markPeerAway(started, "old");
  const found = findReturningPlayer(away, { playerId: "new-id", name: "میلاد", seat: 2 }, "new-peer");
  assert.equal(found?.id, "guest");
  const back = reattachHuman(away, found!.id, "new-peer");
  assert.equal(back.players.find((player) => player.id === "guest")?.connected, true);
  assert.equal(back.tokens.filter((token) => token.playerId === "host").length, 4);
  const stranger = findReturningPlayer(back, { playerId: "x", name: "کس دیگری", seat: 0 }, "x");
  assert.equal(stranger, undefined);
}

console.log("rules ok");
