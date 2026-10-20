import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildAddBody, goodsCodeFromUrl, parseProduct } from "../extension/payload.js";
import { clueLines, formatSaleTimestamp } from "../extension/display.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "product-15562751.html");
const savedPage = readFileSync(fixturePath, "utf8");

test("reads the saved momo product page", () => {
  assert.deepEqual(parseProduct(savedPage), {
    goodsName: "【TOMICA】無極限 迷你四驅車Ray Stinger",
    goodsPrice: "315",
    goodsdtCode: "001",
    limitBuyQty: "30",
    goodsStock: "1",
    onSaleTimestamp: "0",
    canTipStock: "",
    purchaseText: "",
    limitBuy4MemberOnly: "0",
    goodsPaymentDescription: "預計今天 10/01 到貨",
    goodsNum: "20",
    purchaseNumber: "30",
    deliveries: [
      { code: "first", label: "快速到貨" },
      { code: "superstore", label: "超商取貨" },
    ],
  });
});

test("cart body keeps the parsed name, price, delivery, and limit", () => {
  const info = parseProduct(savedPage);
  const goods = buildAddBody({
    delivery: "superstore",
    goodsCode: "15562751",
    goodsName: info.goodsName,
    goodsPrice: info.goodsPrice,
    goodsdtCode: info.goodsdtCode,
    quantity: 2,
    limitBuyQty: info.limitBuyQty,
  }).data.goods[0];

  assert.equal(goods.work, "superstore");
  assert.equal(goods.goodsCode, "15562751");
  assert.equal(goods.goodsName, "【TOMICA】無極限 迷你四驅車Ray Stinger");
  assert.equal(goods.goodsPrice, "315");
  assert.equal(goods.goodsdtCode, "001");
  assert.equal(goods.goodsCount, "2");
  assert.equal(goods.limitBuyQty, "30");
});

test("strips commas from the price and keeps a shopcart delivery", () => {
  const info = parseProduct([
    'goodsName\\":\\"逗號價格\\"',
    'formPriceContent\\":{\\"basePrice\\":{\\"goodsStatus\\":\\"\\",\\"price\\":\\"1,299\\"',
    'goodsTypeCode\\":\\"003\\"',
    'purchaseNumber\\":\\"2\\"',
    'goodsReceiveCode\\":\\"shopcart\\"',
    'goodsReceiveType\\":\\"廠商宅配\\"',
  ].join(","));

  assert.equal(info.goodsName, "逗號價格");
  assert.equal(info.goodsPrice, "1299");
  assert.equal(info.goodsdtCode, "003");
  assert.equal(info.limitBuyQty, "2");
  assert.deepEqual(info.deliveries, [
    { code: "first", label: "快速到貨" },
    { code: "shopcart", label: "廠商宅配" },
  ]);
});

test("keeps an unknown delivery label and still offers fast delivery", () => {
  const info = parseProduct('name="delivery" value="island"/><span class="text-[#333333]">離島配送</span>');
  assert.equal(info.goodsdtCode, "001");
  assert.deepEqual(info.deliveries, [
    { code: "first", label: "快速到貨" },
    { code: "island", label: "離島配送" },
  ]);
});

test("collapses a repeated delivery code", () => {
  const info = parseProduct([
    'goodsReceiveCode\\":\\"shopcart\\"',
    'goodsReceiveType\\":\\"廠商宅配\\"',
    'goodsReceiveCode\\":\\"shopcart\\"',
    'goodsReceiveType\\":\\"廠商宅配\\"',
    'goodsName\\":\\"重複配送\\"',
  ].join(","));
  assert.equal(info.goodsName, "重複配送");
  assert.deepEqual(info.deliveries, [
    { code: "first", label: "快速到貨" },
    { code: "shopcart", label: "廠商宅配" },
  ]);
});

test("clues show stock and the sale timestamp without treating stock as permission to buy", () => {
  const info = parseProduct([
    'goodsName\\":\\"測試商品\\"',
    'goodsStock\\":\\"0\\"',
    'onSaleTimestamp\\":0',
    'purchaseNumber\\":\\"1\\"',
    'purchaseText\\":\\"每人限購1組\\"',
    'canTipStock\\":\\"1\\"',
    'limitBuy4MemberOnly\\":\\"1\\"',
    'goodsPaymentDescription\\":\\"預計今天到貨\\"',
    'goodsTypeCode\\":\\"001\\",\\"canTipStock\\":\\"1\\",\\"goodsNum\\":\\"0\\"',
  ].join(","));
  assert.equal(info.goodsStock, "0");
  assert.equal(info.goodsNum, "0");
  assert.equal(info.canTipStock, "1");
  assert.ok(clueLines(info).includes("canTipStock　1"));
  assert.equal(clueLines(info)[0], "上次抓取　還沒抓取");
  assert.deepEqual(clueLines(info).slice(1, 4), [
    "庫存 goodsStock　0",
    "開賣時間 onSaleTimestamp　0（沒有開賣時間）",
    "規格庫存 goodsNum　0",
  ]);
  const fetched = new Date(2026, 9, 20, 9, 40, 1, 234).getTime();
  assert.equal(clueLines({ ...info, fetchedAt: fetched })[0], "上次抓取　2026-10-20 09:40:01.234");
  assert.equal(formatSaleTimestamp(new Date(2026, 9, 20, 0, 0, 0).getTime()), "2026-10-20 00:00:00");
});

test("reads a goods code from a product url", () => {
  assert.equal(goodsCodeFromUrl("https://www.momoshop.com.tw/product/15687164"), "15687164");
  assert.equal(goodsCodeFromUrl("https://www.momoshop.com.tw/product/15687164?cid=1"), "15687164");
  assert.equal(goodsCodeFromUrl("https://www.momoshop.com.tw/"), "");
  assert.equal(goodsCodeFromUrl(""), "");
});
