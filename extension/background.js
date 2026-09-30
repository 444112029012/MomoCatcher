import { clockNote, resultNotice } from "./display.js";
import { buildAddBody, goodsCodeFromUrl, parseProduct } from "./payload.js";

const ADD_URL = "https://cart.momoshop.com.tw/api/shoppingcart/modify/addGoods";
const CART_PAGE = "https://cart.momoshop.com.tw/view/cart/WEB/newNormal";
const LIMIT_HIT = "已超過此商品的限購數量";
const TIME_URL = "https://www.momoshop.com.tw/";
const ALARM = "momo-add";
const LEAD_MS = 800;
const WAKE_BEFORE_SALE_MS = 10000;
const FOCUS_BEFORE_SALE_MS = 3000;
const INTERVAL_MS = 100;
const ATTEMPTS = 20;
const PANEL_TIME_SAMPLES = 6;
const SALE_TIME_SAMPLES = 30;

let firing = false;
let burstCancelled = false;
let burstTabId = null;
let clock = { offset: 0, rtt: 0, syncedAt: 0, precise: false };
let logState = { summary: "", lines: [] };

function formatClock(ms) {
  const date = new Date(ms);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function skewNote() {
  return clockNote(clock.offset, clock.precise);
}

function formatDelay(ms) {
  const rounded = Math.round(ms);
  const sign = rounded > 0 ? "+" : "";
  return `延遲 ${sign}${rounded}ms`;
}

function publishLog() {
  chrome.storage.session.set({ burstLog: { summary: logState.summary, lines: logState.lines.slice() } });
}

function appendLog(line) {
  logState.lines.push(line);
  publishLog();
}

function beginLog(summary, firstLine) {
  logState = { summary, lines: firstLine ? [firstLine] : [] };
  publishLog();
}

function momoNow() {
  return Date.now() + clock.offset;
}

async function readServerDate() {
  const started = Date.now();
  const response = await fetch(TIME_URL, { method: "HEAD", cache: "no-store", credentials: "omit" });
  const ended = Date.now();
  const server = Date.parse(response.headers.get("date") || "");
  if (Number.isNaN(server)) throw new Error("momo 沒有回傳時間");
  return { server, started, ended, rtt: ended - started };
}

async function syncClock(stopAt = Infinity, attempts = PANEL_TIME_SAMPLES) {
  let previous = null;
  let best = null;
  for (let i = 0; i < attempts; i += 1) {
    if (Date.now() >= stopAt) break;
    let sample;
    try {
      sample = await readServerDate();
    } catch {
      previous = null;
      continue;
    }
    if (!best || sample.rtt < best.rtt) best = sample;
    if (previous && sample.server >= previous.server + 1000) {
      const boundary = (previous.ended + sample.started) / 2;
      clock = { offset: sample.server - boundary, rtt: sample.rtt, syncedAt: Date.now(), precise: true };
      return clock;
    }
    previous = sample;
  }
  if (!best) return clock;
  const midpoint = best.started + best.rtt / 2;
  clock = { offset: best.server + 500 - midpoint, rtt: best.rtt, syncedAt: Date.now(), precise: false };
  return clock;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(target) {
  while (Date.now() < target) {
    if (burstCancelled) return false;
    await chrome.runtime.getPlatformInfo();
    const delay = Math.min(1000, target - Date.now());
    if (delay <= 0) break;
    await sleep(delay);
  }
  return !burstCancelled;
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("商品頁載入逾時"));
    }, 20000);

    function finish() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }

    function ready(tab) {
      return tab?.status === "complete" && /^https:/.test(tab.url || "");
    }

    function onUpdated(id, _info, tab) {
      if (id === tabId && ready(tab)) finish();
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (ready(tab)) finish();
    }, reject);
  });
}

