// MEC-001, MEC-003, MEC-004: Level string codec (parse <-> dump).
// Pure TypeScript, zero external dependencies.

export const B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class LockSpec {
  kind: 'count' | 'type';
  count: number;
  color: number; // used only when kind === 'type'

  constructor(kind: 'count' | 'type', count: number, color: number = -1) {
    this.kind = kind;
    this.count = count;
    this.color = color;
  }

  duplicate(): LockSpec {
    return new LockSpec(this.kind, this.count, this.color);
  }

  toKey(): string {
    return `${this.kind}:${this.count}:${this.color}`;
  }
}

export class TubeSpec {
  target_color: number; // -1 = empty holder (no target color)
  balls: number[];      // bottom (index 0) -> top (last index)
  mystery: number[];    // sorted ball indices that start hidden
  lock: LockSpec | null;

  constructor(
    target: number,
    balls: number[],
    mystery: number[] = [],
    lock: LockSpec | null = null
  ) {
    this.target_color = target;
    this.balls = [...balls];
    this.mystery = [...mystery];
    this.lock = lock ? lock.duplicate() : null;
  }
}

export class LevelSpec {
  capacity: number;
  board_count: number; // tubes visible at level start; remaining are incoming
  tubes: TubeSpec[];

  constructor(capacity: number, board_count: number, tubes: TubeSpec[]) {
    this.capacity = capacity;
    this.board_count = board_count;
    this.tubes = tubes;
  }

  targetCount(): number {
    let n = 0;
    for (const t of this.tubes) {
      if (t.target_color >= 0) n++;
    }
    return n;
  }
}

export function b62Val(ch: string): number {
  return B62.indexOf(ch);
}

export function b62Char(val: number): string {
  if (val < 0 || val >= B62.length) return "";
  return B62[val];
}

export function parseTube(tok: string): TubeSpec | null {
  const parts = tok.split(".");
  const head = parts[0].split(",");
  let target = -1;
  if (head[0] !== "") {
    target = b62Val(head[0]);
    if (target < 0) return null;
  }

  let lock: LockSpec | null = null;
  if (head.length > 1) {
    if (head.length > 2 || head[1].length < 2) return null;
    const rawLock = head[1];
    const vals: number[] = [];
    for (let i = 0; i < rawLock.length; i++) {
      const v = b62Val(rawLock[i]);
      if (v < 0) return null;
      vals.push(v);
    }
    if (vals[0] === 1 && vals.length === 2) {
      lock = new LockSpec("count", vals[1], -1);
    } else if (vals[0] === 2 && vals.length === 3) {
      lock = new LockSpec("type", vals[2], vals[1]);
    } else {
      return null;
    }
  }

  const balls: number[] = [];
  if (parts.length > 1 && parts[1] !== "") {
    const rawBalls = parts[1];
    for (let i = 0; i < rawBalls.length; i++) {
      const v = b62Val(rawBalls[i]);
      if (v < 0) return null;
      balls.push(v);
    }
  }

  const mystery: number[] = [];
  for (let idx = 2; idx < parts.length; idx++) {
    const m = parts[idx];
    const pair = m.split(",");
    if (pair.length !== 2 || pair[1] !== "1") return null;
    const pos = b62Val(pair[0]);
    if (pos < 0 || pos >= balls.length) return null;
    mystery.push(pos);
  }
  mystery.sort((a, b) => a - b);

  return new TubeSpec(target, balls, mystery, lock);
}

export function dumpTube(t: TubeSpec): string {
  if (t.target_color < 0 && t.balls.length === 0 && t.mystery.length === 0 && t.lock === null) {
    return ".";
  }
  let head = "";
  if (t.target_color >= 0) {
    head += b62Char(t.target_color);
  }
  if (t.lock !== null) {
    if (t.lock.kind === "count") {
      head += `,1${b62Char(t.lock.count)}`;
    } else if (t.lock.kind === "type") {
      head += `,2${b62Char(t.lock.color)}${b62Char(t.lock.count)}`;
    }
  }

  let ballStr = "";
  for (const b of t.balls) {
    ballStr += b62Char(b);
  }

  let out = `${head}.${ballStr}`;
  for (const p of t.mystery) {
    out += `.${b62Char(p)},1`;
  }
  return out;
}

export function parse(text: string): LevelSpec | null {
  const colon = text.indexOf(":");
  if (colon < 0) return null;
  const header = text.slice(0, colon);
  const body = text.slice(colon + 1);

  const hParts = header.split(";");
  if (hParts.length !== 2) return null;

  const cap = parseInt(hParts[0], 10);
  const board = parseInt(hParts[1], 10);
  if (isNaN(cap) || isNaN(board) || cap < 1 || board < 1) return null;

  const tubeTokens = body.split(";");
  if (tubeTokens.length < board) return null;

  const tubes: TubeSpec[] = [];
  for (const tok of tubeTokens) {
    const t = parseTube(tok);
    if (!t) return null;
    tubes.push(t);
  }

  return new LevelSpec(cap, board, tubes);
}

export function dump(spec: LevelSpec): string {
  const tokens = spec.tubes.map(t => dumpTube(t));
  return `${spec.capacity};${spec.board_count}:${tokens.join(";")}`;
}
