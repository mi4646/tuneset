import { Link } from "react-router-dom";
import { ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BrandMark({
  className,
  asLink = false,
}: {
  className?: string;
  asLink?: boolean;
}) {
  const content = (
    <>
      <ListMusic className="size-5 text-primary" />
      <span className="text-lg font-bold text-foreground">TuneSet</span>
    </>
  );
  const cls = cn("inline-flex items-center gap-2", className);
  if (asLink) {
    return (
      <Link to="/songlist" className={cn(cls, "hover:no-underline")}>
        {content}
      </Link>
    );
  }
  return <div className={cls}>{content}</div>;
}
