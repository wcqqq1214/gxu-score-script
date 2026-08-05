type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const threshold = LEVEL_RANK[process.env.LOG_LEVEL?.toLowerCase() as LogLevel] ?? LEVEL_RANK.info;

export function log(step: string, message: unknown, level: LogLevel = "info") {
  if (LEVEL_RANK[level] < threshold) return;
  const now = new Date();
  const ts = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${ts}] [${level.toUpperCase()}] [${step}]`, message);
}
