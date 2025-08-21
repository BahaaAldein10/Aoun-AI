import { BlogPostWithAuthor } from "@/components/admin/BlogsColumns";
import EditBlogClient from "@/components/admin/EditBlogClient";
import { getBlogPost } from "@/lib/actions/blog";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { UserRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ lang: SupportedLang; slug: string }>;
};

export default async function AdminBlogEditPage({ params }: PageProps) {
  const { lang, dict } = await getLangAndDict(params);
  const { slug } = await params;

  const session = await auth();
  if (!session?.user.id || session.user.role !== UserRole.ADMIN)
    return redirect(`/${lang}`);

  const initialPost = (await getBlogPost({ lang, slug })) as BlogPostWithAuthor;
  if (!initialPost) return notFound();

  return <EditBlogClient lang={lang} dict={dict} initialPost={initialPost} />;
}
