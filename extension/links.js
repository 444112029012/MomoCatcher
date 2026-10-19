export const supportLinks = [
  { label: "贊助", url: "" },
  { label: "Funbox蝦皮官網", url: "https://s.shopee.tw/9fLlBmTscp" },
];

export function visibleLinks(links = supportLinks) {
  return links.filter((link) => link?.label && typeof link.url === "string" && link.url.startsWith("https://"));
}
