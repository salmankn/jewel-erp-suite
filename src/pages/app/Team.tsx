import { StaffPanel } from "@/components/app/StaffPanel";
import { useWorkspace } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/ui";

/**
 * Staff and subscription management for the jeweller workspace.
 *
 * The Store Owner sees role controls; everyone else can still see how much of
 * their plan is used, which is useful to a manager.
 */
export default function Team() {
  const { role, tenant } = useWorkspace();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team & subscription"
        description={`${tenant.businessName} · ${tenant.planTier.replace(/_/g, " ")} · you are signed in as ${role.replace(/_/g, " ").toLowerCase()}.`}
      />
      <StaffPanel isOwner={role === "STORE_OWNER"} />
    </div>
  );
}
