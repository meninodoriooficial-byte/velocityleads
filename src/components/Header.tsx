import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-6 py-3.5">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="size-9 rounded-xl bg-primary flex items-center justify-center text-accent shadow-card group-hover:scale-105 transition-transform">
              <Zap className="size-4" fill="currentColor" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Velocity<span className="text-muted-foreground font-medium">Leads</span>
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Recursos
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Como funciona
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Preços
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="font-semibold">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild className="btn-volt">
              <Link to="/auth">Começar Grátis</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};