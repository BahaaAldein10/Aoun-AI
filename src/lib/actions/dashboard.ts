"use server";

import { Dictionary } from "@/contexts/dictionary-context";
import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { SupportedLang } from "../dictionaries";
import { prisma } from "../prisma";
import { settingsSchema } from "../schemas/dashboard";

interface UpdateSettingsNameParams {
  userId: string;
  name: string;
  lang: SupportedLang;
  dict: Dictionary;
}

export async function updateSettingsName(params: UpdateSettingsNameParams) {
  try {
    const { name, lang, userId, dict } = params;

    const parsed = settingsSchema(dict).safeParse({ name });
    if (!parsed.success) {
      return { success: false, errors: z.flattenError(parsed.error) };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });

    revalidatePath(`/${lang}/dashboard/settings`);

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error) {
    console.error("[UPDATE_USERNAME_ERROR]", error);
    return { success: false };
  }
}

type SaveFileParams = {
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number;
  lang: SupportedLang;
};

export async function saveFileToDB({
  fileUrl,
  fileName,
  fileType,
  fileSize,
  lang,
}: SaveFileParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    // Create uploadedFile with ingestStatus = 'pending'
    const initialMeta = { lang, ingestStatus: "pending" };
    const file = await prisma.uploadedFile.create({
      data: {
        userId: session.user.id,
        url: fileUrl,
        filename: fileName,
        fileType: fileType ?? null,
        size: fileSize,
        meta: initialMeta,
      },
    });

    // Trigger ingest server-side (server action). We'll call our own /api/ingest route.
    try {
      // Use absolute URL when calling internal API from server runtime (safer)
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const res = await fetch(`${base}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedFileId: file.id }),
      });

      if (!res.ok) {
        // read text for better error info
        const errText = await res.text().catch(() => null);
        await prisma.uploadedFile.update({
          where: { id: file.id },
          data: {
            meta: {
              ...((file.meta as object) ?? {}),
              ingestStatus: "failed",
              ingestError: errText ?? `status:${res.status}`,
            },
          },
        });
      } else {
        // queued successfully
        const body = await res.json().catch(() => ({}));
        await prisma.uploadedFile.update({
          where: { id: file.id },
          data: {
            meta: {
              ...((file.meta as object) ?? {}),
              ingestStatus: "queued",
              queuedAt: new Date().toISOString(),
              kbId: body.kbId ?? null,
            },
          },
        });
      }
    } catch (e) {
      console.error("Failed calling /api/ingest:", e);
      await prisma.uploadedFile.update({
        where: { id: file.id },
        data: {
          meta: {
            ...((file.meta as object) ?? {}),
            ingestStatus: "failed",
            ingestError: String((e as Error)?.message ?? e),
          },
        },
      });
    }

    return { success: true, file };
  } catch (error) {
    console.error("[SAVE_FILE_ERROR]", error);
    return { success: false };
  }
}
