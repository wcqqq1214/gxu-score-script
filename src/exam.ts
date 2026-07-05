import type { Page } from "playwright";

const BASE = "https://jwxt2018.gxu.edu.cn";
const EXAM_PAGE = `${BASE}/jwglxt/kwgl/kscx_cxXsksxxIndex.html?gnmkdm=N358105`;
const EXAM_DATA_URL = "/jwglxt/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105";

type RawExamItem = Record<string, unknown>;

export interface ExamItem {
  key: string;
  kcmc: string;
  kch: string;
  kssj: string;
  cdmc: string;
  cdxqmc: string;
  xqmc: string;
  zwh: string;
  cxbj: string;
  zxbj: string;
  ksmc: string;
  jsxx: string;
  jxbmc: string;
  kkxy: string;
  xf: string;
  ksfs: string;
  sjbh: string;
  bz1: string;
  [key: string]: string;
}

function toText(value: unknown) {
  return value == null ? "" : String(value);
}

function firstValue(item: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (item[key]) return item[key];
  }
  return "";
}

function buildExamKey(item: Record<string, string>) {
  const parts = [
    firstValue(item, ["ksmc", "kssj"]),
    firstValue(item, ["kch", "kcmc"]),
    firstValue(item, ["jxb_id", "jxbmc"]),
    firstValue(item, ["sjbh", "zwh"]),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("-") : Object.values(item).join("-");
}

function normalizeExamItem(raw: RawExamItem): ExamItem {
  const item: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    item[key] = toText(value);
  }

  return {
    ...item,
    key: item.key || buildExamKey(item),
    kcmc: item.kcmc || "",
    kch: item.kch || "",
    kssj: item.kssj || "",
    cdmc: item.cdmc || "",
    cdxqmc: item.cdxqmc || "",
    xqmc: item.xqmc || "",
    zwh: item.zwh || "",
    cxbj: item.cxbj || "",
    zxbj: item.zxbj || "",
    ksmc: item.ksmc || "",
    jsxx: item.jsxx || "",
    jxbmc: item.jxbmc || "",
    kkxy: item.kkxy || "",
    xf: item.xf || "",
    ksfs: item.ksfs || "",
    sjbh: item.sjbh || "",
    bz1: item.bz1 || "",
  };
}

function buildRequestBody(formData: Record<string, string>) {
  const body = { ...formData };
  body.xnm ||= formData.cx_xnm || "";
  body.xqm ||= formData.cx_xqm || "";
  body._search ||= "false";
  body.nd = String(Date.now());
  body["queryModel.showCount"] ||= "100";
  body["queryModel.currentPage"] ||= "1";
  body["queryModel.sortName"] ||= "";
  body["queryModel.sortOrder"] ||= "asc";
  body.time ||= "0";
  return body;
}

export async function fetchExams(page: Page): Promise<ExamItem[]> {
  await page.goto(EXAM_PAGE, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(3000);

  const formData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    document
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("#searchForm input, #searchForm select")
      .forEach((el) => {
        if (el.name) data[el.name] = el.value;
      });
    return data;
  });

  const result = (await page.evaluate(
    async ({ url, body }: { url: string; body: Record<string, string> }) => {
      const formBody = new URLSearchParams(body).toString();
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: formBody,
        credentials: "include",
      });
      return await resp.json();
    },
    { url: EXAM_DATA_URL, body: buildRequestBody(formData) },
  )) as { items?: RawExamItem[] };

  return Array.isArray(result.items) ? result.items.map(normalizeExamItem) : [];
}
