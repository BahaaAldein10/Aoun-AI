import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "./sendbrevo";
import { SupportedLang } from "./dictionaries";
import { Dictionary } from "@/contexts/dictionary-context";

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

export function generateResetPasswordEmail(
  userName: string,
  resetUrl: string,
  dict: Dictionary,
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>${dict.auth.reset_password_email_subject}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">${dict.auth.reset_password_email_title}</h1>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>${dict.auth.reset_password_email_greeting} ${userName},</p>
            
            <p>${dict.auth.reset_password_email_message}</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                    ${dict.auth.reset_password_button}
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
                ${dict.auth.reset_password_email_expire_note}
            </p>
            
            <p style="color: #666; font-size: 14px;">
                ${dict.auth.reset_password_email_ignore_note}
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
                ${dict.auth.reset_password_email_footer}
            </p>
        </div>
    </body>
    </html>
  `;
}
