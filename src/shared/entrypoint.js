import { pathToFileURL as path_to_file_url } from "node:url";

export function is_entrypoint(meta_url) {
  return Boolean(process.argv[1] && meta_url === path_to_file_url(process.argv[1]).href);
}
