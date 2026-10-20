export const strategies = [
  {
    id: "strategy-1",
    label: "策略一",
    note: "開賣瞬間、200、600、1100 毫秒，接著 2100、2400、2800 毫秒，共 7 次。",
    offsets: [0, 200, 600, 1100, 2100, 2400, 2800],
  },
];

export function strategyById(id) {
  return strategies.find((item) => item.id === id) || strategies[0];
}
