import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { dict } = await getLangAndDict(params);
  const t = dict.contact_page;
  const f = dict.footer;

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tighter md:text-5xl">
            {t.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">{t.subtitle}</p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-12 md:grid-cols-2">
          <div className="space-y-6">
            {/* Email Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
                  <Mail className="text-primary h-5 w-5" /> {t.email_title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{t.email_desc}</p>
                <a
                  href={`mailto:${f.contactEmail}`}
                  className="text-primary text-lg font-semibold hover:underline"
                >
                  {f.contactEmail}
                </a>
              </CardContent>
            </Card>

            {/* Phone Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
                  <Phone className="text-primary h-5 w-5" /> {t.phone_title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{t.phone_desc}</p>
                <p className="text-lg font-semibold">{f.contactPhone}</p>
              </CardContent>
            </Card>

            {/* Address Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
                  <MapPin className="text-primary h-5 w-5" /> {t.address_title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{f.contactAddress}</p>
              </CardContent>
            </Card>
          </div>

          {/* Chat Widget Card */}
          <div>
            <Card className="p-8">
              <h2 className="mb-4 text-2xl font-bold">{t.chat_title}</h2>
              <p className="text-muted-foreground mb-6">{t.chat_desc}</p>
              {/* <ChatWidget /> */}
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactPage;
