"use strict";
const supabase = require("../db/supabase");
const permissions = {
  super_admin: ["*"],
  ops_admin: [
    "dashboard:read",
    "checkpoints:read",
    "checkpoints:write",
    "stations:read",
    "stations:write",
    "routes:read",
    "routes:write",
    "reports:read",
    "reports:write",
    "vehicles:read",
    "vehicles:write",
    "analytics:read",
    "settings:read",
    "settings:write",
    "templates:read",
    "templates:write",
    "moderation:read",
    "moderation:write",
    "audit:read",
  ],
  moderator: [
    "dashboard:read",
    "checkpoints:read",
    "routes:read",
    "reports:read",
    "reports:write",
    "vehicles:read",
    "analytics:read",
    "moderation:read",
    "moderation:write",
  ],
  upf_liaison: [
    "dashboard:read",
    "checkpoints:read",
    "routes:read",
    "analytics:read",
  ],
};
function can(role, permission) {
  return (
    permissions[role]?.includes("*") || permissions[role]?.includes(permission)
  );
}
async function authenticateAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token)
      return res.status(401).json({ error: "Authentication required" });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user)
      return res.status(401).json({ error: "Invalid or expired session" });
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!admin)
      return res
        .status(403)
        .json({ error: "This account has no SafeRide admin access" });
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}
function requirePermission(permission) {
  return (req, res, next) =>
    can(req.admin.role, permission)
      ? next()
      : res.status(403).json({ error: "Insufficient permission" });
}
module.exports = { authenticateAdmin, requirePermission, can };
