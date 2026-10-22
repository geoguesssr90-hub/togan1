import { useEffect, useRef, useState } from "react";
import { captureFrom, captureFromFile, type Captured } from "../capture";

interface Props {
  onCaptured: (c: Captured) => void;
  onCancel: () => void;
  hint: string;
  showGuide?: boolean; // 1個判定用の「石」「基準カード」枠。まとめて撮るときは消す
  cardGuide?: boolean; // 「基準カード」の枠。判定では使わないので消し、「石」の枠を中央に置く
}

/** 背面カメラのライブ映像＋撮影ガイド。カメラが使えなければファイル選択にフォールバック */
export function Camera({ onCaptured, onCancel, hint, showGuide = true, cardGuide = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
      } catch (e) {
        setError("カメラを起動できませんでした（HTTPS接続と権限を確認）。下のボタンから写真を選べます。");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      onCaptured(await captureFrom(v, v.videoWidth, v.videoHeight));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      onCaptured(await captureFromFile(f));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="camera">
      <div className="viewport">
        {!error && <video ref={videoRef} playsInline muted />}
        {showGuide && (
          <div className="guide" aria-hidden>
            <div className={"guide-stone" + (cardGuide ? "" : " centered")}>石</div>
            {cardGuide && <div className="guide-card">基準カード</div>}
          </div>
        )}
        {error && <p className="camera-error">{error}</p>}
      </div>
      <p className="camera-hint">{hint}</p>
      <div className="camera-actions">
        <button className="ghost" onClick={onCancel}>戻る</button>
        {!error && (
          <button className="shutter" onClick={shoot} disabled={busy} aria-label="撮影">
            <span />
          </button>
        )}
        <button className="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          写真を選ぶ
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      </div>
    </div>
  );
}
