import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getDictionary, SupportedLang } from "@/lib/dictionaries";
import { User } from "next-auth";
import React from "react";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";
import DashboardSidebar from "./DashboardSidebar";

interface DashboardShellProps {
  children: React.ReactNode;
  user: User;
  lang: SupportedLang;
}
const DashboardShell = async ({
  children,
  user,
  lang,
}: DashboardShellProps) => {
  const isRtl = lang === "ar";
  const dict = await getDictionary(lang);

  return (
    <SidebarProvider>
      <div className="bg-background flex min-h-screen w-full">
        {/* Sidebar */}
        <div className={isRtl ? "rtl" : ""}>
          <DashboardSidebar lang={lang} dict={dict} user={user} />
        </div>

        {/* Main area */}
        <div className="flex flex-1 flex-col">
          {/* Top header */}
          <header className="bg-card flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              {/* Mobile sidebar trigger */}
              <SidebarTrigger />

              <h1 className="text-lg font-semibold">
                {dict.dashboard_layout.dashboard}
              </h1>

              <LanguageSwitcher />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardShell;
