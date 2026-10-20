import { useEffect, useState } from "react";
import { makeThumbnail } from "../capture";
import { toggled } from "../selection";
import { excludeItems, moveToNewRow, moveToRow, shiftEarlier, shiftLater, type Plan } from "../split";

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

interface Props {
  plan: Plan;
  onChange: (plan: Plan) => void;
  ids: string[]; // 行ごとの石ID（plan.rows と同じ順）
  thumbs: (string | undefined)[];
  perStone: number;
  /** 除外の呼び方（新規取り込みなら「取り込まない」、分け直しなら「元の石に残す」） */
  excludeLabel: string;
}

/**
 * 振り分けの確認と手直し。石IDごとに1行、割り当てる写真を並べる。
 * 写真をタップして選び、「ここへ移す」で別の行へ移す（2タップ方式）。ここでは何も保存しない。
 */
export function SplitPreview({ plan, onChange, ids, thumbs, perStone, excludeLabel }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selecting = selected.size > 0;
  const total = plan.rows.reduce((s, r) => s + r.length, 0) + plan.excluded.length;
  const offRows = plan.rows.filter((r) => r.length !== perStone).length;

  function apply(next: Plan) {
    onChange(next);
    setSelected(new Set());
  }

  const thumbsOf = (items: number[], label: string) => (
    <div className="split-thumbs" style={{ gridTemplateColumns: `repeat(${perStone}, minmax(0, 1fr))` }}>
      {items.map((i) => {
        const on = selected.has(i);
        return (
          <button
            key={i}
            className="shot-select"
            aria-pressed={on}
            aria-label={`${label}の写真${on ? "（選択中）" : ""}`}
            onClick={() => setSelected((sel) => toggled(sel, i))}
          >
            {thumbs[i] ? <img src={thumbs[i]} alt="" /> : <span className="split-blank" />}
            {on && <span className="tick" aria-hidden>選択</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <p className="meta">
        {total}枚 → 石 {plan.rows.length} 個（{perStone}枚ずつ）
        {plan.excluded.length > 0 && `・${excludeLabel} ${plan.excluded.length}枚`}
      </p>
      {offRows > 0 && (
        <p className="warnings warn">
          {perStone}枚でない行が {offRows} 行あります（色の付いた行）。撮り忘れや余分な写真がないか確認してください。
        </p>
      )}
      <p className="tip">
        各行に同じ石の写真だけが並んでいるか確認してください。写真をタップして選び、行の「ここへ移す」で移せます。
        1か所のずれで後ろがすべてずれた場合は「ここから後ろを1枚前へ／後ろへ」で直せます。
      </p>
      <ul className="split-rows">
        {plan.rows.map((r, k) => (
          <li key={ids[k]} className={"split-row" + (r.length !== perStone ? " off" : "")}>
            <div className="split-row-head">
              <strong>{ids[k]}</strong>
              <span className="split-count">{r.length}枚</span>
              {!selecting && (
                <span className="split-shift">
                  {k > 0 && (
                    <button className="x" onClick={() => apply(shiftEarlier(plan, k))}>ここから後ろを1枚前へ</button>
                  )}
                  <button className="x" onClick={() => apply(shiftLater(plan, k, perStone))}>ここから後ろを1枚後ろへ</button>
                </span>
              )}
            </div>
            <div className="split-row-body">
              {thumbsOf(r, ids[k])}
              {selecting && (
                <button className="small" onClick={() => apply(moveToRow(plan, selected, k))}>ここへ移す</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {plan.rows.length === 0 && <p className="warnings bad">取り込む写真がありません。</p>}

      {plan.excluded.length > 0 && (
        <section>
          <h3>{excludeLabel}写真（{plan.excluded.length}枚）</h3>
          <p className="tip">タップで選び、行の「ここへ移す」か「新しい石にする」で戻せます。</p>
          {thumbsOf(plan.excluded, excludeLabel)}
        </section>
      )}

      {selecting && (
        <>
          <div className="select-bar-spacer" />
          <div className="select-bar">
            <div className="split-bar">
              <span className="meta">{selected.size}枚を選択中</span>
              <div className="row">
                <button onClick={() => apply(moveToNewRow(plan, selected))}>新しい石にする</button>
                <button onClick={() => apply(excludeItems(plan, selected))}>{excludeLabel}</button>
                <button className="ghost" onClick={() => setSelected(new Set())}>選択を解除</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
