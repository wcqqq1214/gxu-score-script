import * as fs from "node:fs";
import * as path from "node:path";
import type { ExamItem } from "./exam.js";
import type { GradeItem } from "./fetch.js";

const DATA_DIR = path.resolve("data");
const GRADE_DATA_FILE = path.join(DATA_DIR, "grades.json");
const EXAM_DATA_FILE = path.join(DATA_DIR, "exams.json");
const EXAM_CHANGE_FIELDS = ["kssj", "cdmc", "cdxqmc", "xqmc", "zwh", "ksfs", "sjbh", "bz1", "ksmc"] as const;

export interface ChangeRecord {
  key: string;
  kcmc: string;
  oldBfzcj: string;
  newBfzcj: string;
  oldCjbdsj: string;
  newCjbdsj: string;
}

export interface ExamChangeRecord {
  key: string;
  kcmc: string;
  oldKssj: string;
  newKssj: string;
  oldCdmc: string;
  newCdmc: string;
  oldCdxqmc: string;
  newCdxqmc: string;
  oldXqmc: string;
  newXqmc: string;
  oldZwh: string;
  newZwh: string;
  oldKsfs: string;
  newKsfs: string;
  oldSjbh: string;
  newSjbh: string;
  oldBz1: string;
  newBz1: string;
  oldKsmc: string;
  newKsmc: string;
}

export function hasGradeStore() {
  return fs.existsSync(GRADE_DATA_FILE);
}

export function hasExamStore() {
  return fs.existsSync(EXAM_DATA_FILE);
}

export function loadStore(): Map<string, GradeItem> {
  try {
    const raw = fs.readFileSync(GRADE_DATA_FILE, "utf-8");
    const items: GradeItem[] = JSON.parse(raw);
    return new Map(items.map((item) => [item.key, item]));
  } catch {
    return new Map();
  }
}

export function loadExamStore(): Map<string, ExamItem> {
  try {
    const raw = fs.readFileSync(EXAM_DATA_FILE, "utf-8");
    const items: ExamItem[] = JSON.parse(raw);
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

export function detectExamChanges(oldData: Map<string, ExamItem>, newItems: ExamItem[]) {
  const changes: { added: ExamItem[]; changed: ExamChangeRecord[] } = { added: [], changed: [] };

  for (const item of newItems) {
    const old = oldData.get(item.key);
    if (!old) {
      changes.added.push(item);
    } else if (EXAM_CHANGE_FIELDS.some((field) => old[field] !== item[field])) {
      changes.changed.push({
        key: item.key,
        kcmc: item.kcmc,
        oldKssj: old.kssj,
        newKssj: item.kssj,
        oldCdmc: old.cdmc,
        newCdmc: item.cdmc,
        oldCdxqmc: old.cdxqmc,
        newCdxqmc: item.cdxqmc,
        oldXqmc: old.xqmc,
        newXqmc: item.xqmc,
        oldZwh: old.zwh,
        newZwh: item.zwh,
        oldKsfs: old.ksfs,
        newKsfs: item.ksfs,
        oldSjbh: old.sjbh,
        newSjbh: item.sjbh,
        oldBz1: old.bz1,
        newBz1: item.bz1,
        oldKsmc: old.ksmc,
        newKsmc: item.ksmc,
      });
    }
  }

  return changes;
}

export function saveStore(items: GradeItem[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(GRADE_DATA_FILE, JSON.stringify(items, null, 2), "utf-8");
}

export function saveExamStore(items: ExamItem[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(EXAM_DATA_FILE, JSON.stringify(items, null, 2), "utf-8");
}
