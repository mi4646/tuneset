import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Spinner({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 p-8 text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="size-4 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
