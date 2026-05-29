export function log(step: string, ...args: unknown[]) {
  const now = new Date();
  const ts = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${ts}] [${step}]`, ...args);
}
