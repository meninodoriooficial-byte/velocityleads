import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Search, ListChecks, History, Package, ShieldCheck, Zap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export type DashboardTab = "search" | "results" | "history" | "plans" | "admin";

interface AppSidebarProps {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
  isAdmin: boolean;
}

const navItems: { key: DashboardTab; label: string; icon: any; group: "main" | "manage" }[] = [
  { key: "search", label: "Nova Busca", icon: Search, group: "main" },
  { key: "results", label: "Histórico de Leads", icon: ListChecks, group: "main" },
  { key: "history", label: "Histórico de Buscas", icon: History, group: "main" },
  { key: "plans", label: "Planos", icon: Package, group: "manage" },
];

export function AppSidebar({ active, onChange, isAdmin }: AppSidebarProps) {
  const { state } = useSidebar();
  const { user, profile, signOut } = useAuth();
  const collapsed = state === "collapsed";

  const main = navItems.filter((i) => i.group === "main");
  const manage = navItems.filter((i) => i.group === "manage");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-16 px-4 flex items-center justify-center border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-accent shrink-0">
            <Zap className="size-4" fill="currentColor" />
          </div>
          {!collapsed && (
            <div className="font-bold text-lg tracking-tight text-foreground leading-none">
              Velocity<span className="text-muted-foreground font-medium">Leads</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-3">
              Sprint Atual
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={active === item.key}
                    onClick={() => onChange(item.key)}
                    tooltip={item.label}
                    className="relative font-medium data-[active=true]:bg-secondary data-[active=true]:text-foreground rounded-xl h-11"
                  >
                    {active === item.key && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent" />
                    )}
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          {!collapsed && (
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-3">
              Gestão
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {manage.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={active === item.key}
                    onClick={() => onChange(item.key)}
                    tooltip={item.label}
                    className="font-medium data-[active=true]:bg-secondary data-[active=true]:text-foreground rounded-xl h-11"
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={active === "admin"}
                    onClick={() => onChange("admin")}
                    tooltip="Admin"
                    className="font-medium data-[active=true]:bg-secondary data-[active=true]:text-foreground rounded-xl h-11"
                  >
                    <ShieldCheck className="size-4" />
                    <span>Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 p-2 rounded-xl ${collapsed ? "justify-center" : ""}`}>
          <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-foreground font-semibold text-sm shrink-0">
            {(profile?.full_name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{profile?.full_name || "Usuário"}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          )}
          {!collapsed && (
            <Button variant="ghost" size="icon" onClick={signOut} className="shrink-0" title="Sair">
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}