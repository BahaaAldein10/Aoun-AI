"use server";

import type { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { SupportedLang } from "../dictionaries";
import { prisma } from "../prisma";
import { editUserSchema } from "../schemas/admin";

interface UpdateUserParams {
  email: string;
  role: UserRole;
  minutes: number;
  lang: SupportedLang;
}

export async function updateUser(params: UpdateUserParams) {
  const { email, role, minutes, lang } = params;

  // Auth + authorization
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (session.user.role !== "ADMIN") throw new Error("Not authorized");

  // Validate incoming payload (uses your schema)
  const parsed = editUserSchema.safeParse({ role, minutes });
  if (!parsed.success) {
    // zod validation errors -> throw readable message
    throw new Error("Invalid payload: " + z.treeifyError(parsed.error));
  }

  // Find the target user
  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    throw new Error("User not found");
  }

  // Compute start-of-month (UTC) for monthly usage record
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const startOfNextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );

  try {
    // Transaction: update user role, upsert usage for current month, create audit log
    const result = await prisma.$transaction(async (tx) => {
      // update role (only if different)
      const updatedUser = await tx.user.update({
        where: { email },
        data: { role },
      });

      // find existing usage for the same month (date in [startOfMonth, startOfNextMonth))
      const existingUsage = await tx.usage.findFirst({
        where: {
          userId: updatedUser.id,
          date: {
            gte: startOfMonth,
            lt: startOfNextMonth,
          },
        },
      });

      if (existingUsage) {
        await tx.usage.update({
          where: { id: existingUsage.id },
          data: { minutes: Math.max(0, Math.floor(Number(minutes) || 0)) },
        });
      } else {
        await tx.usage.create({
          data: {
            userId: updatedUser.id,
            date: startOfMonth,
            minutes: Math.max(0, Math.floor(Number(minutes) || 0)),
            interactions: 0,
          },
        });
      }

      return updatedUser;
    });

    revalidatePath(`${lang}/admin/users`);
    return result;
  } catch (err) {
    console.error("updateUser error:", err);
    throw err;
  }
}

export async function deleteUser({
  id,
  lang,
}: {
  id: string;
  lang: SupportedLang;
}) {
  try {
    // Auth + authorization
    const session = await auth();
    if (!session?.user?.id) throw new Error("Not authenticated");
    if (session.user.role !== "ADMIN") throw new Error("Not authorized");

    await prisma.user.delete({ where: { id } });

    revalidatePath(`${lang}/admin/users`);
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function updateAvatar(id: string, avatar: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Not authenticated");

    await prisma.user.update({ where: { id }, data: { image: avatar } });
  } catch (error) {
    console.log(error);
    throw error;
  }
}
