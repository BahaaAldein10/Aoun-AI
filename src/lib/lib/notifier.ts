import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "../sendpulse";

export async function notifyUserProcessingDone(
  userId: string,
  kbId: string,
  summary: {
    title?: string;
    pages?: number;
    embeddings?: number;
    link?: string;
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

  const subject = `Your knowledge base "${summary.title ?? kbId}" is ready`;
  const html = `
    <p>Hi ${user.name ?? ""},</p>
    <p>Your knowledge base <strong>${summary.title ?? "Untitled"}</strong> has finished processing.</p>
    <ul>
      <li>Pages processed: ${summary.pages ?? "N/A"}</li>
      <li>Embeddings created: ${summary.embeddings ?? "N/A"}</li>
    </ul>
    ${summary.link ? `<p>Open it: <a href="${summary.link}">${summary.link}</a></p>` : ""}
    <p>Thanks — your friendly bot</p>
  `;

  try {
    await sendTransactionalEmail(
      { email: user.email, name: user.name ?? undefined },
      subject,
      html,
    );
  } catch (err) {
    console.error("Failed to send SendPulse notification:", err);
  }
}
