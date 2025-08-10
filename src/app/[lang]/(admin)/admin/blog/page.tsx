import BlogsClient from "@/components/admin/BlogsClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type PostRow = {
  id: string;
  title: string;
  slug: string;
  status: "published" | "draft";
  authorName?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const AdminBlogPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const posts: PostRow[] = [
    {
      id: "POST-001",
      title: "How our AI improves customer support",
      slug: "ai-customer-support",
      status: "published",
      authorName: "John Doe",
      createdAt: new Date("2024-01-15T08:00:00Z"),
      updatedAt: new Date("2024-02-01T08:00:00Z"),
    },
    {
      id: "POST-002",
      title: "Introducing voice cloning for agents",
      slug: "voice-cloning",
      status: "draft",
      authorName: "Jane Smith",
      createdAt: new Date("2024-03-05T10:00:00Z"),
      updatedAt: new Date("2024-03-06T11:00:00Z"),
    },
    {
      id: "POST-003",
      title: "Best practices to capture leads with bots",
      slug: "lead-capture-best-practices",
      status: "published",
      authorName: "Admin",
      createdAt: new Date("2024-04-20T12:00:00Z"),
      updatedAt: new Date("2024-04-22T12:00:00Z"),
    },
  ];

  return <BlogsClient initialPosts={posts} lang={lang} dict={dict} />;
};

export default AdminBlogPage;
