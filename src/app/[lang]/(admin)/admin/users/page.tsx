import UsersClient from "@/components/admin/UsersClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type UsersPageProps = { params: Promise<{ lang: SupportedLang }> };

export default async function UsersPage({ params }: UsersPageProps) {
  const { lang, dict } = await getLangAndDict(params);

  // TODO: fetch real users from DB
  const initialUsers = [
    {
      id: "u1",
      name: "Alice Johnson",
      email: "alice@example.com",
      role: "ADMIN",
      status: "active",
      createdAt: new Date().toISOString(),
    },
    {
      id: "u2",
      name: "Bob Smith",
      email: "bob@example.com",
      role: "USER",
      status: "suspended",
      createdAt: new Date().toISOString(),
    },
  ];

  return <UsersClient lang={lang} dict={dict} initialUsers={initialUsers} />;
}
