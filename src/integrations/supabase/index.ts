export { supabase } from "./client";
export { TABLES } from "./tables";
export {
  login,
  logout,
  bootstrapSession,
  getCurrentUser,
  onAuthEvent,
} from "./auth-session";
