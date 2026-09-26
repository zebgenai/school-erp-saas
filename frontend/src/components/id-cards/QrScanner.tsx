import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import jsQR from "jsqr";
import { api } from "@/lib/api";
import { Button, TextInput } from "@/components/form";
import { cn } from "@/lib/utils";

type ScanResponse = {
  result: "SUCCESS" | "DUPLICATE" | "INVALID" | "REVOKED" | "INACTIVE_STUDENT";
  message: string;
  status?: string;
  duplicate?: boolean;
};

const SCAN_DEBOUNCE_MS = 2500;
/** Cap decode resolution so jsQR stays responsive on HD webcam feeds. */
const MAX_DECODE_WIDTH = 640;

export function QrAttendanceScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<ScanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const lastRef = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  const clearRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stop = () => {
    // Bump generation so any in-flight tick exits without scheduling another frame.
    loopGenerationRef.current += 1;
    clearRaf();
    stopStream();
    if (mountedRef.current) setRunning(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  const submitToken = async (raw: string) => {
    const token = raw.trim();
    if (!token || busy) return;
    const now = Date.now();
    // Client debounce is UX-only; DB unique attendance constraint is the real protection.
    if (lastRef.current.token === token && now - lastRef.current.at < SCAN_DEBOUNCE_MS) return;
    lastRef.current = { token, at: now };
    setBusy(true);
    try {
      const res = await api.post<ScanResponse>("/attendance/qr-scan", { token });
      setBanner(res);
      setError(null);
    } catch (e: any) {
      setBanner({ result: "INVALID", message: e?.message || "Invalid or inactive QR code." });
    } finally {
      setBusy(false);
    }
  };

  const decodeVideoFrame = (video: HTMLVideoElement): string | null => {
    if (video.readyState < 2 || video.videoWidth < 2 || video.videoHeight < 2) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
    const width = Math.max(1, Math.floor(video.videoWidth * scale));
    const height = Math.max(1, Math.floor(video.videoHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    return code?.data?.trim() ? code.data : null;
  };

  const start = async () => {
    // Restart must not overlap prior detection loops.
    stop();
    setError(null);
    setBanner(null);
    const generation = loopGenerationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (generation !== loopGenerationRef.current || !mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (generation !== loopGenerationRef.current || !mountedRef.current) {
        stopStream();
        return;
      }
      setRunning(true);

      const tick = async () => {
        if (generation !== loopGenerationRef.current || !streamRef.current) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const value = decodeVideoFrame(video);
          if (value && generation === loopGenerationRef.current) {
            await submitToken(value);
          }
        } catch {
          /* decoder/canvas glitches must not crash the page — keep scanning */
        }
        if (generation === loopGenerationRef.current && streamRef.current) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError("Could not open the camera. Allow camera permission, or paste the QR token below.");
    }
  };

  const tone =
    banner?.result === "SUCCESS"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : banner?.result === "DUPLICATE"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : banner
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "";

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden border bg-black aspect-video max-w-xl">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {!running && (
          <div className="absolute inset-0 grid place-items-center text-white/80 text-sm">Camera idle</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!running ? (
          <Button type="button" onClick={start}>
            <Camera className="size-4" /> Start scanner
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={stop}>
            <CameraOff className="size-4" /> Stop
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-amber-700">{error}</p>}
      {banner && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", tone)}>{banner.message}</div>
      )}
      <form
        className="flex gap-2 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          submitToken(manual);
        }}
      >
        <TextInput value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or paste a QR token" />
        <Button type="submit" variant="outline" loading={busy}>
          Mark
        </Button>
      </form>
    </div>
  );
}

// Re-export for callers that import the helper from this module.
export { createScannerLoopController } from "@/lib/qr-scanner-lifecycle";
