import type { Page } from "playwright";

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
  kkxbmc: string;
  jsxm: string;
  xnmmc: string;
  xqmmc: string;
  kcxzmc: string;
  cjbdsj: string;
  jxbmc: string;
  [key: string]: string;
}

export async function fetchGrades(page: Page): Promise<GradeItem[]> {
  await page.goto(GRADE_PAGE, { waitUntil: "networkidle", timeout: 15000 });
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

  const result = await page.evaluate(
    async ({ url, body }: { url: string; body: Record<string, string> }) => {
      const formBody = new URLSearchParams(body).toString();
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
        credentials: "include",
      });
      return await resp.json();
    },
    { url: DATA_URL, body: formData },
  );

  return result.items ?? [];
}
