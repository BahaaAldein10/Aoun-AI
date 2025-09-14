"use server";

import { UserRole } from "@prisma/client";
import console from "console";
import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { SupportedLang } from "../dictionaries";
import { prisma } from "../prisma";
import { PlanFormValues, planSchema } from "../schemas/plan";

export async function createPlan(params: {
  data: PlanFormValues;
  lang: SupportedLang;
}) {
  try {
    const { data, lang } = params;

    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");
    if (session.user.role !== UserRole.ADMIN) throw new Error("Not authorized");

    const parsed = planSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid plan shape: " + z.treeifyError(parsed.error));
    }

    const existingPlan = await prisma.plan.findUnique({
      where: {
        name: data.name,
      },
    });

    if (existingPlan) {
      throw new Error(`Plan ${data.name} already exists for language ${lang}`);
    }

    const plan = await prisma.plan.create({
      data: {
        ...data,
      },
    });

    revalidatePath(`/${lang}/admin/pricing`);
    revalidatePath(`/${lang}/pricing`);
    return plan;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function updatePlan(params: {
  id: string;
  data: PlanFormValues;
  lang: SupportedLang;
}) {
  try {
    const { id, data, lang } = params;

    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");
    if (session.user.role !== UserRole.ADMIN) throw new Error("Not authorized");

    const parsed = planSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid plan shape: " + z.treeifyError(parsed.error));
    }

    const currentPlan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!currentPlan) {
      throw new Error("Plan not found");
    }

    const plan = await prisma.plan.update({
      where: { id },
      data,
    });

    revalidatePath(`/${lang}/admin/pricing`);
    revalidatePath(`/${lang}/pricing`);
    return plan;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function togglePlanPopular(id: string, lang: SupportedLang) {
  try {
    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");
    if (session.user.role !== UserRole.ADMIN) throw new Error("Not authorized");

    const plan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new Error("Plan not found");
    }

    const updatedPlan = await prisma.plan.update({
      where: { id },
      data: { popular: !plan.popular },
    });

    revalidatePath(`/${lang}/admin/pricing`);
    return updatedPlan;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function deletePlan(id: string, lang: SupportedLang) {
  try {
    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");
    if (session.user.role !== UserRole.ADMIN) throw new Error("Not authorized");

    await prisma.plan.delete({ where: { id } });

    revalidatePath(`/${lang}/admin/pricing`);
  } catch (error) {
    console.log(error);
    throw error;
  }
}
