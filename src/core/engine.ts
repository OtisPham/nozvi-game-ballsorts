// MEC-001, MEC-002, MEC-003, MEC-004: Core Ball Sort rules engine.
// Pure TypeScript — zero external dependencies.

import { LevelSpec, TubeSpec, LockSpec, parse, dump } from './codec';

export const HID = 1000;
export const MAX_COLUMNS = 9;
export const MAX_BASE_COLUMNS = 8;
export const MIN_BOARD = 3;
export const MAX_COLORS = 62;

export function isHidden(ball: number): boolean {
  return ball >= HID;
}

export function trueColor(ball: number): number {
  return ball >= HID ? ball - HID : ball;
}

export interface MoveStep {
  src: number;
  j: number;
  dst: number;
}

export interface GameEvent {
  type: 'moved' | 'collected' | 'unlocked' | 'revealed';
  [key: string]: any;
}

export class IncomingTube {
  slot: 'target' | 'holder' | 'retire';
  target_color: number;
  balls: number[];
  lock: LockSpec | null;

  constructor(
    slot: 'target' | 'holder' | 'retire',
    target: number,
    balls: number[],
    lock: LockSpec | null
  ) {
    this.slot = slot;
    this.target_color = target;
    this.balls = [...balls];
    this.lock = lock ? lock.duplicate() : null;
  }
}

export class Level {
  spec: LevelSpec;
  capacity: number;
  board_count: number;
  initial_targets: number[];
  initial_balls: number[][]; // encoded with HID
  initial_locks: (LockSpec | null)[];
  total_targets: number = 0;
  declared_incoming: number = 0;
  incoming: IncomingTube[] = [];
  private _future: number[][] = [];

  static encodeBalls(t: TubeSpec): number[] {
    const mysSet = new Set(t.mystery);
    return t.balls.map((c, i) => (mysSet.has(i) ? c + HID : c));
  }

  constructor(spec: LevelSpec) {
    this.spec = spec;
    this.capacity = spec.capacity;
    this.board_count = spec.board_count;
    this.total_targets = spec.targetCount();

    this.initial_targets = [];
    this.initial_balls = [];
    this.initial_locks = [];

    for (let i = 0; i < this.board_count; i++) {
      const t = spec.tubes[i];
      this.initial_targets.push(t.target_color);
      this.initial_balls.push(Level.encodeBalls(t));
      this.initial_locks.push(t.lock ? t.lock.duplicate() : null);
    }

    for (let i = this.board_count; i < spec.tubes.length; i++) {
      const t = spec.tubes[i];
      const slot = t.target_color >= 0 ? 'target' : 'holder';
      this.incoming.push(new IncomingTube(slot, t.target_color, Level.encodeBalls(t), t.lock));
    }
    this.declared_incoming = this.incoming.length;

    while (this.incoming.length < this.total_targets - 1) {
      this.incoming.push(new IncomingTube('retire', -1, [], null));
    }

    this._future = new Array(this.incoming.length + 1);
    const zero = new Array(MAX_COLORS).fill(0);
    this._future[this.incoming.length] = zero;

    for (let k = this.incoming.length - 1; k >= 0; k--) {
      const row = [...this._future[k + 1]];
      for (const b of this.incoming[k].balls) {
        row[b >= HID ? b - HID : b] += 1;
      }
      this._future[k] = row;
    }
  }

  static fromString(text: string): Level | null {
    const s = parse(text);
    return s ? new Level(s) : null;
  }

  toStringSpec(): string {
    return dump(this.spec);
  }

  futureTally(done: number): number[] {
    const idx = Math.max(0, Math.min(done, this._future.length - 1));
    return this._future[idx];
  }

  validate(): string[] {
    const errs: string[] = [];
    if (this.initial_balls.length < MIN_BOARD) {
      errs.push(`initial tubes < ${MIN_BOARD}`);
    }
    if (this.initial_balls.length > MAX_BASE_COLUMNS) {
      errs.push(`initial tubes > ${MAX_BASE_COLUMNS}`);
    }
    if (this.total_targets < 2) {
      errs.push('requires at least 2 target tubes');
    }
    if (this.declared_incoming > this.total_targets - 1) {
      errs.push(`incoming=${this.declared_incoming} exceeds total-1=${this.total_targets - 1}`);
    }
    for (let i = 0; i < this.initial_balls.length; i++) {
      const col = this.initial_balls[i];
      if (col.length > 0 && col[col.length - 1] >= HID) {
        errs.push(`initial tube ${i} top ball is mystery`);
      }
    }
    for (let k = 0; k < this.incoming.length; k++) {
      const inc = this.incoming[k];
      if (inc.balls.length > 0 && inc.balls[inc.balls.length - 1] >= HID) {
        errs.push(`incoming tube ${k} top ball is mystery`);
      }
    }
    for (let i = 0; i < this.spec.tubes.length; i++) {
      const t = this.spec.tubes[i];
      if (t.balls.length > this.capacity) {
        errs.push(`tube ${i} has ${t.balls.length} balls > capacity ${this.capacity}`);
      }
    }
    return errs;
  }

