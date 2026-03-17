import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, User, ArrowRight, Loader2, Check, X, KeyRound, Phone, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import PoweredFooter from "@/components/common/PoweredFooter";

const passwordRules = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Caractere especial (!@#$...)", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
];

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState(() => localStorage.getItem("cidadex-saved-email") || "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => !!localStorage.getItem("cidadex-saved-email"));

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : "";
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);
  const referralCode = searchParams.get("ref") || "";
  const isBanned = searchParams.get("banned") === "true";
  const { user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Track referral (called after successful signup/login, no duplicate listener needed)
  const trackReferral = async (userId: string) => {
    if (!referralCode) return;
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-referral`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ referral_code: referralCode, new_user_id: userId }),
      });
    } catch (e) {
      console.error("Failed to track referral:", e);
    }
  };

  const passwordStrength = passwordRules.filter(r => r.test(password)).length;
  const isPasswordStrong = passwordStrength === passwordRules.length;
  const strengthColor = passwordStrength <= 1 ? "bg-destructive" : passwordStrength <= 3 ? "bg-yellow-500" : "bg-green-500";

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    
    // Safety timeout — if nothing happens in 15s, stop spinner
    const safetyTimeout = setTimeout(() => {
      setGoogleLoading(false);
      toast({
        title: "Tempo esgotado",
        description: "O login com Google demorou demais. Tente novamente ou abra o app em uma nova aba.",
        variant: "destructive",
      });
    }, 15000);
    
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      
      // Non-iframe: browser navigates away, page unloads
      if (result.redirected) {
        // Page will unload — keep spinner, clear timeout
        clearTimeout(safetyTimeout);
        return;
      }
      
      // Error (popup blocked, cancelled, etc.)
      if (result.error) throw result.error;
      
      // Iframe/popup flow: tokens received directly
      // setSession was already called inside lovable.auth.signInWithOAuth
      clearTimeout(safetyTimeout);
      localStorage.setItem("cidadex-remember", "true");
      sessionStorage.setItem("cidadex-session-active", "true");
      
      // Wait for onAuthStateChange to process, then hard-redirect
      await new Promise(r => setTimeout(r, 800));
      window.location.replace("/");
    } catch (err: any) {
      clearTimeout(safetyTimeout);
      console.error("[AUTH] Google sign in error:", err);
      setGoogleLoading(false);
      const message = err.message || "Erro ao entrar com Google. Tente novamente.";
      const description = message.includes("Popup")
        ? "O popup foi bloqueado pelo navegador. Permita popups para este site e tente novamente."
        : message.includes("cancelled") || message.includes("closed")
        ? "Login cancelado. Tente novamente."
        : message.includes("new tab")
        ? "No modo preview, abra o app em uma nova aba para fazer login com Google."
        : message.includes("Tempo")
        ? message
        : message;
      toast({
        title: "Erro ao entrar com Google",
        description,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !isPasswordStrong) {
      toast({
        title: "Senha fraca",
        description: "A senha precisa atender todos os requisitos de segurança.",
        variant: "destructive",
      });
      return;
    }
    if (!isLogin && phone.replace(/\D/g, "").length !== 11) {
      toast({
        title: "Celular inválido",
        description: "O celular deve ter exatamente 11 dígitos (DDD + 9 dígitos). Ex: (85) 99999-9999",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (rememberMe) {
          localStorage.setItem("cidadex-remember", "true");
        } else {
          localStorage.setItem("cidadex-remember", "false");
        }
        if (rememberEmail) {
          localStorage.setItem("cidadex-saved-email", email);
        } else {
          localStorage.removeItem("cidadex-saved-email");
        }
        sessionStorage.setItem("cidadex-session-active", "true");
        // Track referral if applicable
        if (data.user) trackReferral(data.user.id);
        // Navigation handled by useEffect watching user state — no navigate() here
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName, full_name: fullName, phone: phone.replace(/\D/g, "") },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) {
          if (error.message?.toLowerCase().includes("already registered") || error.message?.toLowerCase().includes("already been registered")) {
            throw new Error("Este email já está cadastrado. Faça login ou use outro email.");
          }
          if (error.message?.includes("profiles_phone_unique") || error.message?.includes("duplicate key") && error.message?.includes("phone")) {
            throw new Error("Este número de celular já está associado a outra conta. Use outro número ou faça login.");
          }
          throw error;
        }
        toast({
          title: "Cadastro realizado!",
          description: "Verifique seu email para confirmar a conta.",
        });
        setIsLogin(true);
        setEmail("");
        setPassword("");
        setDisplayName("");
        setFullName("");
        setPhone("");
      }
    } catch (err: any) {
      let description = err.message || "Algo deu errado";
      if (err.message?.toLowerCase().includes("email not confirmed")) {
        description = "Seu email ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de confirmação.";
      } else if (err.message?.toLowerCase().includes("invalid login credentials")) {
        description = "Email ou senha incorretos. Verifique seus dados e tente novamente.";
      }
      toast({
        title: "Erro",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Erro", description: "Informe seu email.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
      setIsForgotPassword(false);
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Não foi possível enviar o email.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (isForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center shadow-lg mx-auto">
              <KeyRound className="w-8 h-8 text-foreground" />
            </div>
            <h1 className="font-display font-black text-2xl text-foreground">Recuperar Senha</h1>
            <p className="text-muted-foreground text-sm">Enviaremos um link para redefinir sua senha</p>
          </div>

          <form onSubmit={handleForgotPassword} className="glass-card rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email <span className="text-destructive">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  maxLength={255}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Enviar Link de Recuperação
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Lembrou a senha?{" "}
            <button onClick={() => setIsForgotPassword(false)} className="text-primary font-semibold hover:underline">
              Voltar ao login
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center shadow-lg mx-auto">
            <span className="font-display font-black text-foreground text-xl leading-none">CidX</span>
          </div>
          <h1 className="font-display font-black text-2xl text-foreground">CidadeX-BR</h1>
          <p className="text-muted-foreground text-sm">
            {isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>

        {/* Banned notice */}
        {isBanned && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/10">
            <Ban className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-xs text-destructive font-semibold">
              Sua conta foi suspensa ou banida. Entre em contato com o administrador para mais informações.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-4">
          {!isLogin && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome <span className="text-destructive">*</span></label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Seu nome"
                    required={!isLogin}
                    maxLength={100}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome Completo <span className="text-destructive">*</span></label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    required={!isLogin}
                    maxLength={200}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>
              </div>
            </>
          )}

          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Celular <span className="text-destructive">*</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(85) 99999-9999"
                  required={!isLogin}
                  maxLength={15}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email <span className="text-destructive">*</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                maxLength={255}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Senha <span className="text-destructive">*</span></label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? "Sua senha" : "Crie uma senha forte"}
                required
                minLength={isLogin ? 6 : 8}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
            {/* Password strength indicator - only on signup */}
            {!isLogin && password.length > 0 && (
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

          {isLogin && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">Lembrar email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">Permanecer conectado</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-xs text-primary hover:underline font-medium self-start"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!isLogin && !isPasswordStrong && password.length > 0)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {isLogin ? "Entrar" : "Cadastrar"}
          </button>

          {!isLogin && (
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setPassword("");
                setDisplayName("");
                setFullName("");
                setPhone("");
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-muted text-foreground font-semibold text-sm hover:bg-muted/80 transition-colors border border-border"
            >
              Cancelar
            </button>
          )}
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-muted text-foreground font-semibold text-sm hover:bg-muted/80 transition-colors disabled:opacity-50 border border-border"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Entrar com Google
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-semibold hover:underline">
            {isLogin ? "Cadastre-se" : "Faça login"}
          </button>
        </p>
        <PoweredFooter />
      </div>
    </div>
  );
};

export default Auth;
