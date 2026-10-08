import type { GameState, LegalMove } from "@/types/game";
import { trackLength } from "@/utils/boardGeometry";

export function chooseBotMove(state: GameState, moves: LegalMove[]): LegalMove {
  const len = trackLength(state.maxPlayers);
  const scored = moves.map((move) => {
    let score = 0;
    if (move.finishes) score += 120;
    if (move.captures.length) score += 80 + move.captures.length * 10;
    if (move.from < 0) score += 46;
    if (move.to >= len && !move.finishes) score += 18;
    const token = state.tokens.find((item) => item.id === move.tokenId);
    score += Math.max(0, move.to) * 0.35;
    if (token && token.progress >= len) score += 8;
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const tied = scored.filter((item) => item.score >= best - 4);
  return tied[Math.floor(Math.random() * tied.length)].move;
}
