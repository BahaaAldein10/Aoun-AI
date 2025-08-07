import { getDictionary, SupportedLang } from "@/lib/dictionaries";
import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { Icons } from "../shared/Icons";

const Footer = async ({
  params,
}: {
  params: Promise<{ lang: SupportedLang }>;
}) => {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const t = dict.footer;

  const quickLinks = [
    { href: `/${lang}`, text: t.linkHome },
    { href: `/${lang}/pricing`, text: t.linkPricing },
    { href: `/${lang}/blog`, text: t.linkBlog },
    { href: `/${lang}/contact`, text: t.linkContact },
  ];

  const supportLinks = [
    { href: `/${lang}/faq`, text: t.linkFAQ },
    { href: `/${lang}/terms`, text: t.linkTerms },
    { href: `/${lang}/privacy`, text: t.linkPrivacy },
  ];

  return (
    <footer className="border-t-primary/20 bg-secondary text-secondary-foreground border-t">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 rtl:text-right">
            <Link
              href={`/${lang}`}
              className="flex w-fit items-center gap-2 rtl:space-x-reverse"
            >
              <Icons.Logo className="text-primary h-7 w-7" />
              <span className="text-xl font-bold">{t.aboutTitle}</span>
            </Link>
            <p className="text-muted-foreground text-sm">{t.aboutText}</p>
            <div className="flex gap-4 rtl:space-x-reverse">
              {t.social?.facebook && (
                <Link
                  key="facebook"
                  href={t.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <Icons.Facebook className="h-5 w-5" />
                </Link>
              )}
              {t.social?.twitter && (
                <Link
                  key="twitter"
                  href={t.social.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <Icons.Twitter className="h-5 w-5" />
                </Link>
              )}
              {t.social?.instagram && (
                <Link
                  key="instagram"
                  href={t.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <Icons.Instagram className="h-5 w-5" />
                </Link>
              )}
            </div>
          </div>

          <div className="rtl:text-right">
            <h4 className="mb-4 font-bold">{t.quickLinksTitle}</h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.text}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-primary text-sm"
                  >
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rtl:text-right">
            <h4 className="mb-4 font-bold">{t.supportTitle}</h4>
            <ul className="space-y-2">
              {supportLinks.map((link) => (
                <li key={link.text}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-primary text-sm"
                  >
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rtl:text-right">
            <h4 className="mb-4 font-bold">{t.contactTitle}</h4>
            <ul className="space-y-3">
              <li className="flex gap-2 space-x-reverse text-sm">
                <Mail className="text-primary mt-1 h-4 w-4 shrink-0" />
                <span className="text-muted-foreground">{t.contactEmail}</span>
              </li>
              <li className="flex gap-2 space-x-reverse text-sm">
                <Phone className="text-primary mt-1 h-4 w-4 shrink-0" />
                <span className="text-muted-foreground">{t.contactPhone}</span>
              </li>
              <li className="flex gap-2 space-x-reverse text-sm">
                <MapPin className="text-primary mt-1 h-4 w-4 shrink-0" />
                <span className="text-muted-foreground">
                  {t.contactAddress}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-border/50 mt-12 flex flex-col items-center justify-between border-t pt-8 text-sm sm:flex-row">
          <p className="text-muted-foreground">
            &copy; {new Date().getFullYear()} {t.copyright}
          </p>
          <div className="mt-4 flex gap-4 sm:mt-0 rtl:space-x-reverse">
            <Link
              key="terms"
              href={`/${lang}/terms`}
              className="text-muted-foreground hover:text-primary"
            >
              {t.linkTerms}
            </Link>
            <Link
              key="privacy"
              href={`/${lang}/privacy`}
              className="text-muted-foreground hover:text-primary"
            >
              {t.linkPrivacy}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