async function momoTab(productUrl, active = true) {
  const tabs = await chrome.tabs.query({ url: "https://www.momoshop.com.tw/*" });
  const existing = tabs.find((tab) => tab.id != null);
  if (existing?.id != null) return existing.id;

  const created = await chrome.tabs.create({ url: productUrl, active });
  if (created.id == null) throw new Error("無法打開商品頁");
  await waitForLoad(created.id);
  return created.id;
}

function addedToCart(data) {
  return data?.success === true && Boolean(data?.rtnData?.cartUrl);
}

function reachedLimit(data) {
  return String(data?.resultMessage || "").includes(LIMIT_HIT);
}

async function openCheckout(cartUrl) {
  const tab = await chrome.tabs.create({ url: cartUrl, active: true });
  if (tab.id == null) return;
  await waitForLoad(tab.id);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => new Promise((resolve) => {
      const deadline = Date.now() + 8000;

      function checkoutButton() {
        return [...document.querySelectorAll("button, a, [role='button']")].find((node) => {
          const text = (node.innerText || "").replace(/\s/g, "");
          return text.startsWith("結帳") && !text.includes("確認");
        });
      }

      const timer = setInterval(() => {
        const button = checkoutButton();
        if (button) {
          clearInterval(timer);
          button.click();
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    }),
  });
}

async function postInTab(tabId, body) {
  await waitForLoad(tabId);
  let injected;
  try {
    [injected] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [ADD_URL, body],
      func: async (url, payload) => {
        try {
          const response = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
              Accept: "application/json, text/plain, */*",
              "Content-Type": "application/json;charset=UTF-8",
            },
            referrer: location.href,
            body: JSON.stringify(payload),
          });
          return { status: response.status, text: await response.text(), error: "" };
        } catch (error) {
          return { status: 0, text: "", error: error?.message || String(error) };
        }
      },
    });
  } catch (error) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    throw new Error(`無法在分頁執行：${error?.message || error}（${tab?.url || "沒有網址"}）`);
  }
  if (!injected?.result) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    throw new Error(`商品頁沒有回傳結果（${tab?.url || "沒有網址"}）`);
  }
  if (injected.result.error) throw new Error(injected.result.error);
  return injected.result;
}

function describe(data, raw) {
  if (!data) return raw?.text?.slice(0, 300) || "沒有回應";
  if (data.rtnData?.login === false) return "這個 Chrome 還沒登入 momo";
  if (data.rtnData?.stockNotEnough) return "庫存不足";
  return data.resultMessage || "沒有回應";
}

async function hydrate(item) {
  if (item.goodsName && item.goodsPrice) return item;
  const response = await fetch(item.productUrl, { credentials: "omit" });
  if (!response.ok) throw new Error(`商品頁 HTTP ${response.status}`);
  const info = parseProduct(await response.text());
  if (!info.goodsName) throw new Error("讀不到商品名稱");
  return {
    ...item,
    goodsCode: item.goodsCode || goodsCodeFromUrl(item.productUrl),
    goodsName: info.goodsName,
    goodsPrice: info.goodsPrice,
    goodsdtCode: item.goodsdtCode || info.goodsdtCode,
    limitBuyQty: item.limitBuyQty || info.limitBuyQty,
    delivery: item.delivery || info.deliveries[0]?.code || "first",
  };
}

