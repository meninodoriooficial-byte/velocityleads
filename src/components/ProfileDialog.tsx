import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, User, KeyRound } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileDialog = ({ open, onOpenChange }: Props) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(profile?.full_name || "");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open, profile?.full_name]);

  const saveName = async () => {
    const name = fullName.trim();
    if (!name) {
      toast({ title: "Informe um nome", variant: "destructive" });
      return;
    }
    if (!user?.id) return;
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("user_id", user.id);
    setSavingName(false);
    if (error) {
      toast({ title: "Erro ao salvar nome", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Nome atualizado", description: "Recarregue para ver em todos os lugares." });
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "Use ao menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não coincidem", description: "Verifique a confirmação da senha.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast({ title: "Senha alterada com sucesso" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Nome */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <User className="size-4" /> Nome
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Nome completo</Label>
              <Input
                id="profile-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <Button onClick={saveName} disabled={savingName} size="sm">
              {savingName && <Loader2 className="size-4 mr-2 animate-spin" />}
              Salvar nome
            </Button>
          </div>

          <div className="border-t border-border/60" />

          {/* Senha */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4" /> Alterar senha
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-pw">Nova senha</Label>
              <PasswordInput
                id="profile-pw"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-pw2">Confirmar nova senha</Label>
              <PasswordInput
                id="profile-pw2"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p className="text-[11px] text-destructive">As senhas não coincidem.</p>
              )}
            </div>
            <Button
              onClick={savePassword}
              disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
              size="sm"
            >
              {savingPassword && <Loader2 className="size-4 mr-2 animate-spin" />}
              Alterar senha
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
