export function goodsCodeFromUrl(url) {
  const match = String(url).match(/\/product\/(\d+)/);
  return match ? match[1] : "";
}

const DELIVERY_LABELS = {
  first: "快速到貨",
  shopcart: "廠商宅配",
  superstore: "超商取貨",
};

export function deliveryLabel(code, fallback = "") {
  return DELIVERY_LABELS[code] || fallback || code;
}

export function parseProduct(html) {
  const pick = (pattern) => [...html.matchAll(pattern)].map((match) => match[1]);
  const deliveries = [];
  const seen = new Set();

  function addDelivery(code, label) {
    if (!code || seen.has(code)) return;
    seen.add(code);
    deliveries.push({ code, label: deliveryLabel(code, label) });
  }

  const codes = pick(/goodsReceiveCode\\":\\"([^\\"]+)/g);
  const labels = pick(/goodsReceiveType\\":\\"([^\\"]+)/g);
  codes.forEach((code, index) => addDelivery(code, labels[index]));

  const plain = html.replace(/\\"/g, '"');
  for (const match of plain.matchAll(/name="delivery" value="([^"]+)"[\s\S]{0,500}?<span class="text-\[#333333\]">([^<]+)/g)) {
    addDelivery(match[1], match[2]);
  }

  if (!seen.has("first")) deliveries.unshift({ code: "first", label: "快速到貨" });

  const prices = pick(/formPriceContent\\":\{\\"basePrice\\":\{\\"goodsStatus\\":\\"[^\\]*\\",\\"price\\":\\"([0-9,]+)/g)
    .map((price) => price.replace(/,/g, ""));
  const specs = pick(/goodsTypeCode\\":\\"([^\\"]+)/g);
  const names = pick(/goodsName\\":\\"([^\\"]+)/g);
  const limits = pick(/purchaseNumber\\":\\"(\d+)/g);
  return {
    goodsName: names[0] || "",
    goodsPrice: prices[0] || "",
    goodsdtCode: specs[0] || "001",
    limitBuyQty: limits[0] || "",
    deliveries,
  };
}

export function buildAddBody(item) {
  const goods = {
    work: item.delivery || "first",
    goodsCode: item.goodsCode,
    goodsName: item.goodsName,
    goodsPrice: String(item.goodsPrice),
    goodsdtCode: item.goodsdtCode || "001",
    goodsCount: String(item.quantity || 1),
    recoverYn: "0",
    addtionalGoods: [],
    setGoods: [],
    nsGift: [],
    applimitBuyYn: "0",
    applimitBuyfsCode: "",
    cn: "",
    defDely: "",
    limitBuy4MemberYn: "0",
    limitBuyQty: String(item.limitBuyQty || ""),
    negativeProfit: "",
    promoNo: "",
    savegetAmt: "",
    canUseBuy1Get1FreeYn: "0",
    largeMachineMounting: "0",
    largeMachineMountingPromoNo: "",
  };

  return {
    host: "WEB",
    data: {
      goShopCartYn: "1",
      goods: [goods],
      webCategoryCode: "",
      srcType: "00",
      cycleTimes: "",
      cycleFrequency: "",
      cycleYn: "0",
      oc: true,
      reduceQty: true,
      outPlanDate: "",
      webArea: "",
      webCid: "",
      webCtype: "",
      webOid: "",
      whCode: "",
      postalCode: "",
      inputAddress: "",
      receiverSeq: "",
      needInsurance: false,
      splitDeliveryFlag: false,
    },
  };
}
