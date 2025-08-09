import { prisma } from "@/lib/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
        });

        if (!user) throw new Error("No account found with that email");

        const isValidPassword = await bcrypt.compare(
          credentials.password as string,
          user.password as string,
        );

        if (!isValidPassword) throw new Error("Incorrect password");

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      try {
        const userId = token?.id as string | undefined;
        if (userId) {
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
            },
          });

          if (dbUser) {
            session.user.id = dbUser.id;
            session.user.name = dbUser.name ?? null;
            session.user.email = dbUser.email ?? null;
            session.user.image = dbUser.image ?? null;
            session.user.role = dbUser.role ?? "USER";
          } else {
            if (token?.id) session.user.id = token?.id as string;
            if (token?.role) session.user.role = token.role as UserRole;
          }
        }
      } catch (err) {
        console.error("session callback error:", err);
      }

      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
});
