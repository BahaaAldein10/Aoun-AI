"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import {
  BarChartBig,
  BookOpen,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  LayoutDashboard,
  Library,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { User } from "next-auth";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const AdminSidebar = ({
  lang,
  user,
  dict,
}: {
  lang: SupportedLang;
  user: User;
  dict: Dictionary;
}) => {
  const pathname = usePathname();

  const t = dict.admin_layout;
  const isRtl = lang === "ar";

  const adminMenu = [
    { href: "/admin", icon: LayoutDashboard, label: t.dashboard },
    { href: "/admin/reports", icon: BarChartBig, label: t.reports },
    { href: "/admin/content", icon: Library, label: t.content_management },
    { href: "/admin/blog", icon: BookOpen, label: t.blog_management },
    {
      href: "/admin/knowledge-bases",
      icon: FileText,
      label: t.knowledge_bases,
    },
    { href: "/admin/users", icon: Users, label: t.users },
    { href: "/admin/subscriptions", icon: CreditCard, label: t.subscriptions },
    { href: "/admin/pricing", icon: DollarSign, label: t.pricing },
    { href: "/admin/settings", icon: Settings, label: t.settings },
  ];

  const isActive = (href: string) => {
    const full = `/${lang}${href}`;
    if (href === "/admin") return pathname === full;
    return pathname?.startsWith(full) ?? false;
  };

  return (
    <Sidebar side={isRtl ? "right" : "left"} className="w-64">
      <SidebarContent>
        <SidebarHeader dir={isRtl ? "rtl" : "ltr"}>
          <Link
            href={`/${lang}`}
            className={cn(
              "flex items-center gap-2 rtl:mr-2 rtl:ml-0",
              isRtl ? "rtl:mr-2 rtl:ml-0" : "ml-2",
            )}
          >
            <Image src="/images/logo.png" width={28} height={28} alt="Logo" />
            <span className="text-sidebar-foreground text-lg font-semibold">
              {t.admin_panel_title}
            </span>
          </Link>
        </SidebarHeader>

        <ScrollArea className="h-[calc(100vh-220px)]">
          <SidebarGroup>
            <SidebarGroupContent className="mt-4">
              <SidebarMenu>
                {adminMenu.map((m) => {
                  const Icon = m.icon;
                  return (
                    <SidebarMenuItem key={m.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(m.href)}
                        className={isRtl ? "flex-row-reverse" : ""}
                      >
                        <Link
                          href={`/${lang}${m.href}`}
                          className="flex items-center gap-3"
                        >
                          <Icon className="h-4 w-4" />
                          <span>{m.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>

        <SidebarFooter>
          <Separator />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className={isRtl ? "max-sm:flex-row-reverse" : ""}
              >
                <Link href={`/${lang}`}>
                  <Globe />
                  <span>{t.main_website}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => signOut({ callbackUrl: `/${lang}` })}
                className={cn(
                  "cursor-pointer",
                  isRtl && "max-sm:flex-row-reverse",
                )}
              >
                <LogOut />
                <span>{t.logout}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <div
            className="bg-sidebar-accent mt-4 flex items-center gap-3 rounded-lg p-3"
            dir={isRtl ? "rtl" : "ltr"}
          >
            <Avatar>
              <AvatarImage
                src={user.image || "/images/avatar.png"}
                alt={user.name ?? "User"}
              />
            </Avatar>

            <div className={cn("text-sm", isRtl && "rtl:text-right")}>
              <p className="text-sidebar-accent-foreground text-sm font-semibold">
                {user.name}
              </p>
              <p className="text-sidebar-accent-foreground/70 text-xs">
                {user.email}
              </p>
            </div>
          </div>
        </SidebarFooter>
      </SidebarContent>
    </Sidebar>
  );
};

export default AdminSidebar;
