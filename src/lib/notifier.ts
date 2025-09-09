import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "./sendbrevo";
import { SupportedLang } from "./dictionaries";

export async function notifyUserProcessingDone(
  userId: string,
  kbId: string,
  summary: {
    title?: string;
    pages?: number;
    embeddings?: number;
    link?: string;
    language?: SupportedLang;
  },
) {
  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user?.email) {
    console.warn("notifyUserProcessingDone: user has no email", userId);
    return;
  }

  // Pick language (default to English if none provided)
  const lang = summary.language ?? "en";

  let subject: string;
  let html: string;

  if (lang === "ar") {
    subject = `قاعدة المعرفة "${summary.title ?? kbId}" جاهزة الآن`;
    html = `
      <p>مرحبًا ${user.name ?? ""},</p>
      <p>قاعدة المعرفة <strong>${summary.title ?? "بدون عنوان"}</strong> تم الانتهاء من معالجتها.</p>
      <ul>
        <li>عدد الصفحات المعالجة: ${summary.pages ?? "غير متاح"}</li>
        <li>عدد المتجهات المنشأة: ${summary.embeddings ?? "غير متاح"}</li>
      </ul>
      ${summary.link ? `<p>افتحها من هنا: <a href="${summary.link}">${summary.link}</a></p>` : ""}
      <p>شكرًا — بوتك المساعد</p>
    `;
  } else {
    subject = `Your knowledge base "${summary.title ?? kbId}" is ready`;
    html = `
      <p>Hi ${user.name ?? ""},</p>
      <p>Your knowledge base <strong>${summary.title ?? "Untitled"}</strong> has finished processing.</p>
      <ul>
        <li>Pages processed: ${summary.pages ?? "N/A"}</li>
        <li>Embeddings created: ${summary.embeddings ?? "N/A"}</li>
      </ul>
      ${summary.link ? `<p>Open it: <a href="${summary.link}">${summary.link}</a></p>` : ""}
      <p>Thanks — your friendly bot</p>
    `;
  }

  try {
    await sendTransactionalEmail(
      { email: user.email, name: user.name ?? undefined },
      subject,
      html,
    );
  } catch (err) {
    console.error("Failed to send Brevo notification:", err);
  }
}
