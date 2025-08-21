"use server";

import { revalidatePath } from "next/cache";
import z from "zod";
import { auth } from "../auth";
import { SupportedLang } from "../dictionaries";
import { prisma } from "../prisma";
import { BlogPostSchema, BlogPostValues } from "../schemas/blog";

export async function getBlogPosts() {
  try {
    const posts = await prisma.blogPost.findMany({
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true, image: true } } },
    });

    return posts.map((post) => ({
      ...post,
      createdAt: post?.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error(error);
  }
}

export async function getBlogPost({
  slug,
  lang,
}: {
  slug: string;
  lang: SupportedLang;
}) {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { slug, lang },
      include: { author: { select: { id: true, name: true, image: true } } },
    });

    return {
      ...post,
      createdAt: post?.createdAt.toISOString(),
    };
  } catch (error) {
    console.error(error);
  }
}

export async function createBlogPost(params: {
  post: BlogPostValues;
  lang: SupportedLang;
}) {
  try {
    const { post, lang } = params;

    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");

    const role = session.user.role ?? "USER";
    if (role !== "ADMIN") throw new Error("Not authorized");

    const parsed = BlogPostSchema.safeParse(post);
    if (!parsed.success)
      throw new Error("Invalid post shape" + z.treeifyError(parsed.error));

    await prisma.blogPost.create({
      data: {
        ...post,
        lang,
        authorId: session.user.id,
      },
    });

    revalidatePath(`/${lang}/blog`);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function updateBlogPost(params: {
  postId: string;
  post: BlogPostValues;
  lang: SupportedLang;
}) {
  try {
    const { postId, post, lang } = params;

    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");

    const role = session.user.role ?? "USER";
    if (role !== "ADMIN") throw new Error("Not authorized");

    const parsed = BlogPostSchema.safeParse(post);
    if (!parsed.success)
      throw new Error("Invalid post shape" + z.treeifyError(parsed.error));

    const existingPost = await prisma.blogPost.findFirst({
      where: {
        slug: post.slug,
        lang,
        id: { not: postId },
      },
    });

    if (existingPost) {
      throw new Error("Slug already exists for another post");
    }

    await prisma.blogPost.update({
      where: { id: postId },
      data: { ...post },
    });

    revalidatePath(`/${lang}/blog`);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function deleteBlogPost({
  id,
  lang,
}: {
  id: string;
  lang: SupportedLang;
}) {
  try {
    const session = await auth();
    if (!session?.user.id) throw new Error("Not authenticated");

    const role = session.user.role ?? "USER";
    if (role !== "ADMIN") throw new Error("Not authorized");

    await prisma.blogPost.delete({ where: { id } });
    revalidatePath(`/${lang}/blog`);
    revalidatePath(`/${lang}/admin/blog`);
  } catch (error) {
    console.error(error);
  }
}
