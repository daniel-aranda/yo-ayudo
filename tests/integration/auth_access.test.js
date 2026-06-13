import express from "express";
import path from "node:path";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { create_auth_policy, create_current_user_middleware } from "../../src/auth/auth_middleware.js";
import { register_auth_routes } from "../../src/auth/auth_routes.js";
import { register_admin_routes } from "../../src/admin/admin_routes.js";
import { create_test_pool } from "../helpers/test_pool.js";

// App con auth FORZADO (enabled: true) y rutas protegidas stub: aquí se prueba
// el contrato de la política, no las vistas del dashboard.
function create_auth_test_app(pool, { enabled = true } = {}) {
  const app = express();
  const router = express.Router();
  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.use(express.urlencoded({ extended: false }));
  app.use(create_current_user_middleware({ pool, enabled }));
  app.use(create_auth_policy({ enabled }));
  register_auth_routes(router, { pool, enabled });
  router.get("/health", (_request, response) => response.json({ ok: true }));
  router.get("/dashboard", (_request, response) => response.send("dashboard global"));
  router.get("/dashboard/business/:business_id", (request, response) =>
    response.send(`negocio ${request.params.business_id}`),
  );
  router.get("/admin/businesses", (_request, response) => response.send("admin negocios"));
  app.use(router);
  return app;
}

function session_cookie_from(response) {
  const header = response.headers["set-cookie"]?.[0] ?? "";
  return header.split(";")[0];
}

describe("auth por negocio", () => {
  let pool;

  before_each(async () => {
    pool = await create_test_pool();
  });

  after_each(async () => {
    await pool?.end();
  });

  it("redirects anonymous visitors to /login and keeps public paths open", async () => {
    const app = create_auth_test_app(pool);

    await request(app).get("/health").expect(200);
    await request(app).get("/login").expect(200).expect(/Iniciar sesión/);
    const redirected = await request(app).get("/dashboard").expect(302);
    expect(redirected.headers.location).toBe("/login?next=%2Fdashboard");
  });

  it("logs the platform owner into the global dashboard with access to everything", async () => {
    const app = create_auth_test_app(pool);

    await request(app)
      .post("/login")
      .type("form")
      .send({ email: "owner@yoayudo.local", password: "mal-password" })
      .expect(401);

    const login = await request(app)
      .post("/login")
      .type("form")
      .send({ email: "owner@yoayudo.local", password: "yoayudo-owner" })
      .expect(302)
      .expect("Location", "/dashboard");
    const cookie = session_cookie_from(login);
    expect(cookie).toContain("yoayudo_session=");

    await request(app).get("/dashboard").set("Cookie", cookie).expect(200);
    await request(app).get("/admin/businesses").set("Cookie", cookie).expect(200);

    // Logout limpia la sesión.
    const logout = await request(app).post("/logout").set("Cookie", cookie).expect(302);
    expect(logout.headers["set-cookie"]?.[0]).toContain("yoayudo_session=;");
  });

  it("scopes a business user to their own business dashboard", async () => {
    const app = create_auth_test_app(pool);
    const demo_user = (
      await pool.query("SELECT organization_id FROM users WHERE email = 'demo@yoayudo.local' LIMIT 1")
    ).rows[0];
    const own_business = demo_user.organization_id;

    const login = await request(app)
      .post("/login")
      .type("form")
      .send({ email: "demo@yoayudo.local", password: "yoayudo-demo" })
      .expect(302)
      .expect("Location", `/dashboard/business/${own_business}`);
    const cookie = session_cookie_from(login);

    // Su negocio: pasa.
    await request(app).get(`/dashboard/business/${own_business}`).set("Cookie", cookie).expect(200);
    // Dashboard global y otros negocios: regresa al suyo.
    const global_redirect = await request(app).get("/dashboard").set("Cookie", cookie).expect(302);
    expect(global_redirect.headers.location).toBe(`/dashboard/business/${own_business}`);
    const foreign = await request(app)
      .get("/dashboard/business/00000000-0000-0000-0000-000000000001")
      .set("Cookie", cookie)
      .expect(302);
    expect(foreign.headers.location).toBe(`/dashboard/business/${own_business}`);
    // Herramientas internas tampoco.
    const admin_redirect = await request(app).get("/admin/businesses").set("Cookie", cookie).expect(302);
    expect(admin_redirect.headers.location).toBe(`/dashboard/business/${own_business}`);
  });

  it("keeps everything open and bounces /login when auth is disabled", async () => {
    const app = create_auth_test_app(pool, { enabled: false });

    await request(app).get("/dashboard").expect(200);
    await request(app).get("/login").expect(302).expect("Location", "/dashboard");
  });

  it("creates business users from admin and lets them log in", async () => {
    // Admin sin policy (auth apagado): la gestión de usuarios no depende del flag.
    const app = express();
    const router = express.Router();
    app.set("view engine", "pug");
    app.set("views", path.join(process.cwd(), "src", "web", "views"));
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    register_admin_routes(router, { pool });
    app.use(router);

    const organization = (await pool.query("SELECT id FROM organizations LIMIT 1")).rows[0];

    await request(app)
      .post("/admin/users")
      .type("form")
      .send({ organization_id: organization.id, name: "Vendedora Uno", email: "Vendedora@Negocio.MX", password: "secreta-123" })
      .expect(302)
      .expect("Location", "/admin/businesses");

    const created = (await pool.query("SELECT * FROM users WHERE email = 'vendedora@negocio.mx' LIMIT 1")).rows[0];
    expect(created).toBeTruthy();
    expect(created.organization_id).toBe(organization.id);
    expect(created.role).toBe("member");
    expect(created.is_platform_owner).toBe(false);

    // Email duplicado (case-insensitive) y contraseña corta → 400.
    await request(app)
      .post("/admin/users")
      .type("form")
      .send({ organization_id: organization.id, name: "Otra", email: "vendedora@negocio.mx", password: "secreta-123" })
      .expect(400);
    await request(app)
      .post("/admin/users")
      .type("form")
      .send({ organization_id: organization.id, name: "Otra", email: "otra@negocio.mx", password: "corta" })
      .expect(400);

    // La página de admin lista al usuario nuevo.
    const page = await request(app).get("/admin/businesses").expect(200);
    expect(page.text).toContain("Vendedora Uno");
    expect(page.text).toContain("vendedora@negocio.mx");
    expect(page.text).toContain("Crear usuario");

    // Y puede loguear con la política activa.
    const auth_app = create_auth_test_app(pool);
    await request(auth_app)
      .post("/login")
      .type("form")
      .send({ email: "vendedora@negocio.mx", password: "secreta-123" })
      .expect(302)
      .expect("Location", `/dashboard/business/${organization.id}`);
  });
});
