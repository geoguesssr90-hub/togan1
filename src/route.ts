/** 画面の切り替えを URL のハッシュで表す（ブラウザの戻るボタンで最初の画面に戻れるように） */
export type Route = "start" | "judge" | "train";

/** location.hash から画面を決める。知らないハッシュは最初の画面 */
export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  return h === "judge" || h === "train" ? h : "start";
}

/** 画面に対応する URL のハッシュ部分（最初の画面はハッシュなし） */
export function hashForRoute(route: Route): string {
  return route === "start" ? "" : `#${route}`;
}
