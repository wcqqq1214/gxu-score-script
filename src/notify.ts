import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import type { ExamItem } from "./exam.js";
import type { GradeItem } from "./fetch.js";
import type { EmailConfig } from "./config.js";
import type { ChangeRecord, ExamChangeRecord } from "./store.js";

type GradeChanges = { added: GradeItem[]; changed: ChangeRecord[] };
type ExamChanges = { added: ExamItem[]; changed: ExamChangeRecord[] };

const EMPTY_EXAM_CHANGES: ExamChanges = { added: [], changed: [] };

function examCampus(item: Pick<ExamItem, "cdxqmc" | "xqmc">) {
  return item.cdxqmc || item.xqmc;
}

function examLocation(item: Pick<ExamItem, "cdxqmc" | "xqmc" | "cdmc">) {
  return [examCampus(item), item.cdmc].filter(Boolean).join(" ");
}

function formatExam(item: ExamItem) {
  const details = [item.kssj || "时间未公布", examLocation(item) || "地点未公布"];
  if (item.zwh) details.push(`座号: ${item.zwh}`);
  if (item.ksfs) details.push(item.ksfs);
  if (item.ksmc) details.push(item.ksmc);
  return `${item.kcmc}: ${details.join(" | ")}`;
}

function changedField(label: string, oldValue: string, newValue: string) {
  return oldValue === newValue ? "" : `${label}: ${oldValue || "空"} -> ${newValue || "空"}`;
}

function formatExamChange(change: ExamChangeRecord) {
  const campus = changedField("校区", change.oldCdxqmc || change.oldXqmc, change.newCdxqmc || change.newXqmc);
  const details = [
    changedField("时间", change.oldKssj, change.newKssj),
    changedField("地点", change.oldCdmc, change.newCdmc),
    campus,
    changedField("座号", change.oldZwh, change.newZwh),
    changedField("方式", change.oldKsfs, change.newKsfs),
    changedField("试卷", change.oldSjbh, change.newSjbh),
    changedField("考试", change.oldKsmc, change.newKsmc),
    changedField("备注", change.oldBz1, change.newBz1),
  ].filter(Boolean);

  return `${change.kcmc}: ${details.join(" | ")}`;
}

function buildBody(gradeChanges: GradeChanges, examChanges: ExamChanges) {
  const lines: string[] = [];

  if (gradeChanges.added.length > 0) {
    lines.push(`新成绩 (${gradeChanges.added.length} 门):`);
    for (const item of gradeChanges.added) {
      lines.push(`  ${item.kcmc}: ${item.bfzcj} | 学分: ${item.xf} | ${item.ksxz}`);
    }
  }

  if (gradeChanges.changed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`成绩变动 (${gradeChanges.changed.length} 门):`);
    for (const c of gradeChanges.changed) {
      lines.push(`  ${c.kcmc}: ${c.oldBfzcj} -> ${c.newBfzcj}`);
    }
  }

  if (examChanges.added.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`新考试安排 (${examChanges.added.length} 门):`);
    for (const item of examChanges.added) {
      lines.push(`  ${formatExam(item)}`);
    }
  }

  if (examChanges.changed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`考试安排变动 (${examChanges.changed.length} 门):`);
    for (const c of examChanges.changed) {
      lines.push(`  ${formatExamChange(c)}`);
    }
  }

  return lines.join("\n");
}

function buildSubject(gradeChanges: GradeChanges, examChanges: ExamChanges) {
  const parts: string[] = [];

  if (gradeChanges.added.length > 0) parts.push(`${gradeChanges.added.length} 门新成绩`);
  if (gradeChanges.changed.length > 0) parts.push(`${gradeChanges.changed.length} 门成绩变动`);
  if (examChanges.added.length > 0) parts.push(`${examChanges.added.length} 门新考试`);
  if (examChanges.changed.length > 0) parts.push(`${examChanges.changed.length} 门考试变动`);

  return `教务变动通知: ${parts.join(", ")}`;
}

async function resolveIpv4(host: string) {
  const result = await lookup(host, { family: 4 });
  return result.address;
}

export async function notify(
  gradeChanges: GradeChanges,
  emailConfig?: EmailConfig | null,
  examChanges: ExamChanges = EMPTY_EXAM_CHANGES,
) {
  const hasGradeChanges = gradeChanges.added.length > 0 || gradeChanges.changed.length > 0;
  const hasExamChanges = examChanges.added.length > 0 || examChanges.changed.length > 0;

  if (!hasGradeChanges && !hasExamChanges) {
    console.log("无成绩或考试变动");
    return;
  }

  const body = buildBody(gradeChanges, examChanges);
  console.log(body);

  if (!emailConfig) return;

  try {
    const smtpHost = await resolveIpv4(emailConfig.host);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: emailConfig.port,
      secure: emailConfig.port === 465,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
      tls: {
        servername: emailConfig.host,
      },
    });

    const subject = buildSubject(gradeChanges, examChanges);

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
