import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, MoreVertical, Plus, Pencil, KeyRound, Ban, Trash2, ShieldCheck, Users, Layers, Package } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { invokeEdgeFunction } from "@/lib/edgeFunction";

interface UserRow {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  plan: string;
  plan_searches_limit: number;
  searches_used: number;
  is_suspended: boolean;
  created_at: string;
  roles: string[];
}

const PLANS = ["basic", "pro", "business", "enterprise"];

export const UserManager = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "", password: "", full_name: "", plan: "basic", plan_searches_limit: 10, is_admin: false,
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  // Password dialog
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Plan dialog
  const [planOpen, setPlanOpen] = useState(false);
  const [planUser, setPlanUser] = useState<UserRow | null>(null);
  const [planChoice, setPlanChoice] = useState<string>("basic");
  const [planLimit, setPlanLimit] = useState<number>(10);

  // Addons dialog
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [addonsUser, setAddonsUser] = useState<UserRow | null>(null);
  const [addonsList, setAddonsList] = useState<any[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);

  const callApi = async (action: string, payload: any = {}) => {
    // showToast=false: tratamos os toasts em cada handler
    return await invokeEdgeFunction<any>("admin-users", {
      body: { action, payload },
      showToast: false,
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await callApi("list");
      setUsers(data.users || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar usuários", description: e.description || e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newUser.email || !newUser.password) {
      toast({ title: "Preencha email e senha", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await callApi("create", newUser);
      toast({ title: "Usuário criado com sucesso" });
      setCreateOpen(false);
      setNewUser({ email: "", password: "", full_name: "", plan: "basic", plan_searches_limit: 10, is_admin: false });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao criar usuário", description: e.description || e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editing) return;
    setActionLoading(true);
    try {
      await callApi("update_profile", {
        user_id: editing.user_id,
        full_name: editing.full_name,
        plan: editing.plan,
        plan_searches_limit: editing.plan_searches_limit,
      });
      toast({ title: "Usuário atualizado" });
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e.description || e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwUser || newPassword.length < 6) {
      toast({ title: "Senha deve ter ao menos 6 caracteres", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await callApi("change_password", { user_id: pwUser.user_id, password: newPassword });
      toast({ title: "Senha alterada com sucesso" });
      setPwOpen(false);
      setNewPassword("");
    } catch (e: any) {
      toast({ title: "Erro ao alterar senha", description: e.description || e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (u: UserRow) => {
    try {
      await callApi("suspend", { user_id: u.user_id, suspend: !u.is_suspended });
      toast({ title: u.is_suspended ? "Usuário reativado" : "Usuário suspenso" });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.description || e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (u: UserRow) => {
    try {
      await callApi("delete", { user_id: u.user_id });
      toast({ title: "Usuário excluído" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.description || e.message, variant: "destructive" });
    }
  };

  const handleChangePlan = async (u: UserRow, plan: string) => {
    try {
      const limits: Record<string, number> = { basic: 10, pro: 100, business: 500, enterprise: 5000 };
      await callApi("update_profile", {
        user_id: u.user_id,
        plan,
        plan_searches_limit: limits[plan] ?? u.plan_searches_limit,
      });
      toast({ title: `Plano alterado para ${plan}` });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.description || e.message, variant: "destructive" });
    }
  };

  const openPlanDialog = (u: UserRow) => {
    setPlanUser(u);
    setPlanChoice(u.plan);
    setPlanLimit(u.plan_searches_limit);
    setPlanOpen(true);
  };

  const savePlan = async () => {
    if (!planUser) return;
    setActionLoading(true);
    try {
      await callApi("update_profile", {
        user_id: planUser.user_id,
        plan: planChoice,
        plan_searches_limit: planLimit,
      });
      toast({ title: `Plano atualizado para ${planChoice}` });
      setPlanOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.description || e.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const openAddonsDialog = async (u: UserRow) => {
    setAddonsUser(u);
    setAddonsOpen(true);
    setAddonsLoading(true);
    try {
      const data = await callApi("list_user_addons", { user_id: u.user_id });
      setAddonsList(data.items || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar add-ons", description: e.description || e.message, variant: "destructive" });
    } finally { setAddonsLoading(false); }
  };

  const toggleAddon = async (addon_slug: string, activate: boolean) => {
    if (!addonsUser) return;
    try {
      await callApi("toggle_addon", { user_id: addonsUser.user_id, addon_slug, activate, months: 1 });
      const data = await callApi("list_user_addons", { user_id: addonsUser.user_id });
      setAddonsList(data.items || []);
      toast({ title: activate ? "Add-on habilitado" : "Add-on desativado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.description || e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Gerenciar Usuários
          </CardTitle>
          <CardDescription>Crie, edite, suspenda ou exclua usuários da plataforma</CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Usuário</DialogTitle>
              <DialogDescription>O usuário será criado com email confirmado.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome completo</Label>
                <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div>
                <Label>Senha *</Label>
                <PasswordInput value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plano</Label>
                  <Select value={newUser.plan} onValueChange={(v) => setNewUser({ ...newUser, plan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Limite de buscas</Label>
                  <Input type="number" value={newUser.plan_searches_limit}
                    onChange={(e) => setNewUser({ ...newUser, plan_searches_limit: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_admin" checked={newUser.is_admin}
                  onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })} />
                <Label htmlFor="is_admin">Conceder acesso de administrador</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    {u.roles.includes("admin") && (
                      <Badge variant="destructive" className="mt-1">
                        <ShieldCheck className="w-3 h-3 mr-1" />Admin
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{u.plan}</Badge>
                  </TableCell>
                  <TableCell>{u.searches_used} / {u.plan_searches_limit}</TableCell>
                  <TableCell>
                    {u.is_suspended ? (
                      <Badge variant="destructive">Suspenso</Badge>
                    ) : (
                      <Badge variant="default">Ativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing({ ...u }); setEditOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setPwUser(u); setNewPassword(""); setPwOpen(true); }}>
                          <KeyRound className="w-4 h-4 mr-2" />Mudar senha
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openPlanDialog(u)}>
                          <Layers className="w-4 h-4 mr-2" />Mudar plano
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAddonsDialog(u)}>
                          <Package className="w-4 h-4 mr-2" />Habilitar add-ons
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleSuspend(u)}>
                          <Ban className="w-4 h-4 mr-2" />
                          {u.is_suspended ? "Reativar" : "Suspender"}
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />Excluir
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação é permanente. Todos os dados de {u.email} serão removidos.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(u)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum usuário encontrado
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>{editing?.email}</DialogDescription>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input value={editing.full_name || ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Plano</Label>
                    <Select value={editing.plan} onValueChange={(v) => setEditing({ ...editing, plan: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLANS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Limite de buscas</Label>
                    <Input type="number" value={editing.plan_searches_limit}
                      onChange={(e) => setEditing({ ...editing, plan_searches_limit: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleEdit} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Password Dialog */}
        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alterar Senha</DialogTitle>
              <DialogDescription>{pwUser?.email}</DialogDescription>
            </DialogHeader>
            <div>
              <Label>Nova senha</Label>
              <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwOpen(false)}>Cancelar</Button>
              <Button onClick={handleChangePassword} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Alterar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Plan Dialog */}
        <Dialog open={planOpen} onOpenChange={setPlanOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> Mudar Plano</DialogTitle>
              <DialogDescription>{planUser?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Plano</Label>
                <Select value={planChoice} onValueChange={(v) => {
                  setPlanChoice(v);
                  const limits: Record<string, number> = { basic: 10, pro: 100, business: 500, enterprise: 5000 };
                  setPlanLimit(limits[v] ?? planLimit);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLANS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Limite de buscas/mês</Label>
                <Input type="number" value={planLimit}
                  onChange={(e) => setPlanLimit(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
              <Button onClick={savePlan} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Addons Dialog */}
        <Dialog open={addonsOpen} onOpenChange={setAddonsOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Habilitar Add-ons</DialogTitle>
              <DialogDescription>{addonsUser?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {addonsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : addonsList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum add-on cadastrado.</p>
              ) : addonsList.map((a) => {
                const active = a.user_addon?.status === "active";
                return (
                  <div key={a.slug} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{a.name}</span>
                        {active && <Badge className="bg-green-600 hover:bg-green-600 text-white">ATIVO</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.description}</p>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        R$ {(a.price_cents / 100).toFixed(2).replace(".", ",")}/{a.billing_period}
                        {a.monthly_quota ? ` · cota ${a.monthly_quota}` : ""}
                        {active && a.user_addon?.expires_at ? ` · expira ${new Date(a.user_addon.expires_at).toLocaleDateString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <Switch checked={active} onCheckedChange={(v) => toggleAddon(a.slug, v)} />
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddonsOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};