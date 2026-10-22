import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./components/Home";
import { Judge } from "./components/Judge";
import { SplitImport } from "./components/SplitImport";
import { Start } from "./components/Start";
import { StoneDetail } from "./components/StoneDetail";
import { requestPersistence } from "./db";
import { hashForRoute, routeFromHash, type Route } from "./route";
import type { Stone } from "./types";
import "./styles.css";
import "./judge.css";

/** 「学習する」の中の画面（URL には出さない） */
type TrainView = { name: "list" } | { name: "stone"; stone: Stone } | { name: "splitImport" };

function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(location.hash));
  const [train, setTrain] = useState<TrainView>({ name: "list" });

  useEffect(() => {
    requestPersistence();
    const onPop = () => setRoute(routeFromHash(location.hash));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** 画面を切り替え、履歴に積む（ブラウザの戻るボタンで前の画面に戻れる） */
  function go(next: Route) {
    if (next === route) return;
    history.pushState(null, "", hashForRoute(next) || location.pathname + location.search);
    setRoute(next);
    if (next === "train") setTrain({ name: "list" });
  }

  if (route === "judge") return <Judge onBack={() => go("start")} />;

  if (route === "train") {
    const list = () => setTrain({ name: "list" });
    if (train.name === "stone") return <StoneDetail stone={train.stone} onBack={list} />;
    if (train.name === "splitImport") return <SplitImport onDone={list} />;
    return (
      <Home
        onStart={() => go("start")}
        onOpen={(stone) => setTrain({ name: "stone", stone })}
        onJudge={() => go("judge")}
        onSplitImport={() => setTrain({ name: "splitImport" })}
      />
    );
  }

  return <Start onJudge={() => go("judge")} onTrain={() => go("train")} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