async function runAdd(item) {
  beginLog(`立即測試　紀錄為本地時間　${skewNote()}`, "準備送出…");
  const ready = await hydrate(item);
  const body = buildAddBody(ready);
  const tabId = await momoTab(item.productUrl);
  const sentAt = Date.now();
  let raw;
  try {
    raw = await postInTab(tabId, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "加入購物車失敗";
    appendLog(`送出 ${formatClock(sentAt)}（本地）　收到 ${formatClock(Date.now())}（本地）　${message}`);
    const record = {
      at: Date.now(),
      success: false,
      message,
      cartUrl: "",
      status: 0,
      goodsCode: item.goodsCode,
    };
    await remember(record);
    return record;
  }
  let data = null;
  try {
    data = JSON.parse(raw.text);
  } catch {
    data = null;
  }
  appendLog(`送出 ${formatClock(sentAt)}（本地）　收到 ${formatClock(Date.now())}（本地）　${describe(data, raw)}`);

  let cartUrl = data?.rtnData?.cartUrl || "";
  let success = addedToCart(data);
  if (reachedLimit(data)) {
    success = true;
    cartUrl = cartUrl || CART_PAGE;
  } else if (!success && Number(ready.quantity) !== 1) {
    const retryAt = Date.now();
    let retryRaw;
    try {
      retryRaw = await postInTab(tabId, buildAddBody({ ...ready, quantity: 1 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "加入購物車失敗";
      appendLog(`改送數量 1　送出 ${formatClock(retryAt)}（本地）　收到 ${formatClock(Date.now())}（本地）　${message}`);
      const record = {
        at: Date.now(),
        success: false,
        message,
        cartUrl: "",
        status: 0,
        goodsCode: item.goodsCode,
      };
      await remember(record);
      return record;
    }
    try {
      data = JSON.parse(retryRaw.text);
    } catch {
      data = null;
    }
    appendLog(`改送數量 1　送出 ${formatClock(retryAt)}（本地）　收到 ${formatClock(Date.now())}（本地）　${describe(data, retryRaw)}`);
    cartUrl = data?.rtnData?.cartUrl || "";
    success = addedToCart(data);
    if (reachedLimit(data)) {
      success = true;
      cartUrl = cartUrl || CART_PAGE;
    }
  }
  if (success) await openCheckout(cartUrl);

  const record = {
    at: Date.now(),
    success,
    message: describe(data, raw),
    cartUrl,
    status: raw.status,
    goodsCode: item.goodsCode,
  };
  await remember(record);
  return record;
}

function notifyResult(record) {
  const notice = resultNotice(record);
  const created = chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: notice.title,
    message: notice.message,
    requireInteraction: true,
  });
  if (created && typeof created.catch === "function") created.catch(() => {});
}

async function remember(record) {
  await chrome.storage.local.set({ lastResult: record });
  notifyResult(record);
}

async function runBurst(job) {
  const ready = await hydrate(job);
  const body = buildAddBody(ready);
  const roughSale = job.when - clock.offset;
  const tabReady = momoTab(job.productUrl, false);
  await Promise.all([
    tabReady,
    syncClock(roughSale - FOCUS_BEFORE_SALE_MS, SALE_TIME_SAMPLES),
  ]);
  const tabId = await tabReady;
  burstTabId = tabId;
  const saleAt = job.when - clock.offset;
  const startLocal = saleAt - LEAD_MS;
  const focusAt = saleAt - FOCUS_BEFORE_SALE_MS;
  await beginLog(
    `預定 ${formatClock(job.when)}（momo 時間）　以下為本地時間　${skewNote()}　延遲負值代表比預定早`,
    "對時完成，開賣前 3 秒會把視窗拉到前面。",
  );
  if (!await waitUntil(focusAt)) {
    appendLog("已取消，未送出");
    return { at: Date.now(), success: false, message: "已取消", cartUrl: "", status: 0, goodsCode: ready.goodsCode };
  }
  const remain = startLocal - Date.now();
  appendLog(remain >= 0 ? `準備完成，距第一發還有 ${remain}ms` : `準備完成時已晚 ${-remain}ms，會立刻送出`);
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });

  let injected;
  try {
    [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [ADD_URL, body, startLocal, saleAt, INTERVAL_MS, ATTEMPTS],
    func: async (url, payload, startAt, sale, interval, attempts) => {
      globalThis.__momoCatcherStop = false;
      const controllers = [];
      globalThis.__momoCatcherAbort = () => {
        globalThis.__momoCatcherStop = true;
        for (const controller of controllers) controller.abort();
      };
      const sleepUntil = (target) => new Promise((resolve) => {
        const delay = target - Date.now();
        if (delay <= 0) resolve();
        else setTimeout(resolve, delay);
      });

      let won = null;
      let lastMessage = "沒有回應";
      let sent = 0;
      const pending = [];

      function report(n, sentAt, message) {
        const doneAt = Date.now();
        chrome.runtime.sendMessage({
          type: "log",
          line: {
            n,
            sentAt,
            doneAt,
            sentDelay: sentAt - sale,
            recvDelay: doneAt - sale,
            message,
          },
        }).catch(() => {});
      }

      for (let index = 0; index < attempts; index += 1) {
        if (globalThis.__momoCatcherStop || won) break;
        await sleepUntil(startAt + index * interval);
        if (globalThis.__momoCatcherStop || won) break;
        const controller = new AbortController();
        controllers.push(controller);
        sent += 1;
        const n = sent;
        const sentAt = Date.now();
        pending.push(fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
          },
          referrer: location.href,
          body: JSON.stringify(payload),
          signal: controller.signal,
        }).then(async (response) => {
          const text = await response.text();
          let data = null;
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }
          let message = "";
          if (data?.rtnData?.login === false) {
            message = "這個 Chrome 還沒登入 momo";
            lastMessage = message;
            globalThis.__momoCatcherAbort();
          } else if (data?.success === true && data?.rtnData?.cartUrl) {
            message = "ok";
            if (!won) {
              won = { cartUrl: data.rtnData.cartUrl, message: data.resultMessage };
              globalThis.__momoCatcherAbort();
            }
          } else if (String(data?.resultMessage || "").includes("已超過此商品的限購數量")) {
            message = data.resultMessage;
            if (!won) {
              won = { cartUrl: data?.rtnData?.cartUrl || "https://cart.momoshop.com.tw/view/cart/WEB/newNormal", message };
              globalThis.__momoCatcherAbort();
            }
          } else if (data?.rtnData?.stockNotEnough) {
            message = "庫存不足";
            lastMessage = message;
          } else if (data?.resultMessage) {
            message = data.resultMessage;
            lastMessage = message;
          } else {
            message = text.slice(0, 120) || `HTTP ${response.status}`;
            lastMessage = message;
          }
          report(n, sentAt, message);
        }).catch((error) => {
          const message = error?.name === "AbortError" ? "已中止" : (error?.message || "失敗");
          if (error?.name !== "AbortError") lastMessage = message;
          if (error?.name !== "AbortError" && String(error?.message || "").includes("Failed to fetch")) {
            globalThis.__momoCatcherStop = true;
          }
          report(n, sentAt, message);
        }));
      }

      await Promise.all(pending);
      return { success: Boolean(won), cartUrl: won?.cartUrl || "", message: won ? "ok" : lastMessage, sent };
    },
  });
  } catch (error) {
    const failedTab = await chrome.tabs.get(tabId).catch(() => null);
    const message = `無法在分頁執行：${error?.message || error}（${failedTab?.url || "沒有網址"}）`;
    appendLog(message);
    const record = {
      at: Date.now(),
      success: false,
      message,
      cartUrl: "",
      status: 0,
      goodsCode: ready.goodsCode,
    };
    await remember(record);
    return record;
  }

  const result = injected?.result || { success: false, message: "商品頁沒有回傳結果", cartUrl: "", sent: 0 };
  if (!injected?.result) appendLog(result.message);
  if (result.success && result.cartUrl) await openCheckout(result.cartUrl);
  const record = {
    at: Date.now(),
    success: result.success,
    message: result.success ? `已加入（送出 ${result.sent} 次）` : `${result.message}（已送 ${result.sent} 次）`,
    cartUrl: result.cartUrl,
    status: result.success ? 200 : 0,
    goodsCode: ready.goodsCode,
  };
  await remember(record);
  return record;
}

