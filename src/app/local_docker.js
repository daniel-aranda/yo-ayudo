import { execFileSync as exec_file_sync } from "node:child_process";

function run_quiet(command, args) {
  try {
    return exec_file_sync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function command_exists(command) {
  return run_quiet("sh", ["-lc", `command -v ${command}`]).length > 0;
}

function docker_daemon_is_reachable() {
  try {
    exec_file_sync("docker", ["info"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function current_docker_context() {
  return run_quiet("docker", ["context", "show"]) || "unknown";
}

export function ensure_local_docker_runtime({ log = () => undefined } = {}) {
  if (!command_exists("docker")) {
    throw new Error("Docker CLI is not installed. Install Docker Desktop or Colima before starting local PostgreSQL.");
  }

  if (docker_daemon_is_reachable()) {
    return;
  }

  const context = current_docker_context();

  if (!command_exists("colima")) {
    throw new Error(
      `Docker daemon is not reachable for context "${context}". Start Docker Desktop, then retry.`,
    );
  }

  if (context !== "colima") {
    throw new Error(
      `Docker daemon is not reachable for context "${context}". Colima is installed, but the active Docker context is not "colima". Start your Docker runtime or run "docker context use colima".`,
    );
  }

  log("Docker daemon is not reachable; attempting colima start");

  try {
    exec_file_sync("colima", ["start"], {
      stdio: "inherit",
    });
  } catch {
    throw new Error("Failed to start Colima. Run \"colima start\" manually and retry.");
  }

  if (!docker_daemon_is_reachable()) {
    throw new Error("Colima started, but Docker is still not reachable. Check \"colima status\" and retry.");
  }

  log("Docker daemon ready via Colima");
}
