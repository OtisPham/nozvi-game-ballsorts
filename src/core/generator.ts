// GDD §5: Reverse level generator with guaranteed solvable witness.
// Pure TypeScript — deterministic with RNG seed.

import { LevelSpec, TubeSpec, LockSpec, dump } from './codec';
import { Level, BoardState, EngineCore, MoveStep } from './engine';
import { GameSession } from './session';
import { RNG } from './rng';

export const TUTORIAL: Record<number, number[]> = {
  1: [3, 4, 3, 0, 0, 0],
  2: [3, 6, 8, 0, 0, 1],
  3: [4, 5, 10, 0, 0, 1],
  4: [4, 6, 11, 0, 0, 1],
  5: [5, 6, 11, 0, 0, 1],
  6: [4, 4, 10, 4, 0, 1],  // introduces mystery (?)
  7: [4, 5, 12, 0, 0, 1],
  8: [5, 6, 10, 5, 0, 1],
  9: [4, 7, 14, 0, 0, 1],
  10: [5, 6, 13, 6, 0, 1],
  11: [4, 6, 11, 0, 1, 1], // introduces locked tubes
};

export class GenParams {
  capacity: number = 4;
  board: number = 6;
  targets: number = 10;
  colors: number = 9;
  holders_init: number = 1;
  holders_inc: number = 1;
  mystery: number = 0;
  locks: number = 0;
  scramble: number = 3.0;
  full_bias: number = 0.9;
}

export class GeneratedLevel {
  text: string = '';
  spec: LevelSpec;
  params: GenParams;
  tries: number = 0;
  witness: MoveStep[] = [];

  constructor(text: string, spec: LevelSpec, params: GenParams, tries: number, witness: MoveStep[]) {
    this.text = text;
    this.spec = spec;
    this.params = params;
    this.tries = tries;
    this.witness = witness;
  }
}

export class Generator {
  static paramsForLevel(levelNum: number, rng: RNG): GenParams {
    const p = new GenParams();
    if (TUTORIAL[levelNum]) {
      const t = TUTORIAL[levelNum];
      p.capacity = t[0];
      p.board = t[1];
      p.targets = t[2];
      p.colors = Math.min(9, p.targets);
      p.mystery = t[3];
      p.locks = t[4];
      p.holders_inc = t[5];
      p.scramble = 1.0 + Math.min(levelNum, 11) * 0.2;
      return p;
    }

    const ramp = Math.max(0.0, Math.min(1.0, (levelNum - 11) / 40.0));
    p.capacity = rng.weightedChoice([4, 5, 6], [41, 34, 25]);
    p.board = rng.weightedChoice([5, 6, 7], [10, 45, 45]);
    p.targets = rng.weightedChoice(
      [10, 11, 12, 13, 14],
      [48.0 - 20.0 * ramp, 22.0, 15.0 + 6.0 * ramp, 9.0 + 8.0 * ramp, 6.0 + 6.0 * ramp]
    );
    const colors = rng.randf() < 0.76 ? 9 : 8;
    p.colors = Math.min(colors, p.targets);
    const pMyst = 0.25 + 0.30 * ramp;
    p.mystery = rng.randf() < pMyst ? rng.randiRange(4, 12) : 0;
    p.locks = rng.weightedChoice(
      [0, 1, 2, 3],
      [41.0 - 12.0 * ramp, 23.0, 29.0 + 6.0 * ramp, 7.0 + 6.0 * ramp]
    );
    if (levelNum === 22) {
      p.locks = Math.max(p.locks, 1);
    }
    p.scramble = 2.5 + 1.5 * ramp;
    return p;
  }

  private static readyCol(target: number, col: number[], cap: number): boolean {
    if (target < 0 || col.length !== cap) return false;
    for (const x of col) {
      if (x !== target) return false;
    }
    return true;
  }

