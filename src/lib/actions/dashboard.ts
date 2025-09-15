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
};

export async function saveFileToDB({
  fileUrl,
  fileName,
  fileType,
  fileSize,
}: SaveFileParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    const file = await prisma.uploadedFile.create({
      data: {
        userId: session.user.id,
        url: fileUrl,
        filename: fileName,
        fileType: fileType ?? null,
        size: fileSize,
      },
    });

    return { success: true, file };
  } catch (error) {
    console.error("[SAVE_FILE_ERROR]", error);
    return { success: false };
  }
}

interface CreateKbParams {
  title: string;
  description?: string;
  personality?: string;
  voice: string;
  primaryColor: string;
  accentColor: string;
  faq?: { question: string; answer: string }[];
  url: string | null;
  files?: string[];
  allowedOrigins: string[];
  language: SupportedLang;
}

export async function createKb(params: CreateKbParams) {
  const {
    title,
    description,
    personality,
    voice,
    primaryColor,
    accentColor,
    faq,
    url,
    files,
    allowedOrigins,
    language,
  } = params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  try {
    const bot = await prisma.bot.create({
      data: {
        name: title,
        userId,
        description,
        status: "DEPLOYED",
        knowledgeBases: {
          create: {
            title,
            description,
            userId,
            metadata: {
              personality,
              voice,
              primaryColor,
              accentColor,
              faq,
              url,
              files,
              allowedOrigins,
              language,
            },
          },
        },
      },
      include: {
        knowledgeBases: true,
      },
    });

    const kb = bot.knowledgeBases[0];
    return { bot, kb };
  } catch (error) {
    console.log(error);
    throw new Error("Failed to create Knowledge Base");
  }
}

export async function updateKb(params: CreateKbParams) {
  const {
    title,
    description,
    personality,
    voice,
    primaryColor,
    accentColor,
    faq,
    url,
    files,
    allowedOrigins,
    language,
  } = params;

  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const existingKb = await prisma.knowledgeBase.findFirst({
      where: { userId },
    });
    if (!existingKb) throw new Error("Knowledge Base not found");

    const [kb, bot] = await prisma.$transaction([
      prisma.knowledgeBase.update({
        where: { id: existingKb.id, userId },
        data: {
          title,
          description,
          metadata: {
            ...(existingKb.metadata as object),
            personality,
            voice,
            primaryColor,
            accentColor,
            faq,
            url,
            files,
            allowedOrigins,
            language,
          },
        },
      }),
      prisma.bot.update({
        where: { id: existingKb.botId! },
        data: {
          ...(title && { name: title }),
          ...(description && { description }),
        },
      }),
    ]);

    return { kb, bot };
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error("Unexpected error occurred while updating Knowledge Base");
  }
}

export async function deleteKb(kbId: string) {
  try {
    const existingKb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
    });
    if (!existingKb) throw new Error("Knowledge Base not found");

    await prisma.knowledgeBase.delete({
      where: {
        id: existingKb.id,
      },
    });
  } catch (error) {
    console.log(error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error("Unexpected error occurred while deleting Knowledge Base");
  }
}