  checkInvariant(): string {
    const targets: Record<number, number> = {};
    const balls: Record<number, number> = {};
    for (const t of this.spec.tubes) {
      if (t.target_color >= 0) {
        targets[t.target_color] = (targets[t.target_color] || 0) + 1;
      }
      for (const b of t.balls) {
        balls[b] = (balls[b] || 0) + 1;
      }
    }
    const tKeys = Object.keys(targets);
    const bKeys = Object.keys(balls);
    if (tKeys.length !== bKeys.length) {
      return 'target color set != ball color set';
    }
    for (const k of tKeys) {
      const c = parseInt(k, 10);
      if (!(c in balls) || balls[c] !== targets[c] * this.capacity) {
        return `color ${c} count mismatch`;
      }
    }
    return '';
  }
}

export class BoardState {
  cols: number[][] = [];
  targets: number[] = [];
  caps: number[] = [];
  gone: boolean[] = [];
  locks: (LockSpec | null)[] = [];
  done: number = 0;
  collected_colors: number[] = [];
  extra_used: boolean = false;

  duplicate(): BoardState {
    const s = new BoardState();
    s.cols = this.cols.map(c => [...c]);
    s.targets = [...this.targets];
    s.caps = [...this.caps];
    s.gone = [...this.gone];
    s.locks = this.locks.map(lk => (lk ? lk.duplicate() : null));
    s.done = this.done;
    s.collected_colors = [...this.collected_colors];
    s.extra_used = this.extra_used;
    return s;
  }

  stateKey(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.cols.length; i++) {
      const cParts = this.cols[i].map(b => b.toString()).join(',');
      const lkStr = this.locks[i] ? this.locks[i]!.toKey() : '-';
      parts.push(`${this.targets[i]}:${this.caps[i]}:${this.gone[i] ? 1 : 0}:${lkStr}:[${cParts}]`);
    }
    const cc = [...this.collected_colors].sort((a, b) => a - b).join(',');
    return `${this.done}|${parts.join(';')}|${cc}`;
  }
}

export class EngineCore {
  static initialState(level: Level): BoardState {
    const s = new BoardState();
    for (let i = 0; i < level.initial_balls.length; i++) {
      s.cols.push([...level.initial_balls[i]]);
      s.targets.push(level.initial_targets[i]);
      s.caps.push(level.capacity);
      s.gone.push(false);
      s.locks.push(level.initial_locks[i] ? level.initial_locks[i]!.duplicate() : null);
    }
    s.done = 0;
    s.collected_colors = [];
    s.extra_used = false;
    return s;
  }

  static isLocked(st: BoardState, i: number): boolean {
    return st.locks[i] !== null;
  }

  // MEC-001: Returns count of balls moved (0 = illegal).
  static moveInfo(st: BoardState, src: number, j: number, dst: number): number {
    const nCols = st.cols.length;
    if (src === dst || src < 0 || src >= nCols || dst < 0 || dst >= nCols) return 0;
    if (this.isLocked(st, src) || this.isLocked(st, dst) || st.gone[src] || st.gone[dst]) return 0;

    const a = st.cols[src];
    const b = st.cols[dst];
    const count = a.length - j;
    if (j < 0 || count <= 0 || b.length + count > st.caps[dst]) return 0;

    if (b.length === 0) return count;
    if (isHidden(a[j]) || b[b.length - 1] !== a[j]) return 0;

    return count;
  }

  static rejectReason(st: BoardState, src: number, j: number, dst: number): string {
    if (this.moveInfo(st, src, j, dst) > 0) return '';
    const nCols = st.cols.length;
    if (src === dst || src < 0 || src >= nCols || dst < 0 || dst >= nCols) return 'invalid';

    const count = st.cols[src].length - j;
    if (j < 0 || count <= 0) return 'invalid';

    if (this.isLocked(st, src) || this.isLocked(st, dst) || st.gone[src] || st.gone[dst]) return 'locked';
    if (st.cols[dst].length + count > st.caps[dst]) return 'full';
    if (isHidden(st.cols[src][j])) return 'mystery';

    return 'color';
  }

  static lockSatisfied(st: BoardState, lk: LockSpec): boolean {
    if (lk.kind === 'count') {
      return st.done >= lk.count;
    }
    let cnt = 0;
    for (const c of st.collected_colors) {
      if (c === lk.color) cnt++;
    }
    return cnt >= lk.count;
  }

  static appearLock(lk: LockSpec | null, done: number): LockSpec | null {
    if (lk && lk.kind === 'count') {
      return new LockSpec('count', lk.count + done, -1);
    }
    return lk ? lk.duplicate() : null;
  }

