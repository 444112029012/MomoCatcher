import assert from "node:assert/strict";
import test from "node:test";
import { strategies, strategyById } from "../extension/strategies.js";

test("strategy 1 uses the seven offsets and stays within four sends per two seconds", () => {
  const strategy = strategyById("strategy-1");
  assert.equal(strategies[0], strategy);
  assert.deepEqual(strategy.offsets, [0, 200, 600, 1100, 2100, 2400, 2800]);
  for (const at of strategy.offsets) {
    const inside = strategy.offsets.filter((time) => time <= at && at - time < 2000);
    assert.ok(inside.length <= 4, `${at}ms 往前 2 秒有 ${inside.length} 筆`);
  }
});

test("an unknown strategy id uses strategy 1", () => {
  assert.equal(strategyById("strategy-2").label, "策略一");
});
