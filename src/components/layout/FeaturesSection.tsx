/* eslint-disable react/jsx-key */
import { CalendarClock, Filter, PhoneCall, Users } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../ui/card";

const FeaturesSection = ({
  features,
  featuresTitle,
  featuresSubtitle,
}: {
  featuresTitle: string;
  featuresSubtitle: string;
  features: { title: string }[];
}) => {
  const icons = [
    <PhoneCall className="text-primary size-8" />,
    <CalendarClock className="text-primary size-8" />,
    <Filter className="text-primary size-8" />,
    <Users className="text-primary size-8" />,
  ];

  const featuresArray = features.map((feature, i) => ({
    title: feature.title,
    icon: icons[i],
  }));

  return (
    <section className="bg-background py-12 md:py-16">
      <div className="container text-center">
        <h2 className="text-3xl font-bold md:text-4xl">{featuresTitle}</h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl">
          {featuresSubtitle}
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {featuresArray.map((f, i) => (
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
