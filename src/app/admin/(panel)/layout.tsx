import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  return <AdminShell userName={user.name} role={user.role}>{children}</AdminShell>;
}
