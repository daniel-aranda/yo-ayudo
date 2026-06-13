import { config } from "../app/config.js";
import { read_session_cookie, verify_session_token } from "./session_service.js";
import { get_user_by_id } from "./user_repository.js";

// Prefijos públicos cuando el auth está activo. /internal y /webhooks tienen su
// propia protección (token interno / verificación de Meta).
const PUBLIC_PREFIXES = ["/login", "/logout", "/health", "/public/", "/webhooks/", "/internal/"];

export function is_public_path(path) {
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function home_for_user(user) {
  if (!user) {
    return "/login";
  }

  if (user.is_platform_owner) {
    return "/dashboard";
  }

  return user.organization_id ? `/dashboard/business/${user.organization_id}` : "/login";
}

// Resuelve el usuario de la cookie de sesión y lo expone en request/locals.
// Con auth apagado es un no-op: cero cambio de comportamiento.
export function create_current_user_middleware({ pool, enabled = config.auth_enabled } = {}) {
  return async (request, response, next) => {
    if (!enabled) {
      next();
      return;
    }

    try {
      const token = read_session_cookie(request);
      const session = token ? verify_session_token(token) : null;
      const user = session ? await get_user_by_id(pool, session.user_id) : null;
      request.current_user = user;
      response.locals.current_user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Política de acceso: owner de plataforma ve todo; un usuario de negocio solo
// su dashboard (/dashboard/business/:su_organization_id y subrutas). Cualquier
// otra cosa lo regresa a su negocio. Sin sesión -> /login.
export function create_auth_policy({ enabled = config.auth_enabled } = {}) {
  return (request, response, next) => {
    if (!enabled || is_public_path(request.path)) {
      next();
      return;
    }

    const user = request.current_user;

    if (!user) {
      response.redirect(`/login?next=${encodeURIComponent(request.originalUrl)}`);
      return;
    }

    if (user.is_platform_owner) {
      next();
      return;
    }

    if (!user.organization_id) {
      response.status(403).send("Tu usuario no tiene un negocio asignado.");
      return;
    }

    const business_scope = request.path.match(/^\/dashboard\/business\/([^/]+)/);

    if (business_scope && business_scope[1] === user.organization_id) {
      next();
      return;
    }

    response.redirect(home_for_user(user));
  };
}
