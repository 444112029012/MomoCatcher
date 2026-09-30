import assert from "node:assert/strict";
import test from "node:test";
import { resultNotice, scheduleLine } from "../extension/display.js";

test("schedule line appears only while a job is armed", () => {
  const when = new Date(2026, 9, 1, 20, 0, 0).getTime();
  assert.equal(scheduleLine({ armed: true, when }), "已排程，momo 時間 2026-10-01 20:00:00");
  assert.equal(scheduleLine({ armed: false, when }), "");
  assert.equal(scheduleLine({ armed: true }), "");
  assert.equal(scheduleLine(null), "");
});

test("result notice keeps the momo message", () => {
  assert.deepEqual(resultNotice({ success: true, message: "已加入（送出 3 次）" }), {
    title: "Momo Catcher：已加入",
    message: "已加入（送出 3 次）",
  });
  assert.deepEqual(resultNotice({ success: true, message: "已超過此商品的限購數量" }), {
    title: "Momo Catcher：已加入",
    message: "已超過此商品的限購數量",
  });
  assert.equal(resultNotice({ success: false, message: "這個 Chrome 還沒登入 momo" }).title, "Momo Catcher：未加入");
  assert.equal(resultNotice({ success: false }).message, "加入購物車失敗");
  assert.equal(resultNotice({ success: true }).message, "已加入購物車");
  assert.equal(resultNotice({ success: false, message: "x".repeat(300) }).message.length, 240);
});
