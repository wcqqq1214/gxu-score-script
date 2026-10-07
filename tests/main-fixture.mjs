import { chromium } from "playwright";
import nodemailer from "nodemailer";

const [directory, mode] = process.argv.slice(2);
if (!directory || !mode) throw new Error("fixture requires a temporary directory and mode");
process.chdir(directory);
process.env.GXU_STUDENT_ID = "fixture-student";
process.env.GXU_PASSWORD = "fixture-password";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "fixture@example.invalid";
process.env.SMTP_PASS = "fixture-smtp-password";
process.env.NOTIFY_EMAIL = "recipient@example.invalid";
if (mode === "console") delete process.env.SMTP_HOST;

nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    if (mode === "smtp-fail") throw new Error("fixture SMTP failure");
    console.log(`FIXTURE_SENT=${JSON.stringify(mail.text)}`);
  },
});

const page = {
  goto: async () => {},
  waitForTimeout: async () => {},
  url: () => "https://fixture.invalid/home",
  locator: () => ({ fill: async () => {}, count: async () => 1, first: () => ({ click: async () => {} }) }),
  evaluate: async (_callback, args) => {
    if (!args) return { xnm: "2099", xqm: "3" };
    const grade = args.url.includes("cjcx");
    if (mode === (grade ? "invalid-grade" : "invalid-exam")) return { success: false };
    if (mode === "empty") return { items: [], totalResult: 0 };
    const item = grade
      ? { key: "grade", kcmc: "课程", bfzcj: "90", cjbdsj: "new" }
      : { key: "exam", kcmc: "课程", kssj: "14:00", zwh: "2" };
    if (mode === "incomplete" && grade) {
      return { items: args.body["queryModel.currentPage"] === "1" ? [item] : [], totalResult: 2 };
    }
    return { items: [item], totalResult: 1 };
  },
};
chromium.launch = async () => ({
  newContext: async () => ({ setDefaultTimeout: () => {}, newPage: async () => page }),
  close: async () => console.log("FIXTURE_BROWSER_CLOSED"),
});
await import("../src/main.ts");
