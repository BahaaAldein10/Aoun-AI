export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="py-16">{children}</div>;
}
