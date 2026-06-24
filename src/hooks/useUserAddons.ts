import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserAddon = {
  id: string;
  addon_slug: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  monthly_quota: number | null;
  monthly_used: number;
};

export type AddonCatalog = {
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
};

export function useUserAddons() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<AddonCatalog[]>([]);
  const [active, setActive] = useState<UserAddon[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [catRes, userRes] = await Promise.all([
      supabase.from("addons").select("*").eq("is_active", true).order("sort_order"),
      user
        ? supabase
            .from("user_addons")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "active")
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (!catRes.error) setCatalog((catRes.data || []) as any);
    if (!userRes.error) setActive((userRes.data || []) as any);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isActive = (slug: string) =>
    active.some((a) => a.addon_slug === slug && a.status === "active");

  return { catalog, active, isActive, loading, refresh };
}