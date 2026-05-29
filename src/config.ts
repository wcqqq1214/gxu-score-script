const REQUIRED = ["GXU_STUDENT_ID", "GXU_PASSWORD"] as const;

export function loadConfig() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`缺少环境变量: ${missing.join(", ")}`);
  }
  return {
    studentId: process.env.GXU_STUDENT_ID!,
    password: process.env.GXU_PASSWORD!,
  };
}
