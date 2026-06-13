import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { verify_password } from "./password_service.js";
import { create_session_token, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./session_service.js";
import { get_user_by_email } from "./user_repository.js";
import { home_for_user } from "./auth_middleware.js";

// Solo paths relativos del mismo sitio: evita open redirects vía ?next=.
function safe_next_url(value) {
  const next = String(value ?? "");

  return next.startsWith("/") && !next.startsWith("//") ? next : "";
}

export function register_auth_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;
  const enabled = dependencies.enabled ?? config.auth_enabled;

  router.get("/login", (request, response) => {
    if (!enabled) {
      response.redirect("/dashboard");
      return;
    }

    if (request.current_user) {
      response.redirect(home_for_user(request.current_user));
      return;
    }

    response.render("login", { error_message: null, next_url: safe_next_url(request.query.next) });
  });

  router.post("/login", async (request, response, next) => {
    if (!enabled) {
      response.redirect("/dashboard");
      return;
    }

    try {
      const email = String(request.body?.email ?? "").trim().toLowerCase();
      const password = String(request.body?.password ?? "");
      const next_url = safe_next_url(request.body?.next);
      const user = email ? await get_user_by_email(route_pool, email) : null;

      if (!user || !user.password_hash || !verify_password(password, user.password_hash)) {
        response.status(401).render("login", {
          error_message: "Email o contraseña incorrectos.",
          next_url,
        });
        return;
      }

      response.cookie(SESSION_COOKIE_NAME, create_session_token(user.id), {
        httpOnly: true,
        sameSite: "lax",
        secure: config.node_env === "production",
        maxAge: SESSION_TTL_MS,
        path: "/",
      });
      response.redirect(next_url || home_for_user(user));
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (_request, response) => {
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    response.redirect("/login");
  });
}
