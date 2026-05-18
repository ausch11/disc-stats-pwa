import { createClient } from "@supabase/supabase-js";
import type { AppState } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function syncSnapshot(state: AppState) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const teamId = state.activeTeamId ?? state.teams[0]?.id;

  const { error } = await supabase.from("app_snapshots").upsert({
    team_id: teamId,
    payload: state,
    updated_at: new Date().toISOString()
  });

  if (error) throw error;
}
