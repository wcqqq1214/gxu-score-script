import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGrades } from "../src/fetch.ts";
import { fetchExams } from "../src/exam.ts";
import { detectExamChanges } from "../src/store.ts";

function mockPage(responses, form = {}) {
  const calls = [];
  return {
    calls,
    goto: async () => {},
    waitForTimeout: async () => {},
    evaluate: async (callback, args) => {
      if (!args) return form;
      calls.push(args.body);
      const response = responses[calls.length - 1];
      assert.ok(response, "unexpected extra page request");
      return structuredClone(response);
    },
  };
}

for (const [label, fetchItems] of [
  ["grades", fetchGrades],
  ["exams", fetchExams],
]) {
  test(`${label}: rejects business errors and malformed lists, accepts explicit empty result`, async () => {
    for (const response of [
      { success: false, message: "session expired" },
      { success: false, items: [], totalResult: 0 },
      { items: null, totalResult: 0 },
      { items: [null], totalResult: 1 },
      { items: [] },
      { items: [], totalResult: "invalid" },
    ]) {
      await assert.rejects(fetchItems(mockPage([response])));
    }
    assert.deepEqual(await fetchItems(mockPage([{ items: [], totalResult: 0 }])), []);
  });

  test(`${label}: reads every page regardless of form page and server page size`, async () => {
    const page = mockPage(
      [
        { items: [{ key: "a", kcmc: "A" }], totalResult: "3" },
        { items: [{ key: "b", kcmc: "B" }], totalResult: 3 },
        { items: [{ key: "c", kcmc: "C" }], totalResult: 3 },
      ],
      { "queryModel.currentPage": "9", xnm: "2099", xqm: "3" },
    );
    assert.deepEqual(
      (await fetchItems(page)).map((item) => item.key),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      page.calls.map((body) => body["queryModel.currentPage"]),
      ["1", "2", "3"],
    );
    assert.ok(page.calls.every((body) => body.xnm === "2099"));
  });

  test(`${label}: refuses incomplete, repeated or shifting pagination`, async () => {
    const item = { key: "a", kcmc: "A" };
    for (const second of [
      { items: [], totalResult: 2 },
      { items: [item], totalResult: 2 },
      { items: [{ key: "b", kcmc: "B" }], totalResult: 3 },
    ]) {
      await assert.rejects(fetchItems(mockPage([{ items: [item], totalResult: 2 }, second])));
    }
  });
}

const baseExam = { kch: "course", kcmc: "课程", jxb_id: "class", kssj: "09:00", zwh: "1", cdmc: "A" };
const exams = (items) => fetchExams(mockPage([{ items, totalResult: items.length }]));
const examMap = (items) => new Map(items.map((item) => [item.key, item]));

test("exam time, seat, room and paper changes retain identity", async () => {
  const before = await exams([baseExam]);
  const after = await exams([{ ...baseExam, kssj: "14:00", zwh: "2", cdmc: "B", sjbh: "paper" }]);
  assert.equal(before[0].key, after[0].key);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
  assert.equal(changes.changed[0].oldZwh, "1");
  assert.equal(changes.changed[0].newZwh, "2");
});

test("legacy fallback keys migrate without treating existing exams as new", async () => {
  const before = await exams([baseExam]);
  before[0].key = "09:00-course-class-1";
  const after = await exams([{ ...baseExam, zwh: "2" }]);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
});

test("multiple exam batches for one class stay distinct when reordered or changed", async () => {
  const before = await exams([
    { ...baseExam, ksmc: "期中" },
    { ...baseExam, ksmc: "期末" },
  ]);
  const after = await exams([
    { ...baseExam, ksmc: "期末", zwh: "2" },
    { ...baseExam, ksmc: "期中" },
  ]);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
  assert.equal(changes.changed[0].newKsmc, "期末");
});

test("renamed batch is matched only when remaining identity is unambiguous", async () => {
  const before = await exams([{ ...baseExam, ksmc: "期末" }]);
  const after = await exams([{ ...baseExam, ksmc: "期末更名" }]);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
});

test("upstream IDs distinguish sessions with otherwise identical fields", async () => {
  const before = await exams([
    { ...baseExam, key: "session-a" },
    { ...baseExam, key: "session-b" },
  ]);
  const after = await exams([
    { ...baseExam, key: "session-b", zwh: "2" },
    { ...baseExam, key: "session-a" },
  ]);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
});

test("indistinguishable unkeyed sessions are rejected instead of silently overwriting", async () => {
  await assert.rejects(exams([baseExam, { ...baseExam, zwh: "2" }]));
});

test("legacy records without term metadata match new scoped records", async () => {
  const before = await exams([baseExam]);
  before[0].key = "09:00-course-class-1";
  delete before[0].xnm;
  delete before[0].xqm;
  const after = await fetchExams(
    mockPage([{ items: [{ ...baseExam, zwh: "2" }], totalResult: 1 }], { xnm: "2099", xqm: "3" }),
  );
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
});

test("new terms and new upstream IDs are additions instead of changes", async () => {
  const before = await exams([
    { ...baseExam, xnm: "2098" },
    { ...baseExam, key: "old-session" },
  ]);
  const after = await exams([
    { ...baseExam, xnm: "2099" },
    { ...baseExam, key: "new-session" },
  ]);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 2);
  assert.equal(changes.changed.length, 0);
});

test("migration matches named batches before identifying a renamed batch", async () => {
  const before = await exams([
    { ...baseExam, ksmc: "期中" },
    { ...baseExam, ksmc: "期末" },
  ]);
  before[0].key = "期中-course-class-1";
  before[1].key = "期末-course-class-1";
  const after = await exams([
    { ...baseExam, ksmc: "期末更名", zwh: "2" },
    { ...baseExam, ksmc: "期中" },
  ]);
  const changes = detectExamChanges(examMap(before), after);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.changed.length, 1);
  assert.equal(changes.changed[0].oldKsmc, "期末");
});

test("ambiguous batch renames fail instead of assigning arbitrary history", async () => {
  const before = await exams([
    { ...baseExam, ksmc: "A" },
    { ...baseExam, ksmc: "B" },
  ]);
  const after = await exams([
    { ...baseExam, ksmc: "C" },
    { ...baseExam, ksmc: "D" },
  ]);
  assert.throws(() => detectExamChanges(examMap(before), after), /无法唯一匹配/);
});
