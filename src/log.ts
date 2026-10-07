import { randomUUID } from "node:crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const threshold = LEVEL_RANK[process.env.LOG_LEVEL?.toLowerCase() as LogLevel] ?? LEVEL_RANK.info;
const runId = process.env.INVOCATION_ID || randomUUID();
let lastStage = "init";

export function getLastStage() {
  return lastStage;
}

export function log(step: string, message: unknown, level: LogLevel = "info") {
  if (!["run", "fail", "cleanup", "done"].includes(step)) lastStage = step;
  if (LEVEL_RANK[level] < threshold) return;
  const now = new Date();
  const ts = new Date(now.getTime() + 8 * 3600000).toISOString().replace("T", " ").substring(0, 19);
  let text = String(message);
  for (const key of ["GXU_STUDENT_ID", "GXU_PASSWORD", "SMTP_USER", "SMTP_PASS", "NOTIFY_EMAIL"]) {
    const secret = process.env[key];
    if (secret) text = text.replaceAll(secret, "[REDACTED]");
  }
  console.log(`[${ts}+08:00] [${level.toUpperCase()}] [run=${runId}] [${step}] ${text}`);
}
