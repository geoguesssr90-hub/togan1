# 陶眼（TŌGAN）データ収集アプリ

天草陶石の等級をスマホ写真から判定するシステムの、第1段階＝学習データ収集アプリ。

## 背景
- 現場（上田陶石）の等級判定は目視。基準は「白さ」「縞の有無」「水に濡らすと褐色化するか」。
- 旧版（togan-demo2）はルールベースで、表面の影を鉄斑と誤認した。→ 撮影条件の標準化と機械学習に移行する。
- 手元のデータは2〜4等級×各6個程度と少ない。1個の石から面・乾湿を変えて多数枚撮る。

## 全体ロードマップ
1. データ収集アプリ（このリポジトリ）← 現在
2. 手持ちの石を撮影してデータセット化
3. 学習（Python、MobileNetV3等の転移学習）。**train/test は必ず石ID単位で分割**（同じ石が両方に入るとリーク）
4. TF.js / ONNX に変換してブラウザ内推論。CNN出力に加え「白さ」「縞」「乾湿の色差（褐色化）」を根拠として表示

## 技術
- Vite + React 18 + TypeScript。サーバなし、データは IndexedDB（idb）に保存
- `npm run dev` / `npm test`（vitest）/ `npm run build`
- カメラは getUserMedia（HTTPS必須）。失敗時は `<input capture>` にフォールバック

## 構成
- `src/types.ts` 等級リスト（GRADES）・データ型
- `src/quality.ts` 画質指標（ピント=ラプラシアン分散、白飛び、黒つぶれ）と警告しきい値（暫定値）
- `src/capture.ts` フレーム→JPEG＋縮小画像で画質評価。ファイル取り込み時は長辺2560pxまで縮小
- `src/resize.ts` 長辺上限に収める寸法計算（純粋関数）
- `src/db.ts` IndexedDB
- `src/exportZip.ts` 学習用ZIP: `images/grade_{等級}/{石ID}/{dry|wet}_{連番}.jpg` + `metadata.csv` + `stones.csv`
- `src/components/` Home（一覧・集計・書き出し）/ StoneDetail（撮影設定・ギャラリー）/ Camera / BulkImport（写真のまとめて取り込み）

## 約束事
- UI文言は日本語。絵文字は使わない
- 純粋なロジックは `src/*.ts` に置いて vitest でテストする

## 次にやる候補
- 基準カード（白・グレー）の自動検出と色補正
- 乾湿ペアの対応付け（同じ面の乾燥/湿潤をペアIDで紐付け）
- 画質しきい値を実データで調整
- PWA化（Service Worker）
