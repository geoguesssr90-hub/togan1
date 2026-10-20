import { useEffect, useState } from "react";
import { makeThumbnail } from "../capture";

/** 写真の縮小サムネイルを1枚ずつ順番に作る（大きな写真を一度に読み込まないように） */
export function useThumbnails(blobs: readonly Blob[]): (string | undefined)[] {
  const [urls, setUrls] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    setUrls([]);
    (async () => {
      for (let i = 0; i < blobs.length; i++) {
        if (cancelled) return;
        let url: string;
        try {
          url = await makeThumbnail(blobs[i]);
        } catch {
          continue; // 読めない写真は空欄のまま
        }
        if (cancelled) return URL.revokeObjectURL(url);
        made.push(url);
        setUrls((prev) => {
          const next = prev.slice();
          next[i] = url;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [blobs]);
  return urls;
}

/** 1個あたりの枚数の入力欄 */
export function PerStoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label>
      1個あたりの枚数
      <input type="number" inputMode="numeric" min={1} step={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** 入力欄の文字列を枚数にする。1以上の整数でなければ null */
export function parsePerStone(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export interface PreviewRow {
  stoneId: string;
  photos: number[]; // サムネイルの番号（thumbs の添字）
}

interface Props {
  rows: PreviewRow[];
  thumbs: (string | undefined)[];
  perStone: number;
  total: number;
  remainder: number;
}

/** 石IDごとに1行、割り当てる写真を並べる。別の石が混ざっていないかを目で確かめるための画面 */
export function SplitPreview({ rows, thumbs, perStone, total, remainder }: Props) {
  return (
    <>
      <p className="meta">
        {total}枚 → 石 {rows.length} 個（{perStone}枚ずつ）
      </p>
      {remainder > 0 && (
        <p className="warnings warn">
          写真が{total}枚で、{perStone}枚ずつに割り切れません。最後の {rows[rows.length - 1].stoneId} は{remainder}
          枚だけになります。撮り忘れや余分な写真がないか確認してください。
        </p>
      )}
      <p className="tip">各行に同じ石の写真だけが並んでいるか確認してください。ずれている場合は、枚数を直すか、写真を選び直してください。</p>
      <ul className="split-rows">
        {rows.map((r) => (
          <li key={r.stoneId} className="split-row">
            <strong>{r.stoneId}</strong>
            <div className="split-thumbs" style={{ gridTemplateColumns: `repeat(${perStone}, minmax(0, 1fr))` }}>
              {r.photos.map((i) =>
                thumbs[i] ? <img key={i} src={thumbs[i]} alt={`${r.stoneId}の写真`} /> : <span key={i} className="split-blank" />,
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
