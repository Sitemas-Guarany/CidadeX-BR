import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import UpdatePrompt from "@/components/common/UpdatePrompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProfileProvider } from "@/hooks/useProfile";
import { VoiceCallProvider } from "@/components/social/VoiceCallProvider";
import ProtectedRoute from "@/components/common/ProtectedRoute";
import Watermark from "@/components/common/Watermark";
import { useContentProtection } from "@/hooks/useContentProtection";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import GlobalErrorBoundary from "@/components/common/GlobalErrorBoundary";
import WordSelectionPopup from "@/components/common/WordSelectionPopup";
import { useEffect } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import Help from "./pages/Help";
import Admin from "./pages/Admin";
import Privacy from "./pages/Privacy";
import Viewer from "./pages/Viewer";

// Fix Android StatusBar color to match app header
async function initStatusBar() {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#1a6b40" });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Not running in Capacitor (web browser) — ignore
  }
}
initStatusBar();

const queryClient = new QueryClient();

const AppContent = () => {
  useContentProtection();
  usePushNotifications();
  return null;
};

const App = () => (
  <GlobalErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProfileProvider>
        <VoiceCallProvider>
        <TooltipProvider delayDuration={300}>
          <AppContent />
          <Watermark />
          <Toaster />
          <Sonner />
          <UpdatePrompt />
          <WordSelectionPopup />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/install" element={<Install />} />
              <Route path="/privacidade" element={<Privacy />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/ajuda" element={<ProtectedRoute><Help /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/visualizador" element={<ProtectedRoute><Viewer /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </VoiceCallProvider>
        </ProfileProvider>
      </AuthProvider>
    </QueryClientProvider>
  </GlobalErrorBoundary>
);

export default App;
