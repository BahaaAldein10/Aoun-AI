"use server";

import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { SupportedLang } from "../dictionaries";
import { SiteContent, SiteContentSchema } from "../schemas/content";

interface GetSiteContentParams {
  lang: SupportedLang;
}
export async function getSiteContent(params: GetSiteContentParams) {
  try {
    const { lang } = params;

    const siteContent = await prisma.siteContent.findFirst({
      where: { lang },
    });

    return siteContent?.content as SiteContent;
  } catch (error) {
    console.error(error);
  }
}

interface SaveSiteContentParams {
  lang: SupportedLang;
  content: SiteContent;
}

export async function saveSiteContent(params: SaveSiteContentParams) {
  try {
    const { lang, content } = params;

    const session = await auth();
    if (!session?.user?.id) throw new Error("Not authenticated");

    const role = session.user.role ?? "USER";
    if (role !== UserRole.ADMIN) throw new Error("Not authorized");

    const parsed = SiteContentSchema.safeParse(content);
    if (!parsed.success)
      throw new Error("Invalid content shape" + z.treeifyError(parsed.error));

    const existingContent = await prisma.siteContent.findFirst({
      where: { lang },
    });

    if (existingContent) {
      await prisma.siteContent.update({
        where: { id: existingContent.id },
        data: { content },
      });
    } else {
      await prisma.siteContent.create({
        data: { lang, content },
      });
    }

    revalidatePath(`/${lang}`);
    revalidatePath(`/${lang}/contact`);
    revalidatePath(`/${lang}/faq`);
  } catch (error) {
    console.error(error);
  }
}
