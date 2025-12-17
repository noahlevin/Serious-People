import { Button } from "@/lovable/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/lovable/components/ui/card";
import { Input } from "@/lovable/components/ui/input";

export default function LovableSmoke() {
  return (
    <div className="mx-auto max-w-content-medium px-sp-md py-sp-lg space-y-sp-md">
      <Card>
        <CardHeader>
          <CardTitle>Lovable UI smoke test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-sm">
          <Input placeholder="If this looks styled, we’re good." />
          <Button>Button</Button>
        </CardContent>
      </Card>
    </div>
  );
}
