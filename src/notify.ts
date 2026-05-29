import type { GradeItem } from "./fetch.js";

interface ChangeRecord {
  key: string;
  kcmc: string;
  oldBfzcj: string;
  newBfzcj: string;
  oldCjbdsj: string;
  newCjbdsj: string;
}

export function notify(changes: { added: GradeItem[]; changed: ChangeRecord[] }) {
  const { added, changed } = changes;

  if (added.length === 0 && changed.length === 0) {
    console.log("无成绩变动");
    return;
  }

  const lines: string[] = [];

  if (added.length > 0) {
    lines.push(`--- 新成绩 (${added.length} 门) ---`);
    for (const item of added) {
      lines.push(`${item.kcmc}: ${item.bfzcj} (${item.cj}) 绩点:${item.jd} 学分:${item.xf}`);
    }
  }

  if (changed.length > 0) {
    lines.push(`--- 成绩变动 (${changed.length} 门) ---`);
    for (const c of changed) {
      lines.push(`${c.kcmc}: ${c.oldBfzcj} -> ${c.newBfzcj}`);
    }
  }

  const body = lines.join("\n");
  console.log(body);

  // TODO: 通过 nodemailer 发送邮件
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({ subject: "成绩变动通知", text: body });
}
