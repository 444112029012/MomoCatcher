import { deliveryLabel } from "./payload.js";

export const CLOCK_GUESS_NOTE = "沒看到秒數跳動，時差是猜的，最多可能差 0.5 秒";

export function clockNote(offsetMs, precise) {
  const ms = Math.round(offsetMs);
  const gap = Math.abs(ms) < 50
    ? "momo 與這台電腦幾乎相同"
    : ms > 0
      ? `momo 比這台電腦快 ${ms}ms`
      : `momo 比這台電腦慢 ${-ms}ms`;
  return precise ? gap : `${gap}，${CLOCK_GUESS_NOTE}`;
}

export function scheduleLine(state) {
  if (!state?.armed || typeof state.when !== "number" || !Number.isFinite(state.when) || state.when <= 0) return "";
  const date = new Date(state.when);
  const pad = (value) => String(value).padStart(2, "0");
  const clock = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const parts = [`已排程 ${clock}`];
  if (state.goodsName) parts.push(state.goodsName);
  const delivery = deliveryLabel(state.delivery || "", "");
  if (delivery) parts.push(delivery);
  if (state.quantity) parts.push(`${state.quantity} 件`);
  return parts.join("　");
}

export function panelResult(state) {
  const entries = state?.lines || [];
  const hasLog = Boolean(state?.summary) || entries.length > 0;
  if (!hasLog) return "";
  return resultSentence(entries);
}

export function resultSentence(lines) {
  const texts = (lines || []).map((line) => String(line || ""));
  if (texts.some((text) => /(?:^|\s)ok$/.test(text) || text.includes("已加入"))) return "已加入";
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index];
    if (text.includes("已中止")) continue;
    if (text.includes("還沒登入")) return "還沒登入";
    if (text.includes("尚未開賣")) return "尚未開賣";
    if (text.includes("Failed to fetch")) return "網路失敗";
    if (text.includes("庫存不足")) return "庫存不足";
    if (text.includes("限購")) return "已達限購";
  }
  return "";
}

export function resultNotice(record) {
  const success = Boolean(record?.success);
  const fallback = success ? "已加入購物車" : "加入購物車失敗";
  const message = String(record?.message || fallback).replace(/\s+/g, " ").trim().slice(0, 240) || fallback;
  return {
    title: success ? "Momo Catcher：已加入" : "Momo Catcher：未加入",
    message,
  };
}
