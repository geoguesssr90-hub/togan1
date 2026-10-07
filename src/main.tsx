import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./components/Home";
import { StoneDetail } from "./components/StoneDetail";
import { requestPersistence } from "./db";
import type { Stone } from "./types";
import "./styles.css";

function App() {
  const [stone, setStone] = useState<Stone | null>(null);
  useEffect(() => {
    requestPersistence();
  }, []);
  return stone ? <StoneDetail stone={stone} onBack={() => setStone(null)} /> : <Home onOpen={setStone} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
