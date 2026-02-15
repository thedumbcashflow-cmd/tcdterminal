import { cn } from "@/lib/utils";

interface TerminalCardProps {
  title: string;
  className?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

const TerminalCard = ({ title, className, children, headerRight }: TerminalCardProps) => {
  return (
    <div className={cn("border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 bg-secondary/50">
        <h3 className="font-serif text-xs font-bold uppercase tracking-wider text-primary">
          {title}
        </h3>
        {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
};

export default TerminalCard;
