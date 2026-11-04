import assert from "node:assert/strict";
import test from "node:test";
import { hasStock, shouldBurst, strategies, strategyById, usesAttempt } from "../extension/strategies.js";

test("strategy 1 uses the seven offsets and stays within four sends per two seconds", () => {
  const strategy = strategyById("strategy-1");
  assert.equal(strategies[0], strategy);
  assert.deepEqual(strategy.offsets, [0, 300, 800, 1000, 2100, 2400, 2900]);
  for (const at of strategy.offsets) {
    const inside = strategy.offsets.filter((time) => time <= at && at - time < 2000);
    assert.ok(inside.length <= 4, `${at}ms 往前 2 秒有 ${inside.length} 筆`);
  }
});

test("strategy 2 waits for each reply and stops after four sends", () => {
  const strategy = strategyById("strategy-2");
  assert.equal(strategy.sequential, true);
  assert.equal(strategy.attempts, 4);
  assert.equal(strategy.crowdWaitMs, 500);
  assert.equal(strategy.holdTipStocks.join(","), "3,0");
  assert.equal(shouldBurst("3"), false);
  assert.equal(shouldBurst("0"), false);
  assert.equal(shouldBurst(""), true);
  assert.equal(shouldBurst("1"), true);
  assert.equal(strategy.minSendGapMs, 500);
  assert.equal(usesAttempt("此商品尚未開賣 (SCS101)"), false);
  assert.equal(usesAttempt("很抱歉，目前搶購人數眾多，請再重試一次，謝謝。 (SCS112)"), true);
});

test("strategy 3 sends only when goodsStock is present", () => {
  const strategy = strategyById("strategy-3");
  assert.equal(strategy.watchStock, true);
  assert.equal(strategy.stockWatchMs, 300000);
  assert.equal(strategy.stockPollMs, 500);
  assert.equal(strategy.minSendGapMs, 500);
  assert.equal(hasStock("0"), false);
  assert.equal(hasStock(""), false);
  assert.equal(hasStock("1"), true);
});

test("an unknown strategy id uses strategy 1", () => {
  assert.equal(strategyById("strategy-9").label, "策略一");
});
