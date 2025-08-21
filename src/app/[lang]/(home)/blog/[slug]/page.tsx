import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getBlogPost, getBlogPosts } from "@/lib/actions/blog";
import type { SupportedLang } from "@/lib/dictionaries";
import { getDictionary } from "@/lib/dictionaries";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string; lang: SupportedLang }>;
};

export const dynamic = "force-static";

export async function generateStaticParams({ params }: Props) {
  const { lang } = await params;

  const posts =
    (await getBlogPosts())?.filter((post) => post.lang === lang) ?? [];
  return posts.map((post) => ({
    slug: encodeURIComponent(post.slug),
    lang: post.lang,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;

  const decodedSlug = decodeURIComponent(slug);
  const post = await getBlogPost({ lang, slug: decodedSlug });

  if (!post) {
    return {
      title: "Post Not Found",
      description: "The blog post you are looking for does not exist.",
    };
  }

  return {
    title: post.title,
    description: post.excerpt,
  };
}

const BlogPostPage = async ({ params }: Props) => {
  const { slug, lang } = await params;

  const decodedSlug = decodeURIComponent(slug);

  const post = await getBlogPost({ slug: decodedSlug, lang });
  if (!post) notFound();

  const dict = await getDictionary(lang);
  const t = dict.blog;

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto max-w-4xl px-4">
        <article>
          {/* Back Link */}
          <div className="mb-8">
            <Link
              href={`/${lang}/blog`}
              className="text-muted-foreground hover:text-primary flex w-fit items-center gap-2 text-sm transition-colors"
            >
              {lang === "ar" ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <ArrowLeft className="h-4 w-4" />
              )}
              {t.back_to_blog}
            </Link>
          </div>

          {/* Header */}
          <header className="mb-8">
            <h1 className="mb-4 text-4xl font-bold md:text-5xl">
              {post.title}
            </h1>
            <div className="text-muted-foreground flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={post.author?.image ?? "/images/avatar.png"}
                    alt={post.author?.name ?? "Unknown Author"}
                  />
                  <AvatarFallback>
                    {(post.author?.name as string).charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span>{post.author?.name}</span>
              </div>
              <span>&bull;</span>
              <time dateTime={post.createdAt}>
                {new Date(post.createdAt as string).toDateString()}
              </time>
            </div>
          </header>

          {/* Featured Image */}
          <Image
            src={post.coverImage || "/images/placeholder.png"}
            alt={post.title as string}
            width={600}
            height={300}
            className="mb-8 aspect-video w-full rounded-xl shadow-lg"
            priority
          />

          {/* Post Content */}
          <div
            className="prose prose-invert prose-lg prose-headings:prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:font-semibold dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content as string }}
          />
        </article>
      </div>
    </section>
  );
};

export default BlogPostPage;
