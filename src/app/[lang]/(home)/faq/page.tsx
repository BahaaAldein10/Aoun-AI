import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getSiteContent } from "@/lib/actions/siteContent";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.faq;
  return {
    title: t.title,
    description: t.description,
  };
}

const FAQPage = async ({ params }: Props) => {
  const { lang } = await getLangAndDict(params);

  const content = await getSiteContent({ lang }).then((res) => res?.faq);

  return (
    <section className="bg-secondary py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center rtl:text-right">
          <h1 className="text-4xl font-bold tracking-tighter md:text-5xl">
            {content?.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            {content?.subtitle}
          </p>
        </div>

        <div className="bg-background mx-auto mt-16 max-w-3xl rounded-xl p-8 shadow-lg rtl:text-right">
          <Accordion type="single" collapsible className="w-full">
            {content?.items &&
              content?.items.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left text-lg rtl:text-right">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQPage;
