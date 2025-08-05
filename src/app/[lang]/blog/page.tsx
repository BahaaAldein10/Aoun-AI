import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const posts = [
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
  },
];

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.blog;
  return {
    title: t.title,
    description: t.description,
  };
}

const BlogPage = async ({ params }: Props) => {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.blog;

  const [featuredPost, ...otherPosts] = posts;

  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container">
        {posts.length > 0 ? (
          <>
            {/* Page Heading */}
            <div className="mx-auto mb-16 max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                {t.title}
              </h1>
              <p className="text-muted-foreground mt-4 text-lg">{t.subtitle}</p>
            </div>

            {/* Featured Post */}
            {featuredPost && (
              <Link
                href={`/${lang}/blog/${featuredPost.slug}`}
                className="group mb-16 block"
              >
                <Card className="grid overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl md:grid-cols-2">
                  <div className="relative h-64 md:h-auto">
                    <Image
                      src="/images/how-it-works.png"
                      alt={featuredPost.title}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-col justify-center p-6 md:p-8 rtl:text-right">
                    <p className="text-primary mb-2 text-sm font-semibold">
                      {t.featured_post}
                    </p>
                    <h2 className="group-hover:text-primary mb-4 text-3xl font-bold transition-colors">
                      {featuredPost.title}
                    </h2>
                    <p className="text-muted-foreground mb-6">
                      {featuredPost.excerpt}
                    </p>
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage
                          src={featuredPost.author.avatar}
                          alt={featuredPost.author.name}
                        />
                        <AvatarFallback>
                          {featuredPost.author.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">
                          {featuredPost.author.name}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {featuredPost.date}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            )}

            {/* Grid of Posts */}
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {otherPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/${lang}/blog/${post.slug}`}
                  className="group block"
                >
                  <Card className="flex h-full flex-col overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl">
                    <div className="relative h-48">
                      <Image
                        src="/images/how-it-works.png"
                        alt={post.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                    <CardHeader className="flex-grow rtl:text-right">
                      <CardTitle className="group-hover:text-primary text-xl font-bold transition-colors">
                        {post.title}
                      </CardTitle>
                      <CardDescription>{post.excerpt}</CardDescription>
                    </CardHeader>
                    <CardFooter className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={post.author.avatar}
                            alt={post.author.name}
                          />
                          <AvatarFallback>
                            {post.author.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold">
                            {post.author.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {post.date}
                          </p>
                        </div>
                      </div>
                      <div className="text-primary flex items-center text-sm font-semibold">
                        {t.read_more}
                        {lang === "ar" ? (
                          <ArrowLeft className="ml-1 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                        ) : (
                          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="py-12 text-center">
            <Image
              src="/images/empty-state.svg"
              alt="No posts"
              width={200}
              height={200}
              className="mx-auto mb-6"
            />
            <h2 className="mb-2 text-2xl font-semibold">{t.no_posts_title}</h2>
            <p className="text-muted-foreground">{t.no_posts_description}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default BlogPage;
