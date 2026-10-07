import type { Page } from "playwright";

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function fetchAllPages(page: Page, url: string, formData: Record<string, string>): Promise<Row[]> {
  const items: Row[] = [];
  const seenPages = new Set<string>();
  let total: number | undefined;

  for (let currentPage = 1; ; currentPage++) {
    const result: unknown = await page.evaluate(
      async ({ url, body }) => {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams(body).toString(),
          credentials: "include",
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) throw new Error(`教务接口返回 HTTP ${resp.status}`);
        return await resp.json();
      },
      {
        url,
        body: { ...formData, "queryModel.showCount": "100", "queryModel.currentPage": String(currentPage) },
      },
    );

    if (!isRecord(result) || result.success === false || !Array.isArray(result.items)) {
      throw new Error("教务接口未返回有效列表");
    }
    if (!result.items.every(isRecord)) throw new Error("教务接口包含无效记录");

    const count =
      typeof result.totalResult === "number"
        ? result.totalResult
        : typeof result.totalResult === "string" && /^\d+$/.test(result.totalResult)
          ? Number(result.totalResult)
          : NaN;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("教务接口未返回有效总数");
    if (total !== undefined && total !== count) throw new Error("分页期间记录总数发生变化，请重试");
    total = count;

    const fingerprint = JSON.stringify(result.items);
    if (seenPages.has(fingerprint)) throw new Error("教务接口返回重复分页");
    seenPages.add(fingerprint);
    items.push(...result.items);
    if (items.length > total) throw new Error("教务接口记录数超过总数");
    if (items.length === total) return items;
    if (result.items.length === 0) throw new Error("教务接口分页不完整");
  }
}
