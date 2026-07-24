import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="metric-card">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}