  static isReady(st: BoardState, i: number): boolean {
    const target = st.targets[i];
    const col = st.cols[i];
    if (this.isLocked(st, i) || st.gone[i] || target < 0 || col.length === 0 || col.length !== st.caps[i]) {
      return false;
    }
    for (const x of col) {
      if (x !== target) return false;
    }
    return true;
  }

  static anyReady(st: BoardState): boolean {
    for (let i = 0; i < st.cols.length; i++) {
      if (this.isReady(st, i)) return true;
    }
    return false;
  }

  private static spawn(st: BoardState, balls: number[], first: number): { spawned: any[]; lost: number } {
    const spawned: any[] = [];
    let lost = 0;
    const order = [first];
    for (let c = 0; c < st.cols.length; c++) {
      if (c !== first) order.push(c);
    }
    for (const b of balls) {
      let placed = false;
      for (const c of order) {
        if (!this.isLocked(st, c) && !st.gone[c] && st.cols[c].length < st.caps[c]) {
          st.cols[c].push(b);
          spawned.push({ col: c, color: trueColor(b), hidden: isHidden(b) });
          placed = true;
          break;
        }
      }
      if (!placed) lost++;
    }
    return { spawned, lost };
  }

  // MEC-002: Collect all ready target tubes (chains up to 40 passes).
  static collectReady(
    st: BoardState,
    level: Level,
    events: GameEvent[] = [],
    recordEvents: boolean = false
  ): number {
    let total = 0;
    for (let pass = 0; pass < 40; pass++) {
      let again = false;
      for (let i = 0; i < st.cols.length; i++) {
        if (!this.isReady(st, i)) continue;

        const color = st.targets[i];
        const k = st.done;
        st.cols[i] = [];
        st.done++;
        st.collected_colors.push(color);

        const inc = k < level.incoming.length ? level.incoming[k] : null;
        const ev: GameEvent = {
          type: 'collected',
          col: i,
          color,
          nth: st.done,
          slot: 'retire',
          new_target: -1,
          spawned: [],
          lost: 0
        };

        if (!inc || inc.slot === 'retire') {
          st.targets[i] = -1;
          st.caps[i] = 0;
          st.gone[i] = true;
          st.locks[i] = null;
        } else {
          ev.slot = inc.slot;
          st.targets[i] = inc.slot === 'target' ? inc.target_color : -1;
          ev.new_target = st.targets[i];
          const sp = this.spawn(st, inc.balls, i);
          ev.spawned = sp.spawned;
          ev.lost = sp.lost;
          st.locks[i] = this.appearLock(inc.lock, st.done);
        }

        if (recordEvents) events.push(ev);
        total++;
        again = true;
      }
      if (!again) break;
    }
    return total;
  }

  static unlockPass(st: BoardState, events: GameEvent[], recordEvents: boolean): void {
    for (let i = 0; i < st.locks.length; i++) {
      const lk = st.locks[i];
      if (lk && this.lockSatisfied(st, lk)) {
        st.locks[i] = null;
        if (recordEvents) {
          events.push({ type: 'unlocked', col: i });
        }
      }
    }
  }

  static revealPass(st: BoardState, events: GameEvent[], recordEvents: boolean): void {
    for (let i = 0; i < st.cols.length; i++) {
      const col = st.cols[i];
      if (col.length > 0 && isHidden(col[col.length - 1])) {
        const topIdx = col.length - 1;
        col[topIdx] -= HID;
        if (recordEvents) {
          events.push({
            type: 'revealed',
            col: i,
            index: topIdx,
            color: col[topIdx]
          });
        }
      }
    }
  }

  static applyMove(
    st: BoardState,
    level: Level,
    src: number,
    j: number,
    dst: number,
    deposit: boolean = true,
    events: GameEvent[] = [],
    recordEvents: boolean = false
  ): boolean {
    const count = this.moveInfo(st, src, j, dst);
    if (count === 0) return false;

    const a = st.cols[src];
    const b = st.cols[dst];
    for (let idx = j; idx < a.length; idx++) {
      b.push(a[idx]);
    }
    st.cols[src] = a.slice(0, j);

    if (recordEvents) {
      events.push({ type: 'moved', src, j, dst, count });
    }

    if (deposit && this.collectReady(st, level, events, recordEvents) > 0) {
      this.unlockPass(st, events, recordEvents);
    }
    this.revealPass(st, events, recordEvents);
    return true;
  }

  static isWin(st: BoardState, level: Level): boolean {
    return st.done >= level.total_targets;
  }

  static legalMoves(st: BoardState): MoveStep[] {
    const out: MoveStep[] = [];
    const n = st.cols.length;
    for (let src = 0; src < n; src++) {
      for (let j = 0; j < st.cols[src].length; j++) {
        for (let dst = 0; dst < n; dst++) {
          if (this.moveInfo(st, src, j, dst) > 0) {
            out.push({ src, j, dst });
          }
        }
      }
    }
    return out;
  }

