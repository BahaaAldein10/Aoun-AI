import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { auth } from "@/lib/auth";
import { getDictionary, SupportedLang } from "@/lib/dictionaries";
import { UserRole } from "@prisma/client";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { LogIn, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";
import ProfileMenu from "../shared/ProfileMenu";

const Header = async ({
  params,
}: {
  params: Promise<{ lang: SupportedLang }>;
}) => {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const t = dict.header;

  const session = await auth();
  const user = session?.user;
  const isAdmin = user?.role === UserRole.ADMIN;

  const navLinks = [
    { href: `/${lang}`, text: t.home },
    { href: `/${lang}#how-it-works`, text: t.howItWorks },
    { href: `/${lang}/pricing`, text: t.pricing },
    { href: `/${lang}/blog`, text: t.blog },
    { href: `/${lang}/faq`, text: t.faq },
  ];

  return (
    <header className="bg-background/80 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link
            href={`/${lang}`}
            className="flex items-center gap-2 rtl:text-right"
          >
            <Image src="/images/logo.png" width={24} height={24} alt="Logo" />
            <span className="text-lg font-bold">{t.title}</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground w-fit transition-colors"
              >
                {link.text}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: Language + User Actions */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />

          {user ? (
            <ProfileMenu user={user} t={t} lang={lang} isAdmin={isAdmin} />
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href={`/${lang}/auth/login`}>
                  {t.login}
                  <LogIn className="ml-2 h-4 w-4 rtl:mr-2 rtl:ml-0" />
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/${lang}/auth/signup`}>{t.getStarted}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile: Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          <Sheet>
            <SheetTrigger asChild className="cursor-pointer">
              <Button variant="ghost" size="icon">
                <Menu className="size-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side={lang === "ar" ? "right" : "left"}>
              <SheetHeader>
                <SheetTitle>
                  <VisuallyHidden>
                    {t.title} {lang === "ar" ? "قائمة" : "Menu"}
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
                    <Image
                      src="/images/logo.png"
                      width={24}
                      height={24}
                      alt="Logo"
                    />
                    <span className="font-bold">{t.title}</span>
                  </Link>
                </div>
              </SheetHeader>

              {/* Nav Links */}
              <div
                className="mt-4 flex flex-col gap-4 border-t px-4 pt-4"
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground w-fit px-2 transition-colors"
                  >
                    {link.text}
                  </Link>
                ))}
              </div>

              {/* Auth / Profile Actions */}
              <div className="mt-6 flex flex-col gap-3 border-t px-4 pt-4">
                {user ? (
                  <Button variant="outline" asChild className="w-full">
                    <Link href={`/${lang}/dashboard`}>{t.dashboard}</Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      asChild
                      className={`w-full ${
                        lang === "ar" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <Link href={`/${lang}/auth/login`}>
                        {t.login}
                        <LogIn className="ml-2 h-4 w-4 rtl:mr-2 rtl:ml-0" />
                      </Link>
                    </Button>
                    <Button asChild className="w-full">
                      <Link href={`/${lang}/auth/signup`}>{t.getStarted}</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
