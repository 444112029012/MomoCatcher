export const strategies = [
  {
    id: "strategy-1",
    label: "策略一",
    note: "開賣瞬間、300、800、1000 毫秒，接著 2100、2400、2900 毫秒，共 7 次。",
    offsets: [0, 300, 800, 1000, 2100, 2400, 2900],
  },
  {
    id: "strategy-2",
    label: "策略二",
    note: "開賣後看 canTipStock。是 3 或 0 就繼續等。其他值先送。尚未開賣不計入 4 次，兩次至少隔 0.5 秒。人數眾多才計入，並等 0.5 秒再送，最多 4 次。成功、沒登入或連線失敗就停止。沒貨會繼續送。",
    sequential: true,
    attempts: 4,
    crowdWaitMs: 500,
    minSendGapMs: 500,
    holdTipStocks: ["3", "0"],
    watchMs: 2900,
  },
  {
    id: "strategy-3",
    label: "策略三",
    note: "開賣後最多 5 分鐘看 goodsStock，每秒 2 次。是 0 或空就繼續等；有庫存就送 1 次，兩次加入至少隔 0.5 秒。成功、沒登入或連線失敗就停止。",
    watchStock: true,
    stockWatchMs: 300000,
    stockPollMs: 500,
    minSendGapMs: 500,
  },
];

export function shouldBurst(canTipStock, hold = ["3", "0"]) {
  return !hold.includes(String(canTipStock ?? ""));
}

export function hasStock(goodsStock) {
  const value = String(goodsStock ?? "");
  return value !== "" && value !== "0";
}

export function usesAttempt(message) {
  return !/尚未開賣|SCS101/.test(String(message || ""));
}

export function strategyById(id) {
  return strategies.find((item) => item.id === id) || strategies[0];
}
