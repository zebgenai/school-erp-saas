import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import jsQR from "jsqr";
import { api } from "@/lib/api";
import { Button, TextInput } from "@/components/form";
import { cn } from "@/lib/utils";
import {
  formatWorkingHours,
  type TeacherPunchScanResult,
} from "@/lib/teacher-attendance-ui";

export type QrScannerMode = "student" | "teacher";

type StudentScanResponse = {
  result: "SUCCESS" | "DUPLICATE" | "INVALID" | "REVOKED" | "INACTIVE_STUDENT";
  message: string;
  status?: string;
  duplicate?: boolean;
};

const SCAN_DEBOUNCE_MS = 2500;
/** Cap decode resolution so jsQR stays responsive on HD webcam feeds. */
const MAX_DECODE_WIDTH = 640;

type Props = {
  mode?: QrScannerMode;
  /** Optional callback after a scan completes (success or business result). */
  onResult?: (result: StudentScanResponse | TeacherPunchScanResult) => void;
};

/**
 * Shared camera + jsQR scanner.
 * - student → POST /attendance/qr-scan with `{ token }` (CC1.)
 * - teacher → POST /attendance/teachers/qr-scan with `{ qrToken }` (TCC1.)
 */
export function QrAttendanceScanner({ mode = "student", onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentBanner, setStudentBanner] = useState<StudentScanResponse | null>(null);
  const [teacherBanner, setTeacherBanner] = useState<TeacherPunchScanResult | null>(null);
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

  // Reset banners when mode changes; stop camera so the wrong endpoint isn't hit mid-scan.
  useEffect(() => {
    stop();
    setStudentBanner(null);
    setTeacherBanner(null);
    setError(null);
    setManual("");
    lastRef.current = { token: "", at: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode switch reset
  }, [mode]);

  const submitToken = async (raw: string) => {
    const token = raw.trim();
    if (!token || busy) return;
    const now = Date.now();
    // Client debounce is UX-only; backend 10-minute / unique rules are authoritative.
    if (lastRef.current.token === token && now - lastRef.current.at < SCAN_DEBOUNCE_MS) return;
    lastRef.current = { token, at: now };
    setBusy(true);
    try {
      if (mode === "teacher") {
        const res = await api.post<TeacherPunchScanResult>("/attendance/teachers/qr-scan", {
          qrToken: token,
        });
        setTeacherBanner(res);
        setStudentBanner(null);
        setError(null);
        onResult?.(res);
      } else {
        const res = await api.post<StudentScanResponse>("/attendance/qr-scan", { token });
        setStudentBanner(res);
        setTeacherBanner(null);
        setError(null);
        onResult?.(res);
      }
    } catch (e: any) {
      if (mode === "teacher") {
        const fail: TeacherPunchScanResult = {
          result: "INVALID_CARD",
          message: e?.message || "Invalid or inactive teacher QR code.",
        };
        setTeacherBanner(fail);
        onResult?.(fail);
      } else {
        const fail: StudentScanResponse = {
          result: "INVALID",
          message: e?.message || "Invalid or inactive QR code.",
        };
        setStudentBanner(fail);
        onResult?.(fail);
      }
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
    stop();
    setError(null);
    setStudentBanner(null);
    setTeacherBanner(null);
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

  const studentTone =
    studentBanner?.result === "SUCCESS"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : studentBanner?.result === "DUPLICATE"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : studentBanner
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "";

  return (
    <div className="space-y-4">
      {mode === "teacher" && (
        <div>
          <h3 className="font-semibold text-base">Teacher Attendance</h3>
          <p className="text-sm text-muted-foreground">Scan Teacher ID Card</p>
        </div>
      )}
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
      {mode === "student" && studentBanner && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", studentTone)}>
          {studentBanner.message}
        </div>
      )}
      {mode === "teacher" && teacherBanner && <TeacherScanResultBanner result={teacherBanner} />}
      <form
        className="flex gap-2 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          submitToken(manual);
        }}
      >
        <TextInput
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={mode === "teacher" ? "Or paste a TCC1 teacher QR token" : "Or paste a QR token"}
        />
        <Button type="submit" variant="outline" loading={busy}>
          {mode === "teacher" ? "Punch" : "Mark"}
        </Button>
      </form>
    </div>
  );
}

export function TeacherScanResultBanner({ result }: { result: TeacherPunchScanResult }) {
  const tone =
    result.result === "CHECK_IN" || result.result === "CHECK_OUT"
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : result.result === "ALREADY_CHECKED_IN"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : result.result === "ALREADY_COMPLETED"
          ? "bg-sky-50 text-sky-900 border-sky-200"
          : "bg-rose-50 text-rose-900 border-rose-200";

  const title =
    result.result === "CHECK_IN"
      ? "✅ Checked In"
      : result.result === "CHECK_OUT"
        ? "✅ Checked Out"
        : result.result === "ALREADY_CHECKED_IN"
          ? "⚠️ Already Checked In"
          : result.result === "ALREADY_COMPLETED"
            ? "ℹ️ Attendance Already Completed"
            : result.result === "INACTIVE_TEACHER"
              ? "❌ Teacher is inactive"
              : "❌ Invalid Teacher Card";

  const fmt = (iso?: string | Date | null) => {
    if (!iso) return "—";
    const d = typeof iso === "string" ? new Date(iso) : iso;
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm space-y-1 max-w-xl", tone)}>
      <div className="font-semibold text-base">{title}</div>
      {result.teacher?.fullName && <div className="font-medium">{result.teacher.fullName}</div>}
      {(result.teacher?.employeeNo || result.teacher?.designation) && (
        <div className="text-xs opacity-80">
          {[result.teacher.employeeNo && `Emp. ${result.teacher.employeeNo}`, result.teacher.designation]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      {result.result === "CHECK_IN" && (
        <div>Check-in time: {fmt(result.checkInAt)}</div>
      )}
      {result.result === "ALREADY_CHECKED_IN" && (
        <>
          <div>Check-in time: {fmt(result.checkInAt)}</div>
          <div>Check-out available after 10 minutes</div>
          {result.remainingSeconds != null && (
            <div className="text-xs opacity-80">
              ~{Math.ceil(result.remainingSeconds / 60)} min remaining
            </div>
          )}
        </>
      )}
      {result.result === "CHECK_OUT" && (
        <>
          <div>Check-in: {fmt(result.checkInAt)}</div>
          <div>Check-out: {fmt(result.checkOutAt)}</div>
          <div>Working Hours: {formatWorkingHours(result.workingMinutes)}</div>
        </>
      )}
      {result.result === "ALREADY_COMPLETED" && (
        <>
          <div>Check-in: {fmt(result.checkInAt)}</div>
          <div>Check-out: {fmt(result.checkOutAt)}</div>
          {result.workingMinutes != null && (
            <div>Working Hours: {formatWorkingHours(result.workingMinutes)}</div>
          )}
        </>
      )}
      {!result.teacher && result.message && <div>{result.message}</div>}
    </div>
  );
}

// Re-export for callers that import the helper from this module.
export { createScannerLoopController } from "@/lib/qr-scanner-lifecycle";
