"use client";

import { SupportedLang } from "@/lib/dictionaries";
import { User } from "next-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Avatar, AvatarImage } from "../ui/avatar";
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
  isAdmin: boolean;
}

const ProfileMenu = ({ user, t, lang, isAdmin }: ProfileMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="cursor-pointer">
        <Avatar>
          <AvatarImage
            src={user.image || "/images/avatar.png"}
            alt={user.name ?? "User"}
          />
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={lang === "ar" ? "start" : "end"}>
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={isAdmin ? `/${lang}/admin` : `/${lang}/dashboard`}>
            {t.dashboard}
          </Link>
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
