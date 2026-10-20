# 陶眼（TŌGAN）データ収集アプリ

天草陶石の等級をスマホ写真から判定するシステム。学習データの収集と、ブラウザ内での試作判定を行う。

## 背景
- 現場（上田陶石）の等級判定は目視。基準は「白さ」「縞の有無」など。
- 判定は乾燥写真のみで行い、湿潤写真は使わない。褐色化は濡らしてから数週間後に現れるため、その場で撮った湿潤写真では捉えられない。
- 旧版（togan-demo2）はルールベースで、表面の影を鉄斑と誤認した。→ 撮影条件の標準化と機械学習に移行する。
- 手元のデータは2〜4等級×各6個程度と少ない。1個の石から向きを変えて多数枚撮る。面（A面など）の記録はやめた。

## 全体ロードマップ
1. データ収集アプリ（このリポジトリ）← 現在。試作の判定機能も含む
2. 手持ちの石を撮影してデータセット化
3. 学習（Python、MobileNetV3等の転移学習）。**train/test は必ず石ID単位で分割**（同じ石が両方に入るとリーク）
4. TF.js / ONNX に変換してブラウザ内推論。CNN出力に加え「白さ」「縞」を根拠として表示

## 判定（試作）
- モデル: 乾燥写真1枚から取る6つの特徴量（L, a, b, Lstd, spotRatio, texture）による多クラス・ロジスティック回帰。検証は石単位の1個抜き
- 1個ずつ: 石を1枚撮って判定
- まとめて: 暗い背景に石を隙間をあけて並べ、表と裏の2枚を撮る（裏は省略可）。1個ずつ切り出し、番号順に表と裏を対応させる。総合は悪い方の等級
- 未確認の前提: 等級は数字が大きいほど品質が低い（`worseGrade`）。現場の区分と合っているか要確認

## 技術
- Vite + React 18 + TypeScript。サーバなし、データは IndexedDB（idb）に保存。学習済みモデルは localStorage
- `npm run dev` / `npm test`（vitest）/ `npm run build`
- カメラは getUserMedia（HTTPS必須）。失敗時は `<input capture>` にフォールバック

## 構成
- `src/types.ts` 等級リスト（GRADES）・データ型。`condition` の `"wet"` と `face` は既存データとの互換のためだけに残している
- `src/quality.ts` 画質指標（ピント=ラプラシアン分散、白飛び、黒つぶれ）と警告しきい値（暫定値）
- `src/capture.ts` フレーム→JPEG＋縮小画像で画質評価。ファイル取り込み時は長辺2560pxまで縮小
- `src/resize.ts` 長辺上限に収める寸法計算（純粋関数）
- `src/db.ts` IndexedDB
- `src/exportZip.ts` 学習用ZIP: `images/grade_{等級}/{石ID}/{dry|wet}_{連番}.jpg` + `metadata.csv` + `stones.csv`
- `src/features.ts` 特徴量の抽出（1個判定の `extractFeatures`、まとめて判定の切り出し `segmentStones`）
- `src/model.ts` ロジスティック回帰の学習・予測
- `src/batch.ts` まとめて判定の石ごとの判定、表と裏の対応付け、`worseGrade`
- `src/analyze.ts` ブラウザ側の画像解析、学習データの収集、モデルの保存・読み込み
- `src/split.ts` 写真を撮影順に並べて「石1個につきN枚」ずつ新しい石IDへ振り分ける（純粋関数）
- `src/selection.ts` まとめて削除の選択操作（等級ごとの選択、削除件数の集計、「すべて削除」の確認文字列）
- `src/components/` Home（一覧・集計・書き出し）/ StoneDetail（撮影設定・ギャラリー）/ Camera / BulkImport（写真のまとめて取り込み。取り込み処理本体は ImportRunner）/ SplitImport・SplitStone・SplitPreview（N枚ずつ別の石に振り分け）/ ModelPanel（学習）/ Judge・BatchJudge（判定）

## 約束事
- UI文言は日本語。絵文字は使わない
- 純粋なロジックは `src/*.ts` に置いて vitest でテストする

## 次にやる候補
- 基準カード（白・グレー）の自動検出と色補正
- 画質しきい値を実データで調整
- まとめて判定の実機確認（解析解像度、くっつき検出、表裏の番号対応）
- PWA化（Service Worker）
