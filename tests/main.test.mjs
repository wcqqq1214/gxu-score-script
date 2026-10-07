import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const gradeBaseline = JSON.stringify([{ key: "grade", kcmc: "课程", bfzcj: "80", cjbdsj: "old" }]);
const examBaseline = JSON.stringify([{ key: "exam", kcmc: "课程", kssj: "09:00", zwh: "1" }]);
function fixture(t, seed = true) {
  const directory = mkdtempSync(join(tmpdir(), "gxu-main-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "data"));
  if (seed) {
    writeFileSync(join(directory, "data/grades.json"), gradeBaseline);
    writeFileSync(join(directory, "data/exams.json"), examBaseline);
  }
  return {
    read: (name) => readFileSync(join(directory, `data/${name}.json`), "utf8"),
    run: (mode) => {
      const result = spawnSync(process.execPath, ["--import", "tsx/esm", "tests/main-fixture.mjs", directory, mode], {
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(result.signal, null, result.stderr);
      assert.match(result.stdout, /FIXTURE_BROWSER_CLOSED/);
      return result;
    },
  };
}

test("SMTP failure preserves both baselines; next successful run delivers the changes", (t) => {
  const f = fixture(t);
  const failed = f.run("smtp-fail");
  assert.equal(failed.status, 1, failed.stdout);
  assert.equal(f.read("grades"), gradeBaseline);
  assert.equal(f.read("exams"), examBaseline);
  const recovered = f.run("success");
  assert.equal(recovered.status, 0, recovered.stdout);
  assert.match(recovered.stdout, /FIXTURE_SENT=.*成绩变动.*考试安排变动/);
  assert.equal(JSON.parse(f.read("grades"))[0].bfzcj, "90");
  assert.equal(JSON.parse(f.read("exams"))[0].kssj, "14:00");
  assert.doesNotMatch(f.run("success").stdout, /FIXTURE_SENT=/);
});

for (const mode of ["invalid-grade", "incomplete"]) {
  test(`${mode}: failed retries do not overwrite either baseline`, (t) => {
    const f = fixture(t);
    const result = f.run(mode);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(f.read("grades"), gradeBaseline);
    assert.equal(f.read("exams"), examBaseline);
    assert.doesNotMatch(result.stdout, /FIXTURE_SENT=/);
  });
}

test("invalid exam response preserves exam history while grade monitoring continues", (t) => {
  const f = fixture(t);
  const result = f.run("invalid-exam");
  assert.equal(result.status, 0, result.stdout);
  assert.equal(f.read("exams"), examBaseline);
  assert.equal(JSON.parse(f.read("grades"))[0].bfzcj, "90");
});

test("legitimate empty lists can replace old baselines", (t) => {
  const f = fixture(t);
  assert.equal(f.run("empty").status, 0);
  assert.deepEqual(JSON.parse(f.read("grades")), []);
  assert.deepEqual(JSON.parse(f.read("exams")), []);
});

test("first run and console-only mode still save without sending mail", (t) => {
  const first = fixture(t, false);
  const firstResult = first.run("smtp-fail");
  assert.equal(firstResult.status, 0, firstResult.stdout);
  assert.equal(JSON.parse(first.read("grades")).length, 1);
  const existing = fixture(t);
  const consoleResult = existing.run("console");
  assert.equal(consoleResult.status, 0, consoleResult.stdout);
  assert.doesNotMatch(consoleResult.stdout, /FIXTURE_SENT=/);
  assert.equal(JSON.parse(existing.read("grades"))[0].bfzcj, "90");
});
