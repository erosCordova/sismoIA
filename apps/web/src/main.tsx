import { StrictMode } from "react";



import { createRoot } from "react-dom/client";



import App from "./App";



import AuthGate from "./AuthGate";



import "./index.css";



createRoot(document.getElementById("root")!).render(



  <StrictMode><AuthGate><App /></AuthGate></StrictMode>



);





import "./sismoia-theme-enterprise.css";

import "./sismoia-theme-global-premium.css";
import "./sismoia-cards-dashboard.css";
