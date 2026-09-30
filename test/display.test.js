import assert from "node:assert/strict";
import test from "node:test";
import { clockNote, resultNotice, scheduleLine } from "../extension/display.js";
test("clock note says when the offset is a guess", () => {
  assert.equal(clockNote(120, true), "momo 比這台電腦快 120ms");
  assert.equal(clockNote(-80, false), "momo 比這台電腦慢 80ms，沒看到秒數跳動，時差是猜的，最多可能差 0.5 秒");
  assert.equal(clockNote(10, false), "momo 與這台電腦幾乎相同，沒看到秒數跳動，時差是猜的，最多可能差 0.5 秒");
});

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
