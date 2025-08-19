import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSiteContent } from "@/lib/actions/siteContent";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.contact;
  return {
    title: t.title,
    description: t.description,
  };
}

const ContactPage = async ({ params }: Props) => {
  const { lang } = await getLangAndDict(params);

  const contact = await getSiteContent({ lang }).then((res) => res?.contact);
  const footer = await getSiteContent({ lang }).then((res) => res?.footer);

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tighter md:text-5xl">
            {contact?.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            {contact?.subtitle}
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-12 md:grid-cols-2">
          <div className="space-y-6">
            {/* Email Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="text-primary h-5 w-5" />{" "}
                  {contact?.emailCardTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {contact?.emailCardDesc}
                </p>
                <a
                  href={`mailto:${footer?.contactEmail}`}
                  className="text-primary text-lg font-semibold hover:underline"
                >
                  {footer?.contactEmail}
                </a>
              </CardContent>
            </Card>

            {/* Phone Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="text-primary h-5 w-5" />{" "}
                  {contact?.phoneCardTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {contact?.phoneCardDesc}
                </p>
                <p className="text-lg font-semibold">{footer?.contactPhone}</p>
              </CardContent>
            </Card>

            {/* Address Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="text-primary h-5 w-5" />{" "}
                  {contact?.addressCardTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {footer?.contactAddress}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Chat Widget Card */}
          <div>
            <Card className="p-8">
              <h2 className="mb-4 text-2xl font-bold">
                {contact?.chatCardTitle}
              </h2>
              <p className="text-muted-foreground mb-6">
                {contact?.chatCardDesc}
              </p>
              {/* <ChatWidget /> */}
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactPage;