  private static buildReverse(p: GenParams, rng: RNG): { spec: LevelSpec; witness: MoveStep[] } | null {
    const K = p.capacity;
    const B = p.board;
    const P = p.targets;
    const Hi = p.holders_init;
    const Ho = p.holders_inc;

    if ((Ho !== 0 && Ho !== 1) || Hi < 1 || B - Hi < 1) return null;
    const m = P - (B - Hi) + Ho;
    if (m < 0 || m > P - 1) return null;

    const C = Math.max(1, Math.min(p.colors, P));
    const seq: number[] = [];
    for (let c = 0; c < C; c++) seq.push(c);
    for (let i = 0; i < P - C; i++) seq.push(rng.randiRange(0, C - 1));
    rng.shuffle(seq);

    const cols: number[][] = [];
    const targets: number[] = [];
    const alive: boolean[] = [];
    for (let i = 0; i < B; i++) {
      cols.push([]);
      targets.push(-1);
      alive.push(false);
    }

    const order: number[] = [];
    for (let i = 0; i < B; i++) order.push(i);
    rng.shuffle(order);

    const holdersEnd = order.slice(0, Hi + Ho);
    for (const i of holdersEnd) alive[i] = true;
    const parkCols = holdersEnd.slice(Hi);

    const incoming: { target: number; balls: number[] }[] = new Array(m);
    const revMoves: MoveStep[] = [];

    for (let n = P; n > 0; n--) {
      const c = seq[n - 1];
      let chosen = -1;

      if (n > m) {
        const cand: number[] = [];
        for (let i = 0; i < B; i++) {
          if (!alive[i]) cand.push(i);
        }
        if (cand.length === 0) return null;
        chosen = cand[rng.randiRange(0, cand.length - 1)];
        alive[chosen] = true;
      } else {
        let cand: number[] = [];
        if (n === m && Ho === 1) {
          for (const i of parkCols) {
            if (targets[i] === -1) cand.push(i);
          }
        } else {
          for (let i = 0; i < B; i++) {
            if (alive[i] && targets[i] >= 0 && !this.readyCol(targets[i], cols[i], K)) {
              cand.push(i);
            }
          }
        }
        if (cand.length === 0) return null;

        if (!(n === m && Ho === 1) && rng.randf() < p.full_bias) {
          let topLen = -1;
          for (const x of cand) topLen = Math.max(topLen, cols[x].length);
          const fullest = cand.filter(x => cols[x].length === topLen);
          cand = fullest;
        }

        chosen = cand[rng.randiRange(0, cand.length - 1)];
        incoming[n - 1] = { target: targets[chosen], balls: [...cols[chosen]] };
      }

      targets[chosen] = c;
      cols[chosen] = [];
      for (let k = 0; k < K; k++) cols[chosen].push(c);

      // Undo final move that completed tube `chosen`
      const fin: { q: number; s: number }[] = [];
      for (let q = 0; q < B; q++) {
        if (q !== chosen && alive[q]) {
          for (let s = 1; s <= K; s++) {
            if (cols[q].length + s <= K) {
              const testQ = [...cols[q]];
              for (let u = 0; u < s; u++) testQ.push(c);
              if (!this.readyCol(targets[q], testQ, K)) {
                fin.push({ q, s });
              }
            }
          }
        }
      }
      if (fin.length === 0) return null;

      const pick = fin[rng.randiRange(0, fin.length - 1)];
      const qCol = pick.q;
      const sCnt = pick.s;
      revMoves.push({ src: qCol, j: cols[qCol].length, dst: chosen });
      cols[chosen] = cols[chosen].slice(0, K - sCnt);
      for (let u = 0; u < sCnt; u++) cols[qCol].push(c);

      // Extra scramble un-moves
      const r = Math.max(0, Math.floor(rng.randfn(p.scramble, Math.max(1.0, p.scramble / 3.0))));
      for (let step = 0; step < r; step++) {
        const mv = this.pickUnmove(B, K, alive, cols, targets, rng);
        if (mv.src < 0) break;
        const d = mv.src;
        const segLen = mv.j;
        const q = mv.dst;
        const startIdx = cols[d].length - segLen;
        revMoves.push({ src: q, j: cols[q].length, dst: d });
        for (let idx = startIdx; idx < cols[d].length; idx++) {
          cols[q].push(cols[d][idx]);
        }
        cols[d] = cols[d].slice(0, startIdx);
      }
    }

    for (const a of alive) {
      if (!a) return null;
    }
    for (let i = 0; i < B; i++) {
      if (this.readyCol(targets[i], cols[i], K)) return null;
    }

    const perm: number[] = [];
    for (let i = 0; i < B; i++) perm.push(i);
    rng.shuffle(perm);

    const tubes: TubeSpec[] = [];
    for (const i of perm) {
      tubes.push(new TubeSpec(targets[i], cols[i]));
    }
    for (const inc of incoming) {
      tubes.push(new TubeSpec(inc.target, inc.balls));
    }

    const pos: Record<number, number> = {};
    for (let newIdx = 0; newIdx < perm.length; newIdx++) {
      pos[perm[newIdx]] = newIdx;
    }

    const witness: MoveStep[] = [];
    for (let idx = revMoves.length - 1; idx >= 0; idx--) {
      const mv = revMoves[idx];
      witness.push({ src: pos[mv.src], j: mv.j, dst: pos[mv.dst] });
    }

    return { spec: new LevelSpec(K, B, tubes), witness };
  }

