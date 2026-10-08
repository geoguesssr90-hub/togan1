/** 保存する写真の長辺の上限（px）。これを超える写真は縮小してから保存する */
export const MAX_LONG_SIDE = 2560;

/**
 * 長辺が maxLongSide を超える場合に、縦横比を保って収まる寸法を返す（純粋関数）。
 * 収まっている場合は元の寸法のまま（拡大はしない）。
 */
export function fitLongSide(width: number, height: number, maxLongSide = MAX_LONG_SIDE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxLongSide) return { width, height };
  const scale = maxLongSide / long;
  // 長辺はぴったり上限に、短辺は四捨五入（最低1px）
  return width >= height
    ? { width: maxLongSide, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: maxLongSide };
}
