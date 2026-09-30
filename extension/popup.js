import { CLOCK_GUESS_NOTE, scheduleLine } from "./display.js";
import { goodsCodeFromUrl } from "./payload.js";

const TEST_URL = "https://www.momoshop.com.tw/product/15562751";
const fields = ["productUrl", "goodsCode", "goodsdtCode", "quantity"];
const status = document.querySelector("#status");
const clockNode = document.querySelector("#clock");
let clockOffset = 0;
let clockPrecise = false;

let product = {
  goodsName: "",
  goodsPrice: "",
  limitBuyQty: "",
};

function readItem() {
  const item = {
    goodsName: product.goodsName,
    goodsPrice: product.goodsPrice,
    limitBuyQty: product.limitBuyQty,
    delivery: document.querySelector("#delivery").value,
  };
  for (const id of fields) item[id] = document.querySelector(`#${id}`).value.trim();
  item.quantity = Number(item.quantity);
  return item;
}

function setDeliveries(deliveries, selected) {
  const select = document.querySelector("#delivery");
  select.replaceChildren(
    ...deliveries.map((option) => {
      const node = document.createElement("option");
      node.value = option.code;
      node.textContent = option.label;
      return node;
    }),
  );
  const preferred = deliveries.some((option) => option.code === "shopcart") ? "shopcart" : deliveries[0]?.code;
  const next = selected && [...select.options].some((option) => option.value === selected) ? selected : preferred;
  if (next) select.value = next;
}

function fill(item) {
  for (const id of fields) {
    const input = document.querySelector(`#${id}`);
    if (item[id] != null && input) input.value = item[id];
  }
}

function show(text) {
  status.textContent = text;
}

function renderLog(state) {
  const summary = document.querySelector("#log-summary");
  const lines = document.querySelector("#log-lines");
  summary.textContent = state?.summary || "";
  lines.replaceChildren(
    ...(state?.lines || []).map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      if (/(?:^|\s)ok$/.test(text)) item.className = "is-ok";
      else if (text.includes("已中止")) item.className = "is-stop";
      else if (text.includes("Failed to fetch")) item.className = "is-fail";
      return item;
    }),
  );
  if (lines.lastElementChild) lines.lastElementChild.scrollIntoView();
}

function setWhenToNow() {
  const local = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  document.querySelector("#when").value =
    `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}` +
    `T${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;
}

async function refreshSchedule() {
  const schedule = document.querySelector("#schedule");
  try {
    const state = await chrome.runtime.sendMessage({ type: "schedule" });
    schedule.textContent = scheduleLine(state);
  } catch {
    schedule.textContent = "";
  }
}

function formatClock(ms) {
  const date = new Date(ms);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

let clockReady = false;

function paintClock() {
  if (!clockReady) return;
  const skew = clockOffset / 1000;
  const relation = Math.abs(skew) < 0.05
    ? "與這台電腦幾乎相同"
    : skew > 0
      ? `比這台電腦快 ${skew.toFixed(2)} 秒`
      : `比這台電腦慢 ${Math.abs(skew).toFixed(2)} 秒`;
  const precision = clockPrecise ? "" : `，${CLOCK_GUESS_NOTE}`;
  clockNode.textContent = `momo ${formatClock(Date.now() + clockOffset)}　${relation}${precision}`;
}

async function refreshClock() {
  const synced = await chrome.runtime.sendMessage({ type: "clock" });
  if (synced?.failed || synced?.offset == null) {
    if (!clockReady) clockNode.textContent = synced?.message || "讀不到 momo 時間";
    return;
  }
  clockOffset = synced.offset;
  clockPrecise = Boolean(synced.precise);
  clockReady = true;
  paintClock();
}

async function loadProduct(url, selectedDelivery) {
  const code = goodsCodeFromUrl(url);
  if (code) document.querySelector("#goodsCode").value = code;
  if (!url.startsWith("https://www.momoshop.com.tw/product/")) return;
  show("讀取商品…");
  const info = await chrome.runtime.sendMessage({ type: "inspect", url });
  if (!info?.goodsName) {
    product = { goodsName: "", goodsPrice: "", limitBuyQty: "" };
    show(info?.message || "讀不到商品頁。");
    return;
  }
  product = {
    goodsName: info.goodsName,
    goodsPrice: info.goodsPrice,
    limitBuyQty: info.limitBuyQty || "",
  };
  if (info.goodsdtCode) document.querySelector("#goodsdtCode").value = info.goodsdtCode;
  setDeliveries(info.deliveries, selectedDelivery);
  show(`${info.goodsName}\n配送：${info.deliveries.map((item) => item.label).join("、")}`);
  await chrome.storage.local.set({ draft: readItem() });
}

document.querySelector("#productUrl").addEventListener("change", (event) => {
  loadProduct(event.target.value.trim());
});

document.querySelector("#now").addEventListener("click", async () => {
  if (!product.goodsName) await loadProduct(document.querySelector("#productUrl").value.trim());
  if (!product.goodsName) return;
  show("送出加入購物車…");
  const result = await chrome.runtime.sendMessage({ type: "add-now", item: readItem() });
  if (result?.skipped) return;
  show(result?.success ? `已加入，已打開結帳。\n${result.cartUrl}` : `失敗：${result?.message || "沒有回應"}`);
});

document.querySelector("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const whenValue = document.querySelector("#when").value;
  const when = new Date(whenValue).getTime();
  if (!whenValue || Number.isNaN(when) || when <= Date.now() + clockOffset) {
    show("開搶時間要晚於 momo 現在時間。");
    return;
  }
  if (!product.goodsName) await loadProduct(document.querySelector("#productUrl").value.trim());
  if (!product.goodsName) return;
  const job = { ...readItem(), id: `job-${when}-${Date.now()}`, when };
  show("設定排程…");
  const result = await chrome.runtime.sendMessage({ type: "arm", job });
  await refreshSchedule();
  show(result?.armed
    ? `已排程 ${whenValue}\n會用已經開著的 momo 分頁（www.momoshop.com.tw）。開賣前 3 秒把這個分頁拉到前面，面板會關掉。\n開賣前 0.8 秒開始加入，最多 20 次。`
    : `排程失敗：${result?.message || ""}`);
});

document.querySelector("#cancel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "cancel" });
  await refreshSchedule();
  show("已取消排程。");
});

const stored = await chrome.storage.local.get(["draft", "job", "lastResult"]);
const saved = {
  productUrl: TEST_URL,
  goodsCode: "15562751",
  goodsdtCode: "001",
  quantity: 1,
  ...stored.draft,
  ...stored.job,
};
fill(saved);
setWhenToNow();
await loadProduct(saved.productUrl || TEST_URL, saved.delivery);
await refreshSchedule();
chrome.alarms.onAlarm.addListener(() => {
  refreshSchedule();
});

const savedLog = await chrome.storage.session.get("burstLog");
renderLog(savedLog.burstLog);
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.burstLog) renderLog(changes.burstLog.newValue);
  if (changes.preparing) refreshSchedule();
});

refreshClock();
setInterval(paintClock, 100);
setInterval(refreshClock, 15000);

for (const id of [...fields, "delivery"]) {
  document.querySelector(`#${id}`).addEventListener("change", async () => {
    await chrome.storage.local.set({ draft: readItem() });
  });
}
