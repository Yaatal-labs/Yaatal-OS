import { installKairmelBridge } from "./kairmel-bridge";

// This is the file a mini-app actually loads:
//   <script type="module" src="https://<marche-host>/kairmel-bridge.js"></script>
// It has one job: install `window.kairmel` and get out of the way.
installKairmelBridge();
