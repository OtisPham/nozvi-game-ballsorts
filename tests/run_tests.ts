// Unit test suite for TypeScript Ball Sort core logic.
// Verifies MEC-001..MEC-005, generator, solver, progression, and meta.

import * as Codec from '../src/core/codec';
import { EngineCore, Level, isHidden } from '../src/core/engine';
import { GameSession } from '../src/core/session';
import { Generator } from '../src/core/generator';
import { RNG } from '../src/core/rng';
import { ProgressionState } from '../src/core/progression';
import { MetaState } from '../src/core/meta';
import { EnergyState, MAX_LIVES, REGEN_INTERVAL_MS } from '../src/core/energy';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  [FAIL] ${msg}`);
  }
}

function testCodecRoundtrip() {
  const samples = [
    "3;4:0.001;1.110;2.222;.",
    "4;4:.;0,12.0123.0,1.1,1;1,201.1122;2.2301;3.3300",
    "5;6:.;4.454.0,1.1,1;6.676;0.05556;7.76046.3,1;5.07744.0,1;2.22222"
  ];
  for (const s of samples) {
    const spec = Codec.parse(s);
    assert(spec !== null, `Codec.parse succeeded for ${s}`);
    if (spec) {
      assert(Codec.dump(spec) === s, `Codec roundtrip exact match: ${s}`);
    }
  }
}

function testMulticolorMoveAndReject() {
  // MEC-001: Tube 0 has [0, 1, 2], Tube 1 has [1]; moving j=1 ([1, 2]) onto Tube 1 is valid!
  const lv = Level.fromString("4;3:0.012;1.100;.")!;
  assert(lv !== null, "Level parsed");
  const g = new GameSession(lv);

  // Reject mismatched color
  const bad = g.tryMove(0, 2, 1);
  assert(!bad.ok && bad.reason === "color", "Reject color mismatch");

  // Move [1, 2] from col 0 onto empty col 2
  const ok1 = g.tryMove(0, 1, 2);
  assert(ok1.ok && JSON.stringify(g.state.cols[2]) === JSON.stringify([1, 2]), "Multi-color segment moved to empty tube");

  // Reject full
  const lvFull = Level.fromString("3;3:0.001;1.110;.")!;
  const gf = new GameSession(lvFull);
  const badFull = gf.tryMove(0, 0, 1);
  assert(!badFull.ok && badFull.reason === "full", "Reject full destination");
}

function testCollectIncomingAndRetire() {
  // MEC-002: 3 targets (0, 1, 2) with 3 balls each; 1 incoming tube (2.221); second collection retires column.
  const lv = Level.fromString("3;3:0.00;1.110;.2;2.221")!;
  assert(lv.validate().length === 0, "Valid level for collect test");
  assert(lv.checkInvariant() === "", "Invariant holds");
  const g = new GameSession(lv);

  // Move top ball 0 from col 1 to col 0 -> collects target 0, incoming tube replaces col 0
  const res = g.tryMove(1, 2, 0);
  assert(res.ok, "Move completing tube 0 succeeded");
  assert(g.state.done === 1, "1 target collected");
  assert(g.state.targets[0] === 2, "Col 0 replaced by incoming target 2");
  assert(JSON.stringify(g.state.cols[0]) === JSON.stringify([2, 2, 1]), "Incoming balls spawned into col 0");

  // Move top ball 1 from col 0 to col 1 -> collects target 1, col 1 retires
  const res2 = g.tryMove(0, 2, 1);
  assert(res2.ok && g.state.done === 2, "2nd target collected");
  assert(g.state.gone[1], "Col 1 retired after queue exhausted");
}

function testMysteryReveal() {
  // MEC-003: Ball 0 at index 0 is mystery; cannot move onto non-empty tube, reveals when top ball leaves.
  const lv = Level.fromString("3;3:0.01.0,1;1.0;.")!;
  const g = new GameSession(lv);
  assert(isHidden(g.state.cols[0][0]), "Index 0 starts hidden");

  // Cannot move hidden ball onto non-empty tube
  const bad = g.tryMove(0, 0, 1);
  assert(!bad.ok && bad.reason === "mystery", "Reject mystery move onto non-empty tube");

  // Move top ball 1 off col 0 -> reveals hidden ball 0
  const res = g.tryMove(0, 1, 2);
  assert(res.ok, "Move top ball off col 0");
  assert(!isHidden(g.state.cols[0][0]), "Mystery ball revealed when exposed at top");
  assert(res.events.some(e => e.type === "revealed"), "Revealed event emitted");
}

function testLocksCountAndType() {
  // MEC-004: Col 2 locked by type (needs 1 target of color 0); Col 1 locked by count (needs 1 target).
  const lv = Level.fromString("3;4:0.00;1,11.111;2,201.220;.")!;
  const g = new GameSession(lv);
  const bad = g.tryMove(2, 2, 0);
  assert(!bad.ok && bad.reason === "locked", "Locked source rejected");

  // Test unlocking via unlocked column 3
  const lv3 = Level.fromString("3;4:0.00;1,11.111;2,201.222;3.120")!;
  const g3 = new GameSession(lv3);
  const res = g3.tryMove(3, 2, 0); // collects target 0 -> unlocks both col 1 (count 1) and col 2 (type 0, 1)
  assert(res.ok && g3.state.done === 1, "Target 0 collected");
  assert(!EngineCore.isLocked(g3.state, 1), "Count lock unlocked");
  assert(!EngineCore.isLocked(g3.state, 2), "Type lock unlocked");
}

function testUndoAndExtraTube() {
  const lv = Level.fromString("3;3:0.012;1.100;.")!;
  const g = new GameSession(lv, 3);
  g.tryMove(0, 2, 2);
  assert(g.state.cols[2].length === 1, "Moved ball 2");
  assert(g.canUndo(), "Can undo");
  assert(g.undo(), "Undo executed");
  assert(g.state.cols[2].length === 0, "Ball returned to source");

  // Extra tube
  const extraIdx = g.addExtraTube();
  assert(extraIdx === 3, "Extra tube added at index 3");
  assert(g.state.cols.length === 4, "Board now has 4 columns");
}

function testDeadlockReasons() {
  // No moves
  const lvStuck = Level.fromString("3;3:0.00;1.11;2.22")!;
  const gs = new GameSession(lvStuck);
  assert(gs.deadReason() === "no_moves", "Detects no_moves deadlock");
}

function testGenerator() {
  const rng = new RNG(42);
  const params = Generator.paramsForLevel(1, rng);
  const gen = Generator.generate(params, rng, 50);
  assert(gen !== null, "Generator successfully produced Level 1");
  if (gen) {
    const lv = new Level(gen.spec);
    assert(lv.validate().length === 0, "Generated level is valid");
    assert(Generator.verifyWitness(lv, gen.witness), "Witness solves level");
  }
}

function testProgressionAndMeta() {
  const prog = new ProgressionState(1, 1);
  assert(prog.getBadge() === "NORMAL", "Level 1 is NORMAL");
  prog.current_level = 15;
  assert(prog.getBadge() === "HARD", "Level 15 is HARD");
  prog.current_level = 20;
  assert(prog.getBadge() === "VERY_HARD", "Level 20 is VERY_HARD");

  const meta = new MetaState();
  const rew = meta.rewardWin(true);
  assert(rew.stars === 3, "3 stars awarded on perfect win");
  assert(meta.winStreak === 1, "Streak incremented");

  // Energy / Lives regen tests
  const t0 = 1000000;
  const energy = new EnergyState(MAX_LIVES, t0);
  assert(energy.lives === 5, "Starts with 5 lives");
  assert(energy.consumeLife(t0), "Consumed 1 life");
  assert(energy.lives === 4, "4 lives remaining");
  energy.sync(t0 + REGEN_INTERVAL_MS * 2 + 1000);
  assert(energy.lives === 5, "Regenerated back to cap 5 after elapsed time");
  energy.lives = 0;
  energy.lastRegenAt = t0;
  assert(!energy.hasLife(t0 + 60000), "Still 0 lives after 1 minute");
  assert(energy.hasLife(t0 + REGEN_INTERVAL_MS), "Gained 1 life after 5 minutes");

  // 3-strike deadlock rule
  const e2 = new EnergyState(5, t0);
  assert(!e2.recordDeadlock(t0) && e2.deadlockStrikes === 1 && e2.lives === 5, "Strike 1 does not cost a life");
  assert(!e2.recordDeadlock(t0) && e2.deadlockStrikes === 2 && e2.lives === 5, "Strike 2 does not cost a life");
  assert(e2.recordDeadlock(t0) && e2.deadlockStrikes === 0 && e2.lives === 4, "Strike 3 costs 1 life and resets strikes");
}

console.log("=== Running TypeScript Ball Sort Core Tests ===");
testCodecRoundtrip();
testMulticolorMoveAndReject();
testCollectIncomingAndRetire();
testMysteryReveal();
testLocksCountAndType();
testUndoAndExtraTube();
testDeadlockReasons();
testGenerator();
testProgressionAndMeta();
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
