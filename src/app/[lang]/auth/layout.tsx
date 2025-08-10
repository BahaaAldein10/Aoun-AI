export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="py-8 md:py-16">{children}</div>;
}