  private static pickUnmove(
    B: number,
    K: number,
    alive: boolean[],
    cols: number[][],
    targets: number[],
    rng: RNG
  ): MoveStep {
    const cands: MoveStep[] = [];
    for (let d = 0; d < B; d++) {
      if (!alive[d] || cols[d].length === 0) continue;
      const L = cols[d].length;
      for (let n = 1; n <= L; n++) {
        if (n === L || cols[d][L - n - 1] === cols[d][L - n]) {
          for (let q = 0; q < B; q++) {
            if (q !== d && alive[q] && cols[q].length + n <= K) {
              cands.push({ src: d, j: n, dst: q });
            }
          }
        }
      }
    }
    rng.shuffle(cands);
    const lim = Math.min(12, cands.length);

    for (let idx = 0; idx < lim; idx++) {
      const mv = cands[idx];
      const d = mv.src;
      const n = mv.j;
      const q = mv.dst;
      const split = cols[d].length - n;
      const newQ = [...cols[q], ...cols[d].slice(split)];
      const newD = cols[d].slice(0, split);
      if (this.readyCol(targets[q], newQ, K) || this.readyCol(targets[d], newD, K)) {
        continue;
      }
      return mv;
    }

    return { src: -1, j: -1, dst: -1 };
  }

  static replayOk(spec: LevelSpec, witness: MoveStep[]): boolean {
    const lv = new Level(spec);
    if (lv.validate().length > 0) return false;
    const st = EngineCore.initialState(lv);
    for (const mv of witness) {
      if (!EngineCore.applyMove(st, lv, mv.src, mv.j, mv.dst)) return false;
    }
    return EngineCore.isWin(st, lv);
  }

  private static withMystery(spec: LevelSpec, picks: Record<number, number[]>): LevelSpec {
    const tubes: TubeSpec[] = [];
    for (let s = 0; s < spec.tubes.length; s++) {
      const t = spec.tubes[s];
      let mys: number[] = [];
      if (picks[s]) {
        mys = [...picks[s]].sort((a, b) => a - b);
      }
      tubes.push(new TubeSpec(t.target_color, t.balls, mys, t.lock));
    }
    return new LevelSpec(spec.capacity, spec.board_count, tubes);
  }

  private static addMystery(
    spec: LevelSpec,
    count: number,
    rng: RNG,
    witness: MoveStep[]
  ): LevelSpec | null {
    const ok: { s: number; i: number }[] = [];
    for (let s = 0; s < spec.tubes.length; s++) {
      const t = spec.tubes[s];
      for (let i = 0; i < t.balls.length - 1; i++) {
        // never hide top ball
        if (this.replayOk(this.withMystery(spec, { [s]: [i] }), witness)) {
          ok.push({ s, i });
        }
      }
    }
    if (count > ok.length) return null;

    for (let attempt = 0; attempt < 12; attempt++) {
      const picks: Record<number, number[]> = {};
      const sample = rng.sample(ok, count);
      for (const item of sample) {
        if (!picks[item.s]) picks[item.s] = [];
        picks[item.s].push(item.i);
      }
      const cand = this.withMystery(spec, picks);
      if (this.replayOk(cand, witness)) return cand;
    }
    return null;
  }

