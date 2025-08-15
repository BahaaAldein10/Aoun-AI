"use server";

import { Dictionary } from "@/contexts/dictionary-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
    if (!session) {
      return redirect(`${lang}/auth/login`);
    }

    const file = await prisma.uploadedFile.create({
      data: {
        userId: session.user.id,
        url: fileUrl,
        filename: fileName,
        fileType: fileType ?? null,
        size: fileSize,
        meta: {},
      },
    });

    return { success: true, file };
  } catch (error) {
    console.error("[SAVE_FILE_ERROR]", error);
    return { success: false };
  }
}
