import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Puzzle } from "lucide-react";

interface Addon {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  price_cents: number;
  billing_period: string;
  monthly_quota: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface FormState {
  slug: string;
  name: string;
  description: string;
  icon: string;
  price: string;
  billing_period: string;
  monthly_quota: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  slug: "",
  name: "",
  description: "",
  icon: "",
  price: "0.00",
  billing_period: "monthly",
  monthly_quota: "",
  sort_order: "0",
  is_active: true,
};

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const AddonsManager = () => {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Addon | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Addon | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("addons")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar add-ons", { description: error.message });
    } else {
      setAddons((data || []) as Addon[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setDialogOpen(true);
  };

  const openEdit = (addon: Addon) => {
    setEditing(addon);
    setForm({
      slug: addon.slug,
      name: addon.name,
      description: addon.description ?? "",
      icon: addon.icon ?? "",
      price: (addon.price_cents / 100).toFixed(2),
      billing_period: addon.billing_period,
      monthly_quota: addon.monthly_quota != null ? String(addon.monthly_quota) : "",
      sort_order: String(addon.sort_order),
      is_active: addon.is_active,
    });
    setSlugTouched(true);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("O nome do add-on é obrigatório");
      return;
    }
    const slug = (slugTouched ? form.slug : slugify(form.name)).trim();
    if (!slug) {
      toast.error("O slug é obrigatório");
      return;
    }
    const price = Number(form.price);
    if (Number.isNaN(price) || price < 0) {
      toast.error("Preço inválido");
      return;
    }
    const quota =
      form.monthly_quota.trim() === "" ? null : Number(form.monthly_quota);
    if (quota != null && (Number.isNaN(quota) || quota < 0 || !Number.isInteger(quota))) {
      toast.error("Cota mensal inválida");
      return;
    }
    const sortOrder = Number(form.sort_order);
    if (Number.isNaN(sortOrder) || !Number.isInteger(sortOrder)) {
      toast.error("Ordem inválida");
      return;
    }

    setSaving(true);
    const payload = {
      slug,
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
      price_cents: Math.round(price * 100),
      billing_period: form.billing_period,
      monthly_quota: quota,
      sort_order: sortOrder,
      is_active: form.is_active,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("addons")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("addons").insert(payload));
    }

    if (error) {
      toast.error(editing ? "Erro ao atualizar" : "Erro ao criar", {
        description: error.message,
      });
    } else {
      toast.success(editing ? "Add-on atualizado" : "Add-on criado");
      setDialogOpen(false);
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("addons")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir", {
        description:
          error.message.includes("foreign key") || error.code === "23503"
            ? "Há usuários com este add-on ativo. Desative-o em vez de excluir."
            : error.message,
      });
    } else {
      toast.success("Add-on excluído");
      await load();
    }
    setDeleteTarget(null);
  };

  const billingLabel = (p: string) =>
    p === "monthly" ? "Mensal" : p === "yearly" ? "Anual" : p === "one_time" ? "Único" : p;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {addons.length} add-on{addons.length !== 1 ? "s" : ""} cadastrado
          {addons.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Novo add-on
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Carregando...
        </div>
      ) : addons.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Puzzle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhum add-on cadastrado.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Add-on</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Cota/mês</TableHead>
                <TableHead>Cobrança</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addons.map((addon) => (
                <TableRow key={addon.id}>
                  <TableCell>
                    <div className="font-medium">{addon.name}</div>
                    {addon.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]">
                        {addon.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {addon.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {addon.monthly_quota != null
                      ? addon.monthly_quota.toLocaleString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {billingLabel(addon.billing_period)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    R$ {(addon.price_cents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={addon.is_active ? "default" : "secondary"}>
                      {addon.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(addon)}
                        aria-label="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(addon)}
                        aria-label="Excluir"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar add-on" : "Novo add-on"}</DialogTitle>
            <DialogDescription>
              Configure nome, slug, preço, cota mensal e especificações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addon-name">Nome</Label>
                <Input
                  id="addon-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Ex.: WhatsApp Prospect"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addon-slug">Slug (identificador)</Label>
                <Input
                  id="addon-slug"
                  value={slugTouched ? form.slug : slugify(form.name)}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  placeholder="whatsapp"
                  disabled={!!editing}
                  className="font-mono text-sm"
                />
                {editing && (
                  <p className="text-[11px] text-muted-foreground">
                    O slug não pode ser alterado após criação.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addon-desc">Descrição</Label>
              <Textarea
                id="addon-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Descrição exibida na loja de add-ons"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addon-icon">Ícone (lucide)</Label>
                <Input
                  id="addon-icon"
                  value={form.icon}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, icon: e.target.value }))
                  }
                  placeholder="message-circle"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addon-order">Ordem de exibição</Label>
                <Input
                  id="addon-order"
                  type="number"
                  step="1"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addon-price">Preço (R$)</Label>
                <Input
                  id="addon-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addon-billing">Cobrança</Label>
                <Select
                  value={form.billing_period}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, billing_period: v }))
                  }
                >
                  <SelectTrigger id="addon-billing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                    <SelectItem value="one_time">Único</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addon-quota">Cota/mês</Label>
                <Input
                  id="addon-quota"
                  type="number"
                  min="0"
                  step="1"
                  value={form.monthly_quota}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monthly_quota: e.target.value }))
                  }
                  placeholder="ilimitada"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="addon-active" className="text-sm font-medium">
                  Ativo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add-ons inativos não aparecem para os usuários.
                </p>
              </div>
              <Switch
                id="addon-active"
                checked={form.is_active}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, is_active: v }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir add-on?</AlertDialogTitle>
            <AlertDialogDescription>
              O add-on "{deleteTarget?.name}" será removido permanentemente. Se
              houver usuários com ele ativo, prefira desativá-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
