import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
document.documentElement.dataset.mode =
  new URLSearchParams(location.search).get("mode") === "tab" ? "tab" : "popup";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
