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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";

interface SearchPackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  searches_limit: number;
  is_active: boolean;
  created_at: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  searches_limit: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  price: "0",
  searches_limit: "10",
  is_active: true,
};

export const PackagesManager = () => {
  const [packages, setPackages] = useState<SearchPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SearchPackage | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<SearchPackage | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("search_packages")
      .select("*")
      .order("searches_limit", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar pacotes", { description: error.message });
    } else {
      setPackages((data || []) as SearchPackage[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (pkg: SearchPackage) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      price: String(pkg.price),
      searches_limit: String(pkg.searches_limit),
      is_active: pkg.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("O nome do pacote é obrigatório");
      return;
    }
    const price = Number(form.price);
    const limit = Number(form.searches_limit);
    if (Number.isNaN(price) || price < 0) {
      toast.error("Preço inválido");
      return;
    }
    if (Number.isNaN(limit) || limit < 0 || !Number.isInteger(limit)) {
      toast.error("Quantidade de buscas inválida");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      searches_limit: limit,
      is_active: form.is_active,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("search_packages")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("search_packages").insert(payload));
    }

    if (error) {
      toast.error(editing ? "Erro ao atualizar" : "Erro ao criar", {
        description: error.message,
      });
    } else {
      toast.success(editing ? "Pacote atualizado" : "Pacote criado");
      setDialogOpen(false);
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("search_packages")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
    } else {
      toast.success("Pacote excluído");
      await load();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {packages.length} pacote{packages.length !== 1 ? "s" : ""} cadastrado
          {packages.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Novo pacote
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Carregando...
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhum pacote cadastrado.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Buscas</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <div className="font-medium">{pkg.name}</div>
                    {pkg.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {pkg.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pkg.searches_limit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    R$ {Number(pkg.price).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pkg.is_active ? "default" : "secondary"}>
                      {pkg.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(pkg)}
                        aria-label="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(pkg)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar pacote" : "Novo pacote"}</DialogTitle>
            <DialogDescription>
              Configure nome, preço e quantidade de buscas inclusas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name">Nome</Label>
              <Input
                id="pkg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Starter"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-desc">Descrição</Label>
              <Textarea
                id="pkg-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Breve descrição do pacote"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pkg-price">Preço (R$)</Label>
                <Input
                  id="pkg-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-limit">Buscas</Label>
                <Input
                  id="pkg-limit"
                  type="number"
                  min="0"
                  step="1"
                  value={form.searches_limit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, searches_limit: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="pkg-active" className="text-sm font-medium">
                  Ativo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pacotes inativos não aparecem para usuários.
                </p>
              </div>
              <Switch
                id="pkg-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
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
            <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
            <AlertDialogDescription>
              O pacote <strong>{deleteTarget?.name}</strong> será removido
              permanentemente. Esta ação não pode ser desfeita.
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