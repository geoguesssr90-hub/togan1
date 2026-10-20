import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./components/Home";
import { Judge } from "./components/Judge";
import { SplitImport } from "./components/SplitImport";
import { StoneDetail } from "./components/StoneDetail";
import { requestPersistence } from "./db";
import type { Stone } from "./types";
import "./styles.css";
import "./judge.css";

type View = { name: "home" } | { name: "stone"; stone: Stone } | { name: "judge" } | { name: "splitImport" };

function App() {
  const [view, setView] = useState<View>({ name: "home" });
  useEffect(() => {
    requestPersistence();
  }, []);
  const home = () => setView({ name: "home" });
  if (view.name === "stone") return <StoneDetail stone={view.stone} onBack={home} />;
  if (view.name === "judge") return <Judge onBack={home} />;
  if (view.name === "splitImport") return <SplitImport onDone={home} />;
  return (
    <Home
      onOpen={(stone) => setView({ name: "stone", stone })}
      onJudge={() => setView({ name: "judge" })}
      onSplitImport={() => setView({ name: "splitImport" })}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
