/** 最初の画面: 「判定する」「学習する」の2つから選ぶ（QRコードから初めて開く人向け） */
export function Start({ onJudge, onTrain }: { onJudge: () => void; onTrain: () => void }) {
  return (
    <div className="screen start">
      <header className="start-head">
        <h1>陶眼</h1>
        <p>天草陶石の等級をスマホで判定</p>
      </header>

      <div className="start-choices">
        <button className="start-choice primary" onClick={onJudge}>
          <strong>判定する</strong>
        </button>
        <button className="start-choice" onClick={onTrain}>
          <strong>学習する</strong>
        </button>
      </div>

      {/* 狭い画面では「、」の後で折り返す（語の途中で1〜2文字だけ次の行に残らないように） */}
      <p className="start-note">
        <span>写真はこの端末の中だけで処理され、</span>
        <span>どこにも送信されません</span>
      </p>
    </div>
  );
}
