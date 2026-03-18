import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Profile() {
  return (
    <div>
      <PageHeader title="Profile" description="Manage your account settings" />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
              <div className="rounded-[16px] border px-4 py-2 text-sm text-muted-foreground">
                —
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
              <div className="rounded-[16px] border px-4 py-2 text-sm text-muted-foreground">
                user@example.com
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Avatar URL</label>
              <div className="rounded-[16px] border px-4 py-2 text-sm text-muted-foreground">
                —
              </div>
            </div>
            <Button variant="outline" size="sm">Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No connected accounts. Link Google or GitHub to enable calendar sync and login.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
