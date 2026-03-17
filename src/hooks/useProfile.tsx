import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProfileData {
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
}

interface ProfileContextType {
  profile: ProfileData | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<ProfileData>) => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  refreshProfile: async () => {},
  updateProfile: () => {},
});

export const useProfile = () => useContext(ProfileContext);

export const ProfileProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, phone, address")
      .eq("user_id", user.id)
      .single();
    if (data) setProfile(data);
  }, [user]);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    refreshProfile();
  }, [user, refreshProfile]);

  const updateProfile = (updates: Partial<ProfileData>) => {
    setProfile((prev) => prev ? { ...prev, ...updates } : null);
  };

  return (
    <ProfileContext.Provider value={{ profile, refreshProfile, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};
