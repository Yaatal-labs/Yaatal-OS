import "./styles.css";
import { initMarcheApp } from "./app";
import { registerServiceWorker } from "./sw-register";

const root = document.getElementById("app");
if (root) {
  initMarcheApp(root);
}
registerServiceWorker();
