import nodemailer from "nodemailer";
import type { GradeItem } from "./fetch.js";
import type { EmailConfig } from "./config.js";
import type { ChangeRecord } from "./store.js";

function buildBody(changes: { added: GradeItem[]; changed: ChangeRecord[] }) {
  const { added, changed } = changes;
  const lines: string[] = [];

  if (added.length > 0) {
    lines.push(`新成绩 (${added.length} 门):`);
    for (const item of added) {
      lines.push(`  ${item.kcmc}: ${item.bfzcj} | 学分: ${item.xf} | ${item.ksxz}`);
    }
  }

  if (changed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`成绩变动 (${changed.length} 门):`);
    for (const c of changed) {
      lines.push(`  ${c.kcmc}: ${c.oldBfzcj} -> ${c.newBfzcj}`);
    }
  }

  return lines.join("\n");
}

export async function notify(
  changes: { added: GradeItem[]; changed: ChangeRecord[] },
  emailConfig?: EmailConfig | null,
) {
  const { added, changed } = changes;

  if (added.length === 0 && changed.length === 0) {
    console.log("无成绩变动");
    return;
  }

  const body = buildBody(changes);
  console.log(body);

  if (!emailConfig) return;

  try {
    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.port === 465,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
    });

    const subject = `成绩变动通知: ${added.length > 0 ? `${added.length} 门新成绩` : ""}${added.length > 0 && changed.length > 0 ? ", " : ""}${changed.length > 0 ? `${changed.length} 门变动` : ""}`;

    await transporter.sendMail({
      from: emailConfig.user,
      to: emailConfig.to,
      subject,
      text: body,
    });

    console.log("邮件已发送");
  } catch (err) {
    console.error("邮件发送失败:", String(err));
  }
}
