// MEC-001..MEC-005: Stateful game session wrapper (undo history, props, hints, events).
// Pure TypeScript — zero external dependencies.

import { Level, BoardState, EngineCore, MoveStep, GameEvent, isHidden } from './engine';
import { Solver } from './solver';

export interface MoveResult {
  ok: boolean;
  reason: string;
  events: GameEvent[];
}

export class GameSession {
  level: Level;
  state: BoardState;
  undo_limit: number = 3; // -1 = unlimited
  undos_used: number = 0;
  moves: number = 0;
  private _history: BoardState[] = [];

  constructor(level: Level, undo_limit: number = 3) {
    this.level = level;
    this.state = EngineCore.initialState(level);
    this.undo_limit = undo_limit;
  }

  isWon(): boolean {
    return EngineCore.isWin(this.state, this.level);
  }

  progress(): { done: number; total: number } {
    return { done: this.state.done, total: this.level.total_targets };
  }

  deadReason(maxStates: number = 80): string {
    return EngineCore.deadReason(this.state, this.level, maxStates);
  }

  legalMoves(): MoveStep[] {
    return EngineCore.legalMoves(this.state);
  }

  topRunStart(src: number): number {
    const col = this.state.cols[src];
    if (col.length === 0) return 0;
    let j = col.length - 1;
    while (j > 0 && col[j - 1] === col[j] && !isHidden(col[j - 1])) {
      j--;
    }
    return j;
  }

  tryMove(src: number, j: number, dst: number): MoveResult {
    const reason = EngineCore.rejectReason(this.state, src, j, dst);
    if (reason !== "") {
      return { ok: false, reason, events: [] };
    }
    this._history.push(this.state.duplicate());
    const events: GameEvent[] = [];
    EngineCore.applyMove(this.state, this.level, src, j, dst, true, events, true);
    this.moves++;
    return { ok: true, reason: "", events };
  }

  canUndo(): boolean {
    if (this._history.length === 0) return false;
    return this.undo_limit < 0 || this.undos_used < this.undo_limit;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.state = this._history.pop()!;
    this.undos_used++;
    this.moves = Math.max(0, this.moves - 1);
    return true;
  }

  addExtraTube(): number {
    this._history.push(this.state.duplicate());
    const col = EngineCore.addTube(this.state, this.level.capacity);
    if (col < 0) {
      this._history.pop();
    }
    return col;
  }

  hint(budgetMs: number = 150): MoveStep | null {
    return Solver.findBestMove(this.state, this.level, budgetMs);
  }
}
