"use server";

import { Dictionary } from "@/contexts/dictionary-context";
import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { SupportedLang } from "../dictionaries";
import { prisma } from "../prisma";
import { settingsSchema } from "../schemas/dashboard";
import { canCreateMoreAgents } from "./agent";

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

  const canCreateMore = await canCreateMoreAgents();
  if (!canCreateMore) throw new Error("Limit reached");

  try {
    const kb = await prisma.knowledgeBase.create({
      data: {
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
    });

    const bot = await prisma.bot.create({
      data: {
        name: title,
        userId,
        description,
        status: "DEPLOYED",
        knowledgeBaseId: kb.id,
      },
    });

    const updatedKb = await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: {
        bot: { connect: { id: bot.id } },
      },
    });

    return { bot, kb: updatedKb };
  } catch (error) {
    console.error(error);
    throw new Error("Failed to create Knowledge Base");
  }
}

export async function updateKb(botId: string, params: CreateKbParams) {
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

    const bot = await prisma.bot.findUnique({
      where: { id: botId, userId },
      include: { knowledgeBase: true },
    });

    if (!bot || !bot.knowledgeBase) {
      throw new Error("Bot or Knowledge Base not found");
    }

    // Update both in a transaction
    const [updatedKb, updatedBot] = await prisma.$transaction([
      prisma.knowledgeBase.update({
        where: { id: bot.knowledgeBase.id },
        data: {
          title,
          description,
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
      }),
      prisma.bot.update({
        where: { id: bot.id },
        data: {
          ...(title && { name: title }),
          ...(description && { description }),
        },
      }),
    ]);

    return { kb: updatedKb, bot: updatedBot };
  } catch (error) {
    console.error(error);
    throw new Error("Failed to update Knowledge Base");
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
