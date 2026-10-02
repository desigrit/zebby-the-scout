import React from "react";
import { createRoot } from "react-dom/client";
import "./base.css";
import "./desktop.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
