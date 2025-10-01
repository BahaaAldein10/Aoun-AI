"use server";

import { Dictionary } from "@/contexts/dictionary-context";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import console from "console";
import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { deleteFilesFromFirebase } from "../deleteFilesFromFirebase";
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

    if (files && Array.isArray(files) && files.length > 0) {
      await prisma.uploadedFile.updateMany({
        where: {
          userId,
          url: { in: files },
          kbId: null,
        },
        data: {
          kbId: kb.id,
        },
      });
    }

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

    const files = await prisma.uploadedFile.findMany({
      where: { kbId: existingKb.id },
      select: { meta: true },
    });

    const filesValidation =
      files && Array.isArray(files) && files.length > 0 ? true : false;

    if (filesValidation) {
      const filePaths = files
        .map((f) => (f.meta as { storagePath: string })?.storagePath)
        .filter((p): p is string => Boolean(p)) as string[];

      await deleteFilesFromFirebase(filePaths);
    }

    let deleteTransactions = [];

    if (filesValidation) {
      deleteTransactions = [
        prisma.bot.deleteMany({ where: { knowledgeBaseId: existingKb.id } }),
        prisma.document.deleteMany({ where: { kbId: existingKb.id } }),
        prisma.embedding.deleteMany({ where: { kbId: existingKb.id } }),
        prisma.uploadedFile.deleteMany({ where: { kbId: existingKb.id } }),
        prisma.knowledgeBase.delete({ where: { id: existingKb.id } }),
      ];
    } else {
      deleteTransactions = [
        prisma.bot.deleteMany({ where: { knowledgeBaseId: existingKb.id } }),
        prisma.document.deleteMany({ where: { kbId: existingKb.id } }),
        prisma.embedding.deleteMany({ where: { kbId: existingKb.id } }),
        prisma.knowledgeBase.delete({ where: { id: existingKb.id } }),
      ];
    }

    if (deleteTransactions.length > 0) {
      await prisma.$transaction(deleteTransactions);
    }
  } catch (error) {
    console.error(error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unexpected error occurred while deleting Knowledge Base",
    );
  }
}

export async function deleteUploadedFileUrl(url: string) {
  try {
    const file = await prisma.uploadedFile.findFirstOrThrow({
      where: { url },
      select: { meta: true },
    });

    const fileMeta = file.meta as { storagePath?: string };
    const filePath = fileMeta?.storagePath;

    if (!filePath) {
      throw new Error("File storage path not found in metadata");
    }

    const deletedFile = await deleteFilesFromFirebase([filePath]);
    console.log("Deleted file from Firebase:", filePath);

    return deletedFile;
  } catch (error: unknown) {
    console.error(error);

    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        throw new Error("Failed to delete file from Firebase: File not found");
      }
      throw new Error("Failed to delete file from Firebase: Prisma error");
    }

    if (error instanceof Error) {
      throw new Error(`Failed to delete file from Firebase: ${error.message}`);
    }

    throw new Error("Failed to delete file from Firebase: Unexpected error");
  }
}
