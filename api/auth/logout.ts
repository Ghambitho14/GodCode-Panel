import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabaseClient } from "../_lib/supabase.js";
import {
  clearRefreshCookie,
  methodGuard,
  passesCsrfCheck,
  readRefreshCookie,
} from "../_lib/http.js";

/**
 * POST /api/auth/logout
 *
 * Revoca la sesion en Supabase (best-effort) y limpia la cookie httpOnly.
 * Siempre responde 200 para que el panel pueda cerrar sesion localmente aunque
 * la revocacion remota falle.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!methodGuard(req, res, "POST")) return;
  if (!passesCsrfCheck(req)) {
    res.status(403).json({ error: "Petición no autorizada." });
    return;
  }

  const refreshToken = readRefreshCookie(req);
  if (refreshToken) {
    try {
      const supabase = createServerSupabaseClient();
      // `setSession` con access token vacío lo rechaza supabase-js y el refresh
      // token seguía vivo. Se canjea por una sesión real y se cierra esa; `local`
      // para no sacar a las otras cajas que comparten la cuenta.
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (!error && data.session) {
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch {
      /* best-effort: igual limpiamos la cookie abajo */
    }
  }

  clearRefreshCookie(res);
  res.status(200).json({ ok: true });
}
