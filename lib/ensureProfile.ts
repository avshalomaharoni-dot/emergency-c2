import { supabase } from "@/lib/supabaseClient";

const COMMANDER_EMAILS = [
  // Put your commander emails here (lowercase)
  "avshalom.aharoni@gmail.com",
];

export async function ensureProfile() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return;

  const email = (user.email ?? "").toLowerCase();
  const desiredRole = COMMANDER_EMAILS.includes(email) ? "COMMANDER" : "RESPONDER";

  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (selErr) {
    console.error("ensureProfile select error:", selErr.message);
    return;
  }

  if (!existing) {
    const { error: insErr } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      role: desiredRole,
      created_at: new Date().toISOString(),
    });

    if (insErr) {
      console.error("ensureProfile insert error:", insErr.message);
    }
    return;
  }

  if (existing.role !== desiredRole) {
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ role: desiredRole, email: user.email })
      .eq("id", user.id);

    if (updErr) {
      console.error("ensureProfile update error:", updErr.message);
    }
  }
}

