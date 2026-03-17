import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Loader2, Check, X, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PoweredFooter from "@/components/common/PoweredFooter";

const passwordRules = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Caractere especial (!@#$...)", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
];

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const passwordStrength = passwordRules.filter(r => r.test(password)).length;
  const isPasswordStrong = passwordStrength === passwordRules.length;
  const strengthColor = passwordStrength <= 1 ? "bg-destructive" : passwordStrength <= 3 ? "bg-yellow-500" : "bg-green-500";

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check URL hash for recovery token
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (!isPasswordStrong) {
      toast({
        title: "Senha fraca",
        description: "A senha precisa atender todos os requisitos de segurança.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast({
        title: "Senha atualizada!",
        description: "Sua senha foi redefinida com sucesso.",
      });
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Não foi possível redefinir a senha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery && !success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center shadow-lg mx-auto">
            <span className="font-display font-black text-foreground text-xl leading-none">CidX</span>
          </div>
          <h1 className="font-display font-bold text-xl text-foreground">Link inválido ou expirado</h1>
          <p className="text-muted-foreground text-sm">
            Este link de recuperação não é válido. Solicite um novo link na página de login.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Ir para Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center shadow-lg mx-auto">
            <ShieldCheck className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="font-display font-bold text-xl text-foreground">Senha redefinida!</h1>
          <p className="text-muted-foreground text-sm">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center shadow-lg mx-auto">
            <span className="font-display font-black text-foreground text-xl leading-none">CidX</span>
          </div>
          <h1 className="font-display font-black text-2xl text-foreground">Nova Senha</h1>
          <p className="text-muted-foreground text-sm">Escolha uma nova senha segura</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nova Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Crie uma senha forte"
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
            {password.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= passwordStrength ? strengthColor : "bg-muted"}`} />
                  ))}
                </div>
                <div className="space-y-1">
                  {passwordRules.map((rule, i) => {
                    const passed = rule.test(password);
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

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confirmar Senha</label>
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
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                <X className="w-3 h-3" /> As senhas não coincidem
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isPasswordStrong || password !== confirmPassword}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Redefinir Senha
          </button>
        </form>
        <PoweredFooter />
      </div>
    </div>
  );
};

export default ResetPassword;
