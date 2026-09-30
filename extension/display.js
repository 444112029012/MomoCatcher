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
  return `已排程，momo 時間 ${clock}`;
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
