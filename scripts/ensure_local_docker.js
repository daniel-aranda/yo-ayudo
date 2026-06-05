import { ensure_local_docker_runtime } from "../src/app/local_docker.js";

function log(message) {
  process.stdout.write(`[local-docker] ${message}\n`);
}

try {
  ensure_local_docker_runtime({ log });
} catch (error) {
  process.stderr.write(`[local-docker] ${error instanceof Error ? error.message : "Unknown Docker runtime failure"}\n`);
  process.exit(1);
}