  static candidateMoves(st: BoardState): MoveStep[] {
    const out: MoveStep[] = [];
    const n = st.cols.length;
    for (let src = 0; src < n; src++) {
      const col = st.cols[src];
      const m = col.length;
      if (m === 0 || this.isLocked(st, src) || st.gone[src]) continue;
      for (let j = 0; j < m; j++) {
        if (j === 0 || col[j - 1] !== col[j] || j === m - 1 || col[j + 1] !== col[j]) {
          for (let dst = 0; dst < n; dst++) {
            if (this.moveInfo(st, src, j, dst) > 0) {
              out.push({ src, j, dst });
            }
          }
        }
      }
    }
    return out;
  }

  static hasAnyMove(st: BoardState): boolean {
    const n = st.cols.length;
    for (let src = 0; src < n; src++) {
      if (this.isLocked(st, src) || st.gone[src] || st.cols[src].length === 0) continue;
      for (let j = 0; j < st.cols[src].length; j++) {
        for (let dst = 0; dst < n; dst++) {
          if (this.moveInfo(st, src, j, dst) > 0) return true;
        }
      }
    }
    return false;
  }

  static addTube(st: BoardState, capacity: number): number {
    if (st.extra_used || st.cols.length >= MAX_COLUMNS) return -1;
    st.cols.push([]);
    st.targets.push(-1);
    st.caps.push(capacity);
    st.gone.push(false);
    st.locks.push(null);
    st.extra_used = true;
    return st.cols.length - 1;
  }

  static isDoomed(st: BoardState, level: Level): boolean {
    if (this.isWin(st, level)) return false;
    const have = [...level.futureTally(st.done)];
    for (const col of st.cols) {
      for (const b of col) {
        have[trueColor(b)] += 1;
      }
    }
    let possible = 0;
    for (const cnt of have) {
      possible += Math.floor(cnt / level.capacity);
    }
    return possible < level.total_targets - st.done;
  }

  private static hasMechanics(st: BoardState): boolean {
    for (const lk of st.locks) {
      if (lk !== null) return true;
    }
    for (const col of st.cols) {
      for (const b of col) {
        if (isHidden(b)) return true;
      }
    }
    return false;
  }

  private static hasIrreversible(st: BoardState): boolean {
    const n = st.cols.length;
    for (let i = 0; i < n; i++) {
      const col = st.cols[i];
      for (let j = 1; j < col.length; j++) {
        if (col[j - 1] !== col[j]) {
          for (let k = 0; k < n; k++) {
            if (this.moveInfo(st, i, j, k) > 0) return true;
          }
        }
      }
    }
    return false;
  }

  static isClosedCycle(st: BoardState, level: Level, stateCap: number = 80): boolean {
    if (this.anyReady(st)) return false;
    if (!this.hasMechanics(st) && this.hasIrreversible(st)) return false;

    const idx = new Map<string, number>();
    idx.set(st.stateKey(), 0);
    const states = [st.duplicate()];
    const edges: number[][] = [[]];
    const stack = [0];

    while (stack.length > 0) {
      const cur = stack.pop()!;
      const s = states[cur];
      const n = s.cols.length;

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < s.cols[i].length; j++) {
          for (let k = 0; k < n; k++) {
            if (this.moveInfo(s, i, j, k) <= 0) continue;
            const t = s.duplicate();
            this.applyMove(t, level, i, j, k, false);
            if (this.anyReady(t)) return false;

            const key = t.stateKey();
            if (!idx.has(key)) {
              if (idx.size >= stateCap) return false;
              const newId = states.length;
              idx.set(key, newId);
              states.push(t);
              edges.push([]);
              stack.push(newId);
            }
            edges[cur].push(idx.get(key)!);
          }
        }
      }
    }

    const rev: number[][] = Array.from({ length: states.length }, () => []);
    for (let a = 0; a < edges.length; a++) {
      for (const b of edges[a]) {
        rev[b].push(a);
      }
    }

    const seen = new Set<number>([0]);
    const todo = [0];
    while (todo.length > 0) {
      const u = todo.pop()!;
      for (const p of rev[u]) {
        if (!seen.has(p)) {
          seen.add(p);
          todo.push(p);
        }
      }
    }

    return seen.size === states.length;
  }

  static deadReason(st: BoardState, level: Level, maxStates: number = 80): string {
    if (this.isWin(st, level)) return '';
    if (!this.hasAnyMove(st)) return 'no_moves';
    if (this.isDoomed(st, level)) return 'doomed';
    if (this.isClosedCycle(st, level, maxStates)) return 'closed_cycle';
    return '';
  }
}
