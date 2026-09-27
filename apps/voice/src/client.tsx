import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Call } from "./call.tsx";
import { installAudioTaps } from "./visualizer.ts";
import "./styles.css";

// The standalone call page. The landing page opens the same call through embed.tsx.
installAudioTaps();
createRoot(document.getElementById("root")!).render(<StrictMode><Call /></StrictMode>);
