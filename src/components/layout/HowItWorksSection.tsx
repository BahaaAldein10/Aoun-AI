import { cn } from "@/lib/utils";
import { CheckCircle } from "lucide-react";
import Image from "next/image";

const HowItWorksSection = ({
  t,
  lang,
}: {
  t: {
    howItWorksTitle: string;
    steps: {
      title: string;
      text: string;
    }[];
  };
  lang: string;
}) => {
  return (
    <section id="how-it-works" className="bg-secondary py-12 md:py-16">
      <div className="container grid items-center gap-16 md:grid-cols-2">
        <div className={cn(lang === "ar" && "md:order-first")}>
          <Image
            src="/images/how-it-works.png"
            width={600}
            height={400}
            alt="How Aoun works"
          />
        </div>
        <div className="space-y-8 rtl:text-right">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t.howItWorksTitle}
          </h2>
          {t.steps.map((step, index) => (
            <div key={index} className="flex space-x-4 rtl:space-x-reverse">
              <CheckCircle className="mt-1 h-8 w-8 shrink-0 text-red-600" />
              <div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-muted-foreground mt-1">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