async function fireJob(job) {
  if (!job?.id || firing) return { skipped: true };
  firing = true;
  try {
    const key = `fired:${job.id}`;
    const existing = await chrome.storage.session.get(key);
    if (existing[key]) return { skipped: true };
    await chrome.storage.session.set({ [key]: Date.now() });
    return await runAdd(job);
  } catch (error) {
    const record = {
      at: Date.now(),
      success: false,
      message: error instanceof Error ? error.message : "加入購物車失敗",
      cartUrl: "",
      status: 0,
      goodsCode: job.goodsCode,
    };
    appendLog(record.message);
    await remember(record);
    return record;
  } finally {
    firing = false;
    burstTabId = null;
  }
}

async function arm(job) {
  await syncClock();
  await chrome.storage.local.set({ job });
  await chrome.alarms.clear(ALARM);
  const saleLocal = job.when - clock.offset;
  await chrome.alarms.create(ALARM, { when: Math.max(Date.now() + 200, saleLocal - WAKE_BEFORE_SALE_MS) });
  await momoTab(job.productUrl);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { job } = await chrome.storage.local.get("job");
  if (!job || firing) return;
  burstCancelled = false;
  firing = true;
  await chrome.storage.session.set({ preparing: job.when });
  try {
    const key = `fired:${job.id}`;
    const existing = await chrome.storage.session.get(key);
    if (existing[key]) return;
    await chrome.storage.session.set({ [key]: Date.now() });
    await runBurst(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "加入購物車失敗";
    if (!logState.summary) await beginLog("排程失敗", message);
    else appendLog(message);
    await remember({
      at: Date.now(),
      success: false,
      message,
      cartUrl: "",
      status: 0,
      goodsCode: job.goodsCode,
    });
  } finally {
    firing = false;
    burstTabId = null;
    await chrome.storage.session.remove("preparing");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "log" && message.line) {
    const line = message.line;
    const text = String(line.message || "").replace(/\s+/g, " ").slice(0, 80);
    const n = String(line.n).padStart(2, "0");
    appendLog(`#${n} 送出 ${formatClock(line.sentAt)}（本地）　${formatDelay(line.sentDelay)}　收到 ${formatClock(line.doneAt)}（本地）　${formatDelay(line.recvDelay)}　${text}`);
    return false;
  }

  if (message?.type === "clock") {
    const stale = Date.now() - clock.syncedAt > 15000;
    const task = stale || !clock.syncedAt ? syncClock() : Promise.resolve(clock);
    task
      .then((synced) => sendResponse({ ...synced, momoNow: Date.now() + synced.offset }))
      .catch((error) => sendResponse({ failed: true, message: error.message, offset: clock.offset }));
    return true;
  }

  if (message?.type === "inspect") {
    fetch(message.url, { credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`商品頁 HTTP ${response.status}`);
        return parseProduct(await response.text());
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ message: error.message, deliveries: [] }));
    return true;
  }

  if (message?.type === "schedule") {
    Promise.all([
      chrome.alarms.get(ALARM),
      chrome.storage.local.get("job"),
      chrome.storage.session.get("preparing"),
    ]).then(([alarm, stored, session]) => {
      const when = stored.job?.when;
      const preparing = session.preparing === when;
      sendResponse((alarm || preparing) && typeof when === "number" ? { armed: true, when } : { armed: false });
    })
      .catch(() => sendResponse({ armed: false }));
    return true;
  }

  if (message?.type === "add-now") {
    fireJob({ ...message.item, id: `now-${Date.now()}` })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, message: error.message }));
    return true;
  }

  if (message?.type === "arm") {
    arm(message.job)
      .then(() => sendResponse({ armed: true }))
      .catch((error) => sendResponse({ armed: false, message: error.message }));
    return true;
  }

  if (message?.type === "cancel") {
    burstCancelled = true;
    chrome.alarms.clear(ALARM).then(async () => {
      await chrome.storage.local.remove("job");
      await chrome.storage.session.remove("preparing");
      if (burstTabId != null) {
        await chrome.scripting.executeScript({
          target: { tabId: burstTabId },
          func: () => globalThis.__momoCatcherAbort?.(),
        }).catch(() => {});
      }
      sendResponse({ armed: false });
    });
    return true;
  }

  return false;
});
