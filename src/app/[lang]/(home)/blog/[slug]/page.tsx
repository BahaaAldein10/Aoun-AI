import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SupportedLang } from "@/lib/dictionaries";
import { getDictionary } from "@/lib/dictionaries";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

const samplePosts = [
  {
    slug: "how-to-build-a-portfolio",
    title: "How to Build a Portfolio as a Developer",
    excerpt:
      "Learn how to showcase your skills and land freelance gigs with a strong portfolio.",
    image: "/images/posts/portfolio.jpg",
    date: "2025-08-01",
    author: {
      name: "John Doe",
      avatar: "",
    },
    content: `<p>In this post, we’ll walk through the steps to build a strong portfolio as a web developer. Start by choosing the right projects, organizing them well, and making sure your code is accessible on platforms like GitHub.</p><p>Highlight your problem-solving skills, explain your decisions, and keep the design clean. Don’t forget to include a short bio, your resume, and contact info!</p>`,
  },
  {
    slug: "nextjs-vs-nuxt",
    title: "Next.js vs Nuxt: Which One Should You Learn?",
    excerpt:
      "A comparison between Next.js and Nuxt.js to help you choose the right framework.",
    image: "/images/posts/next-vs-nuxt.jpg",
    date: "2025-07-20",
    author: {
      name: "Jane Smith",
      avatar: "",
    },
    content: `<p>This post provides a comparison of Next.js and Nuxt.js, two popular frameworks for building web applications. We'll explore their strengths, use cases, and which one might be the better choice for your needs.</p><p>Next.js is known for its server-side rendering capabilities and seamless integration with React, making it a great choice for SEO-focused applications. On the other hand, Nuxt.js, built on top of Vue.js, provides a streamlined experience for creating universal applications with a strong emphasis on simplicity and performance.</p>`,
  },
  {
    slug: "freelance-seo-tips",
    title: "SEO Tips for Freelance Developers",
    excerpt:
      "Boost your personal site ranking with these practical SEO strategies tailored for developers.",
    image: "/images/posts/seo-tips.jpg",
    date: "2025-07-10",
    author: {
      name: "Ahmed Ali",
      avatar: "",
    },
    content: `<p>SEO isn’t just for marketers. Freelance developers can gain a lot by understanding how to optimize their websites.</p><ul><li>Use semantic HTML</li><li>Optimize image sizes</li><li>Add meta tags and Open Graph data</li></ul>`,
  },
];

// Fetch helpers
async function getPostBySlug(slug: string) {
  return samplePosts.find((post) => post.slug === slug) || null;
}

async function getAllPosts() {
  return samplePosts;
}

// Generate static params
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
    lang: "en",
  }));
}

type Props = {
  params: Promise<{ slug: string; lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

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

/*************  ✨ Windsurf Command ⭐  *************/
/**
 * A Next.js page that renders a blog post.
 *
 * This page is statically generated for each blog post. The page is
 * rendered with a header, featured image, and post content. The post
 * content is rendered as HTML, and the page is optimized for SEO.
 *
 * @param {Props} props The props for the page, including the slug and
 * language of the blog post.
 * @returns {JSX.Element} The JSX element for the page.
 */
/*******  f9aa4fe9-b0e6-4ee9-9571-850ea9fc009f  *******/ const BlogPostPage =
  async ({ params }: Props) => {
    const { slug, lang } = await params;
    const post = await getPostBySlug(slug);

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
                      src={post.author.avatar}
                      alt={post.author.name}
                    />
                    <AvatarFallback>
                      {post.author.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{post.author.name}</span>
                </div>
                <span>&bull;</span>
                <time dateTime={post.date}>{post.date}</time>
              </div>
            </header>

            {/* Featured Image */}
            <Image
              src="/images/how-it-works.png"
              alt={post.title}
              width={1200}
              height={630}
              className="mb-8 w-full rounded-xl shadow-lg"
              priority
            />

            {/* Post Content */}
            <div
              className="prose prose-invert prose-lg prose-headings:prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:font-semibold dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </article>
        </div>
      </section>
    );
  };

export default BlogPostPage;
