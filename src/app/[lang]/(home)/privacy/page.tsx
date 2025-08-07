import type { SupportedLang } from "@/lib/dictionaries";
import { getLangAndDict } from "@/lib/dictionaries";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.privacy;
  return {
    title: t.title,
    description: t.description,
  };
}

const PrivacyPolicyPage = async ({ params }: Props) => {
  const { dict } = await getLangAndDict(params);
  const t = dict.privacy_page;

  const sections = [
    { title: t.s1_title, content: t.s1_content },
    { title: t.s2_title, content: t.s2_content },
    { title: t.s3_title, content: t.s3_content },
    { title: t.s4_title, content: t.s4_content },
    { title: t.s5_title, content: t.s5_content },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="prose prose-invert dark:prose-invert">
          <h1>{t.title}</h1>
          <p className="text-muted-foreground text-lg">{t.subtitle}</p>
          <p className="text-muted-foreground text-sm">{t.last_updated}</p>

          <div className="mt-12 space-y-10">
            {sections.map((section, index) => (
              <div key={index}>
                <h2>{section.title}</h2>
                <p>{section.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PrivacyPolicyPage;
