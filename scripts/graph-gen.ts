import { getProjectRoot, loadEnvFile } from "../src/config.js";
import { generateProjectGraph } from "../src/graph/generate.js";
import { saveProjectGraph } from "../src/graph/store.js";

loadEnvFile();

const projectRoot = getProjectRoot();
const graph = generateProjectGraph(projectRoot);
saveProjectGraph(projectRoot, graph);

const repos = graph.nodes.filter((n) => n.type === "repo").length;
console.log(
  `[graph:gen] nodes=${graph.nodes.length} edges=${graph.edges.length} repos=${repos}`,
);
