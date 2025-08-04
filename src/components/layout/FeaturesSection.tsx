import { CalendarClock, Filter, PhoneCall, Users } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../ui/card";

const FeaturesSection = ({
  t,
}: {
  t: {
    feature1Title: string;
    feature2Title: string;
    feature3Title: string;
    feature4Title: string;
    featuresTitle: string;
    featuresSubtitle: string;
  };
}) => {
  const features = [
    {
      title: t.feature1Title,
      icon: <PhoneCall className="text-primary h-8 w-8" />,
    },
    {
      title: t.feature2Title,
      icon: <CalendarClock className="text-primary h-8 w-8" />,
    },
    {
      title: t.feature3Title,
      icon: <Filter className="text-primary h-8 w-8" />,
    },
    {
      title: t.feature4Title,
      icon: <Users className="text-primary h-8 w-8" />,
    },
  ];
  return (
    <section className="bg-background py-12 md:py-16">
      <div className="container text-center">
        <h2 className="text-3xl font-bold md:text-4xl">{t.featuresTitle}</h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl">
          {t.featuresSubtitle}
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Card key={i} className="transition hover:scale-105">
              <CardHeader>
                <div className="mb-4 flex justify-center">{f.icon}</div>
                <CardTitle>{f.title}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
