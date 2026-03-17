import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Check, X, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const passwordRules = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Caractere especial (!@#$...)", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
];

const ChangePasswordSection = () => {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const strength = passwordRules.filter(r => r.test(newPassword)).length;
  const isStrong = strength === passwordRules.length;
  const strengthColor = strength <= 1 ? "bg-destructive" : strength <= 3 ? "bg-yellow-500" : "bg-green-500";

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (!isStrong) {
      toast({ title: "Senha fraca", description: "A senha precisa atender todos os requisitos.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Usuário não encontrado");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        toast({ title: "Erro", description: "Senha atual incorreta.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: "Senha atualizada!", description: "Sua senha foi alterada com sucesso." });
      reset();
      setOpen(false);
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Não foi possível alterar a senha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Segurança</h3>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-foreground font-semibold text-sm hover:bg-muted/80 transition-colors border border-border"
        >
          <ShieldCheck className="w-4 h-4" />
          Alterar senha
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Alterar senha</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Senha atual</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nova senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Crie uma senha forte"
              required
              minLength={8}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
          {newPassword.length > 0 && (
            <div className="space-y-2 mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : "bg-muted"}`} />
                ))}
              </div>
              <div className="space-y-1">
                {passwordRules.map((rule, i) => {
                  const passed = rule.test(newPassword);
                  return (
                    <div key={i} className={`flex items-center gap-1.5 text-[11px] transition-colors ${passed ? "text-green-500" : "text-muted-foreground"}`}>
                      {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {rule.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confirmar nova senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              required
              minLength={8}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
          {confirmPassword.length > 0 && newPassword !== confirmPassword && (
            <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
              <X className="w-3 h-3" /> As senhas não coincidem
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || !isStrong || newPassword !== confirmPassword || !currentPassword}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Salvar
          </button>
          <button
            type="button"
            onClick={() => { reset(); setOpen(false); }}
            className="px-4 py-2.5 rounded-lg bg-muted text-foreground font-semibold text-sm hover:bg-muted/80 transition-colors border border-border"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePasswordSection;
