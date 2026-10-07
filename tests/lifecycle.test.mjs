import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(source) {
  return spawnSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", source], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, GXU_PASSWORD: "fixture-secret", GXU_STUDENT_ID: "fixture-student" },
  });
}

test("failed browser cleanup stops login retries and preserves both errors", () => {
  const result = run(`
    import { chromium } from 'playwright';
    import { login } from './src/auth.ts';
    import { retry } from './src/retry.ts';
    let launches = 0;
    chromium.launch = async () => {
      launches++;
      return {
        newContext: async () => { throw new Error('context failed'); },
        close: async () => { throw new Error('cleanup failed'); }
      };
    };
    try { await retry(() => login('fixture-student', 'fixture-secret'), { delayMs: 1 }); }
    catch (error) { console.log(String(error)); }
    if (launches !== 1) throw new Error('Retried with an unclosed browser');
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cleanup failed/);
  assert.match(result.stdout, /context failed/);
});

test("SIGTERM interrupts retry delay without launching another attempt", () => {
  const result = run(`
    import { retry } from './src/retry.ts';
    import { runTask } from './src/runtime.ts';
    let attempts = 0;
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 100);
    await runTask(() => retry(async () => {
      attempts++;
      throw new Error('failed');
    }, { delayMs: 5000 }));
    if (attempts !== 1) throw new Error('Unexpected retry');
  `);
  assert.equal(result.status, 143, result.stderr);
  assert.match(result.stdout, /reason=SIGTERM/);
});

test("lifecycle logs include failure stage and redact credentials", () => {
  const result = run(`
    import { log } from './src/log.ts';
    import { runTask } from './src/runtime.ts';
    await runTask(async () => {
      log('auth', 'fixture-student');
      throw new Error('fixture-secret');
    });
  `);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /stage=auth/);
  assert.match(result.stdout, /run=/);
  assert.doesNotMatch(result.stdout, /fixture-secret|fixture-student/);
});
