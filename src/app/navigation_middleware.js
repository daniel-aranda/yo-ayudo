// Top-nav state shared by every view via response.locals:
// - active_nav: highlights the current section (derived from the first path segment).
// - nav_context: when an account is in context, the top nav
//   (Dashboard/Inspector/Review) stays scoped to that account. Admin is global
//   (intentionally unscoped). The account is the single source of truth: the URLs
//   are /dashboard/accounts/:id and /inspector/accounts/:id (el negocio se deriva
//   de la cuenta, no viaja en la URL). Review usa ?account= en el query.
export function navigation_context(request, response, next) {
  const request_path = request.path || "";

  // Las páginas de cuenta Bots/Canales viven bajo /dashboard pero resaltan su
  // propio item del nav (no "Dashboard"). El resto de /dashboard/* (incluida la
  // review a nivel cuenta) resalta "dashboard".
  const account_subpage = request_path.match(/^\/dashboard\/accounts\/[^/]+\/(bots|channels)\b/);
  response.locals.active_nav = account_subpage
    ? account_subpage[1] === "channels" ? "canales" : "bots"
    : request_path.startsWith("/dashboard")
      ? "dashboard"
      : request_path.startsWith("/inspector")
        ? "inspector"
        : request_path.startsWith("/review")
          ? "review"
          : request_path.startsWith("/admin")
            ? "admin"
            : "";

  const account_path = request_path.match(/^\/(?:dashboard|inspector)\/accounts\/([^/]+)/);
  if (account_path) {
    response.locals.nav_context = { account_id: account_path[1] };
  } else if (request.query.account) {
    const account = Array.isArray(request.query.account) ? request.query.account[0] : request.query.account;
    response.locals.nav_context = account ? { account_id: String(account) } : null;
  } else {
    response.locals.nav_context = null;
  }

  next();
}
