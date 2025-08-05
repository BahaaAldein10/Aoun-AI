import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getDictionary, SupportedLang } from "@/lib/dictionaries";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { LogIn, Menu } from "lucide-react";
import Link from "next/link";
import { Icons } from "../shared/Icons";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";

const Header = async ({
  params,
}: {
  params: Promise<{ lang: SupportedLang }>;
}) => {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const t = dict.header;

  const navLinks = [
    { href: `/${lang}`, text: t.home },
    { href: `/${lang}#how-it-works`, text: t.howItWorks },
    { href: `/${lang}/pricing`, text: t.pricing },
    { href: `/${lang}/blog`, text: t.blog },
    { href: `/${lang}/faq`, text: t.faq },
  ];

  return (
    <header className="bg-background/80 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
        <div className="md:hidden">
          <LanguageSwitcher />
        </div>

        {/* Left: Logo & Nav */}
        <div className="flex items-center gap-6">
          <Link
            href={`/${lang}`}
            className="flex items-center gap-2 rtl:text-right"
          >
            <Icons.Logo className="text-primary h-6 w-6" />
            <span className="font-bold">{t.title}</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-foreground text-foreground/70 transition-colors"
              >
                {link.text}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher />

          <Button variant="outline" asChild>
            <Link href={`/${lang}/auth/login`}>
              {t.login}
              <LogIn className="ml-2 rtl:mr-2 rtl:ml-0" />
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/${lang}/auth/signup`}>{t.getStarted}</Link>
          </Button>
        </div>

        {/* Mobile: Menu */}
        <div className="flex items-center gap-2 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="cursor-pointer">
                <Menu className="size-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side={lang === "ar" ? "right" : "left"}>
              <SheetHeader>
                <SheetTitle>
                  <VisuallyHidden>
                    {t.title} {lang === "ar" ? "قائمة" : "Menu"}
                  </VisuallyHidden>
                </SheetTitle>

                <div
                  className="flex w-full items-center gap-2"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                >
                  <Link
                    href={`/${lang}`}
                    className="flex w-fit items-center gap-2"
                  >
                    <Icons.Logo className="text-primary size-6" />
                    <span className="font-bold">{t.title}</span>
                  </Link>
                </div>
              </SheetHeader>

              <div
                className="mt-4 flex flex-col gap-4 px-2"
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="hover:text-foreground text-foreground/70 px-2 transition-colors"
                  >
                    {link.text}
                  </Link>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-4 px-4">
                <Button
                  variant="outline"
                  asChild
                  className={lang === "ar" ? "flex-row-reverse" : ""}
                >
                  <Link href={`/${lang}/auth/login`}>
                    {t.login}
                    <LogIn className="ml-2 rtl:mr-2 rtl:ml-0" />
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/${lang}/auth/signup`}>{t.getStarted}</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
