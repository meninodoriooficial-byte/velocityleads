import { Zap } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="container mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-primary flex items-center justify-center text-accent">
              <Zap className="size-3.5" fill="currentColor" />
            </div>
            <span className="font-bold tracking-tight text-sm">
              Velocity<span className="text-muted-foreground font-medium">Leads</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            © {new Date().getFullYear()} VelocityLeads. Prospecção B2B no Brasil.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;