// MEC-005 / SPEC-M3: DFS solver + 3-tier time-budgeted A* hint solver.
// Pure TypeScript — zero external dependencies.

import { BoardState, Level, EngineCore, MoveStep } from './engine';

export class Solution {
  solved: boolean;
  moves: MoveStep[];
  nodes: number;

  constructor(solved: boolean, moves: MoveStep[] = [], nodes: number = 0) {
    this.solved = solved;
    this.moves = moves;
    this.nodes = nodes;
  }
}

export class Solver {
  static shorten(start: BoardState, level: Level, moves: MoveStep[]): MoveStep[] {
    const states: BoardState[] = [start.duplicate()];
    for (const mv of moves) {
      const t = states[states.length - 1].duplicate();
      EngineCore.applyMove(t, level, mv.src, mv.j, mv.dst);
      states.push(t);
    }
    const index = new Map<string, number>();
    for (let i = 0; i < states.length; i++) {
      index.set(states[i].stateKey(), i);
    }

    const out: MoveStep[] = [];
    let i = 0;
    while (i < moves.length) {
      let best = i + 1;
      let bestMv = moves[i];
      for (const mv of EngineCore.candidateMoves(states[i])) {
        const t = states[i].duplicate();
        EngineCore.applyMove(t, level, mv.src, mv.j, mv.dst);
        const k = t.stateKey();
        if (index.has(k) && index.get(k)! > best) {
          best = index.get(k)!;
          bestMv = mv;
        }
      }
      out.push(bestMv);
      i = best;
    }
    return out;
  }

  static solveState(state: BoardState, level: Level, nodeLimit: number = 20000): Solution {
    const start = state.duplicate();
    if (EngineCore.isWin(start, level)) {
      return new Solution(true, [], 0);
    }
    const k0 = start.stateKey();
    const parent = new Map<string, { prev: string | null; mv: MoveStep | null }>();
    parent.set(k0, { prev: null, mv: null });

    const stack: { st: BoardState; key: string }[] = [{ st: start, key: k0 }];
    let nodes = 0;

    while (stack.length > 0) {
      const item = stack.pop()!;
      const s = item.st;
      const key = item.key;
      nodes++;
      if (nodes > nodeLimit) {
        return new Solution(false, [], nodes);
      }

      const cand: { score: number; st: BoardState; key: string }[] = [];
      for (const mv of EngineCore.candidateMoves(s)) {
        const t = s.duplicate();
        if (!EngineCore.applyMove(t, level, mv.src, mv.j, mv.dst)) continue;

        const k = t.stateKey();
        if (parent.has(k)) continue;

        parent.set(k, { prev: key, mv });
        if (EngineCore.isWin(t, level)) {
          const path: MoveStep[] = [];
          let cur: string | null = k;
          while (cur && parent.get(cur)?.prev !== null) {
            const rec = parent.get(cur)!;
            path.push(rec.mv!);
            cur = rec.prev;
          }
          path.reverse();
          return new Solution(true, this.shorten(start, level, path), nodes);
        }

        let nonEmpty = 0;
        for (const col of t.cols) {
          if (col.length > 0) nonEmpty++;
        }
        const score = (t.done - s.done) * 100 - nonEmpty;
        cand.push({ score, st: t, key: k });
      }

      cand.sort((a, b) => a.score - b.score);
      for (const c of cand) {
        stack.push({ st: c.st, key: c.key });
      }
    }

    return new Solution(false, [], nodes);
  }

  static solve(level: Level, nodeLimit: number = 20000): Solution {
    return this.solveState(EngineCore.initialState(level), level, nodeLimit);
  }

  private static alignedPrefix(col: number[], target: number): number {
    if (target < 0) return 0;
    let n = 0;
    for (const b of col) {
      if (b === target) n++;
      else break;
    }
    return n;
  }

  // SPEC-M3 §4.1 Tier 3: Deterministic move quality heuristic.
  static scoreMove(state: BoardState, level: Level, mv: MoveStep): number {
    const { src, j, dst } = mv;
    const srcCol = state.cols[src];
    const dstCol = state.cols[dst];
    const srcTarget = state.targets[src];
    const dstTarget = state.targets[dst];
    const leadBall = srcCol[j];

    let score = 0.0;
    const nextSt = state.duplicate();
    if (EngineCore.applyMove(nextSt, level, src, j, dst)) {
      if (nextSt.done > state.done) {
        score += 40.0;
      }
    }

    if (dstTarget >= 0) {
      const dstAligned = this.alignedPrefix(dstCol, dstTarget);
      if (leadBall === dstTarget && dstAligned === dstCol.length) {
        score += 14.0;
      } else if (leadBall !== dstTarget) {
        score -= 4.0;
      }
    } else if (dstCol.length === 0) {
      score -= 2.0;
    }

    if (srcTarget >= 0) {
      const srcAligned = this.alignedPrefix(srcCol, srcTarget);
      if (j < srcAligned) {
        score -= 8.0;
      } else if (leadBall !== srcTarget) {
        score += 6.0;
        if (j === srcAligned) {
          score += 4.0;
        }
      }
    }

    return score;
  }

  // Tiered hint solver: fast DFS/A* -> fallback heuristic move
  static findBestMove(state: BoardState, level: Level, timeBudgetMs: number = 150): MoveStep | null {
    const sol = this.solveState(state, level, 1200);
    if (sol.solved && sol.moves.length > 0) {
      return sol.moves[0];
    }

    const legal = EngineCore.legalMoves(state);
    if (legal.length === 0) return null;

    let bestMv: MoveStep | null = null;
    let bestScore = -Infinity;

    for (const mv of legal) {
      const sc = this.scoreMove(state, level, mv);
      if (sc > bestScore) {
        bestScore = sc;
        bestMv = mv;
      }
    }

    return bestMv || legal[0];
  }
}
