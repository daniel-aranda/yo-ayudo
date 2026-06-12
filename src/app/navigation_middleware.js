// Top-nav state shared by every view via response.locals:
// - active_nav: highlights the current section (derived from the first path segment).
// - nav_context: when a business + account are in context, the top nav
//   (Dashboard/Inspector/Review) stays scoped to that account. Admin is global
//   (intentionally unscoped). Context comes from the account dashboard path or
//   from ?business=&account= on the scoped sections.
export function navigation_context(request, response, next) {
  const request_path = request.path || "";

  response.locals.active_nav = request_path.startsWith("/dashboard")
    ? "dashboard"
    : request_path.startsWith("/inspector")
      ? "inspector"
      : request_path.startsWith("/review")
        ? "review"
        : request_path.startsWith("/admin")
          ? "admin"
          : "";

  const account_path = request_path.match(/^\/dashboard\/business\/([^/]+)\/accounts\/([^/]+)/);
  if (account_path) {
    response.locals.nav_context = { business_id: account_path[1], account_id: account_path[2] };
  } else if (request.query.business && request.query.account) {
    response.locals.nav_context = {
      business_id: String(request.query.business),
      account_id: String(request.query.account),
    };
  } else {
    response.locals.nav_context = null;
  }

  next();
}
