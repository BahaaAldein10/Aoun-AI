import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { Star } from "lucide-react";
import { Card } from "../ui/card";

const TestimonialsSection = ({
  t,
}: {
  t: {
    testimonialsPill: string;
    testimonialsTitle: string;
    testimonialsSubtitle: string;
    testimonial1Name: string;
    testimonial1Title: string;
    testimonial1Text: string;
    testimonial1Avatar: string;
    testimonial2Name: string;
    testimonial2Title: string;
    testimonial2Text: string;
    testimonial2Avatar: string;
    testimonial3Name: string;
    testimonial3Title: string;
    testimonial3Text: string;
    testimonial3Avatar: string;
  };
}) => {
  const testimonials = [
    {
      name: t.testimonial1Name,
      title: t.testimonial1Title,
      text: t.testimonial1Text,
      avatar: t.testimonial1Avatar,
    },
    {
      name: t.testimonial2Name,
      title: t.testimonial2Title,
      text: t.testimonial2Text,
      avatar: t.testimonial2Avatar,
    },
    {
      name: t.testimonial3Name,
      title: t.testimonial3Title,
      text: t.testimonial3Text,
      avatar: t.testimonial3Avatar,
    },
  ];
  return (
    <section className="bg-background py-12 md:py-16">
      <div className="container text-center">
        <div className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1 text-sm font-bold">
          {t.testimonialsPill}
        </div>
        <h2 className="text-3xl font-bold max-sm:text-balance md:text-4xl">
          {t.testimonialsTitle}
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl">
          {t.testimonialsSubtitle}
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3 ltr:text-left">
          {testimonials.map((testimonial, i) => (
            <Card
              key={i}
              className="bg-secondary gap-0 p-6 transition hover:-translate-y-2"
            >
              <div className="flex items-center gap-4 rtl:text-right">
                <Avatar>
                  <AvatarImage
                    src="/images/avatar.png"
                    alt="Avatar"
                    width={32}
                    height={32}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                    {testimonial.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="rtl:text-right">
                  <p className="font-bold">{testimonial.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {testimonial.title}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex rtl:text-right">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star
                    key={j}
                    className="h-5 w-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>

              <p className="text-muted-foreground mt-4 rtl:text-right">
                &quot;{testimonial.text}&quot;
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
