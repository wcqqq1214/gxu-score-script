import type { Page } from "playwright";
import { fetchAllPages } from "./query.js";

const BASE = "https://jwxt2018.gxu.edu.cn";
const GRADE_PAGE = `${BASE}/jwglxt/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005`;
const DATA_URL = "/jwglxt/cjcx/cjcx_cxXsgrcj.html?gnmkdm=N305005&doType=query";

export interface GradeItem {
  key: string;
  kcmc: string;
  kch: string;
  bfzcj: string;
  cj: string;
  xf: string;
  jd: string;
  ksxz: string;
  jsxm: string;
  xnmmc: string;
  xqmmc: string;
  kcxzmc: string;
  cjbdsj: string;
  jxbmc: string;
  [key: string]: string;
}

export async function fetchGrades(page: Page): Promise<GradeItem[]> {
  await page.goto(GRADE_PAGE, { waitUntil: "load", timeout: 30000 });
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

  const items = await fetchAllPages(page, DATA_URL, formData);
  const keys = new Set<string>();
  for (const item of items) {
    if (typeof item.key !== "string" || !item.key || keys.has(item.key)) {
      throw new Error("成绩记录缺少唯一标识或标识重复");
    }
    keys.add(item.key);
  }
  return items as GradeItem[];
}