  private static withLock(spec: LevelSpec, s: number, lk: LockSpec): LevelSpec {
    const tubes: TubeSpec[] = [];
    for (let i = 0; i < spec.tubes.length; i++) {
      const t = spec.tubes[i];
      if (i === s) {
        tubes.push(new TubeSpec(t.target_color, t.balls, t.mystery, lk));
      } else {
        tubes.push(new TubeSpec(t.target_color, t.balls, t.mystery, t.lock));
      }
    }
    return new LevelSpec(spec.capacity, spec.board_count, tubes);
  }

  private static addLocks(
    spec: LevelSpec,
    count: number,
    rng: RNG,
    witness: MoveStep[]
  ): LevelSpec | null {
    const targetColors = new Set<number>();
    for (const t of spec.tubes) {
      if (t.target_color >= 0) targetColors.add(t.target_color);
    }
    const colors = Array.from(targetColors).sort((a, b) => a - b);
    const options: Record<number, LockSpec[]> = {};

    for (let s = 0; s < spec.board_count; s++) {
      const t = spec.tubes[s];
      if (t.target_color < 0) continue;

      const opts: LockSpec[] = [new LockSpec('count', 2, -1)];
      for (const c of colors) {
        if (c !== t.target_color) {
          opts.push(new LockSpec('type', 1, c));
        }
      }
      const good: LockSpec[] = [];
      for (const lk of opts) {
        if (this.replayOk(this.withLock(spec, s, lk), witness)) {
          good.push(lk);
        }
      }
      if (good.length > 0) options[s] = good;
    }

    const keys = Object.keys(options).map(Number);
    if (count > keys.length) return null;

    for (let attempt = 0; attempt < 12; attempt++) {
      let cur = spec;
      const sample = rng.sample(keys, count);
      for (const s of sample) {
        const typed = options[s].filter(lk => lk.kind === 'type');
        let chosen: LockSpec;
        if (typed.length > 0 && rng.randf() < 0.52) {
          chosen = typed[rng.randiRange(0, typed.length - 1)];
        } else {
          const allOpts = options[s];
          chosen = allOpts[rng.randiRange(0, allOpts.length - 1)];
        }
        cur = this.withLock(cur, s, chosen);
      }
      if (this.replayOk(cur, witness)) return cur;
    }
    return null;
  }

  static verifyWitness(level: Level, witness: MoveStep[]): boolean {
    const game = new GameSession(level, -1);
    for (const mv of witness) {
      const res = game.tryMove(mv.src, mv.j, mv.dst);
      if (!res.ok) return false;
    }
    return game.isWon();
  }

  static generate(p: GenParams, rng: RNG, maxTries: number = 200): GeneratedLevel | null {
    for (let tries = 1; tries <= maxTries; tries++) {
      const built = this.buildReverse(p, rng);
      if (!built) continue;

      const { spec, witness } = built;
      const lv = new Level(spec);
      if (lv.validate().length > 0 || lv.checkInvariant() !== '') continue;
      if (EngineCore.anyReady(EngineCore.initialState(lv))) continue;
      if (!this.verifyWitness(lv, witness)) continue;

      let s2: LevelSpec | null = spec;
      if (p.mystery > 0) {
        s2 = this.addMystery(s2, p.mystery, rng, witness);
      }
      if (s2 !== null && p.locks > 0) {
        s2 = this.addLocks(s2, p.locks, rng, witness);
      }
      if (s2 === null || new Level(s2).validate().length > 0) continue;

      return new GeneratedLevel(dump(s2), s2, p, tries, witness);
    }
    return null;
  }
}
