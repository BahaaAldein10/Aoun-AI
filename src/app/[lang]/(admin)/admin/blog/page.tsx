import BlogsClient from "@/components/admin/BlogsClient";
import { getBlogPosts } from "@/lib/actions/blog";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type PageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const AdminBlogPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const posts = (await getBlogPosts()) ?? [];

  return <BlogsClient initialPosts={posts} lang={lang} dict={dict} />;
};

export default AdminBlogPage;
