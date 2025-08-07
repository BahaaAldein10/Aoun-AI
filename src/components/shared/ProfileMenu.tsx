"use client";

import { SupportedLang } from "@/lib/dictionaries";
import { User } from "next-auth";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ProfileMenuProps {
  user: User;
  t: {
    dashboard: string;
    signOut: string;
  };
  lang: SupportedLang;
}

const ProfileMenu = ({ user, t, lang }: ProfileMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="cursor-pointer">
        <Image
          src={user.image ?? "/images/avatar.png"}
          alt={user.name ?? "User"}
          width={32}
          height={32}
          className="rounded-full"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={lang === "ar" ? "start" : "end"}>
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={`/${lang}/dashboard`}>{t.dashboard}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <div onClick={() => signOut({ callbackUrl: `/${lang}` })}>
            {t.signOut}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProfileMenu;
