const REQUIRED = ["GXU_STUDENT_ID", "GXU_PASSWORD"] as const;

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  to: string;
}

export function loadConfig() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`缺少环境变量: ${missing.join(", ")}`);
  }

  const email: EmailConfig | null = process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
        to: process.env.NOTIFY_EMAIL || "",
      }
    : null;

  return {
    studentId: process.env.GXU_STUDENT_ID!,
    password: process.env.GXU_PASSWORD!,
    email,
  };
}
