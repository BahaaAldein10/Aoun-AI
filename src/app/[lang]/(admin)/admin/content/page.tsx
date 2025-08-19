import ContentClient from "@/components/admin/ContentClient";
import { getSiteContent } from "@/lib/actions/siteContent";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type UsersPageProps = { params: Promise<{ lang: SupportedLang }> };

export default async function ContentPage({ params }: UsersPageProps) {
  const { lang, dict } = await getLangAndDict(params);

  const initialEn = await getSiteContent({ lang: "en" });
  const initialAr = await getSiteContent({ lang: "ar" });

  return (
    <ContentClient
      lang={lang}
      dict={dict}
      initialContentEn={initialEn}
      initialContentAr={initialAr}
    />
  );
}
