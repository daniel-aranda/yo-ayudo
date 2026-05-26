import { config } from "../app/config.js";

export function dashboard_auth(request, response, next) {
  if (config.node_env !== "production") {
    next();
    return;
  }

  if (request.header("x-yoayudo-internal") === "true") {
    next();
    return;
  }

  response.status(401).send("Authentication required");
}
