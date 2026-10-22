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
          <span>石を撮影して、等級を判定します</span>
        </button>
        <button className="start-choice" onClick={onTrain}>
          <strong>学習する</strong>
          <span>石の写真を集めて、判定モデルを育てます</span>
        </button>
      </div>

      <p className="start-note">写真はこの端末の中だけで処理され、どこにも送信されません</p>
    </div>
  );
}
