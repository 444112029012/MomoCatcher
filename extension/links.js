export const supportLinks = [
  { label: "贊助", url: "" },
  { label: "蝦皮分潤", url: "" },
];

export function visibleLinks(links = supportLinks) {
  return links.filter((link) => link?.label && typeof link.url === "string" && link.url.startsWith("https://"));
}
