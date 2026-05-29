import * as fs from "node:fs";
import * as path from "node:path";
import type { GradeItem } from "./fetch.js";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "grades.json");

interface ChangeRecord {
  key: string;
  kcmc: string;
  oldBfzcj: string;
  newBfzcj: string;
  oldCjbdsj: string;
  newCjbdsj: string;
}

export function loadStore(): Map<string, GradeItem> {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const items: GradeItem[] = JSON.parse(raw);
    return new Map(items.map((item) => [item.key, item]));
  } catch {
    return new Map();
  }
}

export function detectChanges(oldData: Map<string, GradeItem>, newItems: GradeItem[]) {
  const changes: { added: GradeItem[]; changed: ChangeRecord[] } = { added: [], changed: [] };

  for (const item of newItems) {
    const old = oldData.get(item.key);
    if (!old) {
      changes.added.push(item);
    } else if (old.bfzcj !== item.bfzcj || old.cjbdsj !== item.cjbdsj) {
      changes.changed.push({
        key: item.key,
        kcmc: item.kcmc,
        oldBfzcj: old.bfzcj,
        newBfzcj: item.bfzcj,
        oldCjbdsj: old.cjbdsj,
        newCjbdsj: item.cjbdsj,
      });
    }
  }

  return changes;
}

export function saveStore(items: GradeItem[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), "utf-8");
}
