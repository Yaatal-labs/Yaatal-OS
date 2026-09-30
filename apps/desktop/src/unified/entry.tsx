import { createRoot } from "react-dom/client";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/newsreader/400.css";
import "./styles.css";
import { App } from "./App";
const element = document.getElementById("app");
if (element) createRoot(element).render(<App />);
