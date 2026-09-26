import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import jsQR from "jsqr";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { Button, TextInput } from "@/components/form";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { ATTENDANCE_VOICE, speakAttendanceCue } from "@/lib/attendance-speech";
import { classifyAttendanceQrToken } from "@/lib/qr-attendance-classify";
import {
  formatWorkingHours,
  type TeacherPunchScanResult,
} from "@/lib/teacher-attendance-ui";

export type QrScannerMode = "student" | "teacher" | "auto";

export type StudentScanResponse = {
  result: "SUCCESS" | "DUPLICATE" | "INVALID" | "REVOKED" | "INACTIVE_STUDENT";
  message: string;
  status?: string;
  duplicate?: boolean;
  student?: { id: string; fullName: string; admissionNo?: string };
};

const SCAN_DEBOUNCE_MS = 2500;
const SUCCESS_MODAL_MS = 2500;
/** Cap decode resolution so jsQR stays responsive on HD webcam feeds. */
const MAX_DECODE_WIDTH = 640;

type Props = {
  mode?: QrScannerMode;
  /** Optional callback after a scan completes (success or business result). */
  onResult?: (result: StudentScanResponse | TeacherPunchScanResult) => void;
};

type SuccessModalState = {
  title: string;
  name: string;
  kind: "Student" | "Teacher";
  statusLine: string;
  timeLine: string;
  extraLine?: string;
};

/**
 * Shared camera + jsQR scanner.
 * - student → POST /attendance/qr-scan with `{ token }` (CC1.)
 * - teacher → POST /attendance/teachers/qr-scan with `{ qrToken }` (TCC1.)
 * - auto → classify prefix, then call the matching endpoint
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
  const [successModal, setSuccessModal] = useState<SuccessModalState | null>(null);
  const lastRef = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const modalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearModalTimer = () => {
    if (modalTimerRef.current != null) {
      clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }
  };

  const showSuccessModal = (state: SuccessModalState) => {
    clearModalTimer();
    setSuccessModal(state);
    modalTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setSuccessModal(null);
      modalTimerRef.current = null;
    }, SUCCESS_MODAL_MS);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearModalTimer();
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
    setSuccessModal(null);
    clearModalTimer();
    lastRef.current = { token: "", at: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode switch reset
  }, [mode]);

  const handleStudentResult = (res: StudentScanResponse) => {
    setStudentBanner(res);
    setTeacherBanner(null);
    setError(null);
    onResult?.(res);

    if (res.result === "SUCCESS") {
      const timeLine = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      showSuccessModal({
        title: "Attendance Marked Successfully",
        name: res.student?.fullName || "Student",
        kind: "Student",
        statusLine: res.status === "LATE" ? "Late" : "Present",
        timeLine,
      });
      speakAttendanceCue(ATTENDANCE_VOICE.studentSuccess);
      return;
    }

    if (res.result === "DUPLICATE") {
      setError("Attendance already marked.");
      speakAttendanceCue(ATTENDANCE_VOICE.alreadyMarked);
      return;
    }

    setError(res.message || "Invalid or inactive QR code.");
  };

  const handleTeacherResult = (res: TeacherPunchScanResult) => {
    setTeacherBanner(res);
    setStudentBanner(null);
    setError(null);
    onResult?.(res);

    const fmt = (iso?: string | Date | null) => {
      if (!iso) return "—";
      const d = typeof iso === "string" ? new Date(iso) : iso;
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    if (res.result === "CHECK_IN") {
      showSuccessModal({
        title: "Attendance Marked Successfully",
        name: res.teacher?.fullName || "Teacher",
        kind: "Teacher",
        statusLine: "Check In",
        timeLine: fmt(res.checkInAt),
      });
      speakAttendanceCue(ATTENDANCE_VOICE.teacherCheckIn);
      return;
    }

    if (res.result === "CHECK_OUT") {
      showSuccessModal({
        title: "Attendance Marked Successfully",
        name: res.teacher?.fullName || "Teacher",
        kind: "Teacher",
        statusLine: "Check Out",
        timeLine: fmt(res.checkOutAt),
        extraLine:
          res.workingMinutes != null
            ? `Working hours: ${formatWorkingHours(res.workingMinutes)}`
            : undefined,
      });
      speakAttendanceCue(ATTENDANCE_VOICE.teacherCheckOut);
      return;
    }

    if (res.result === "ALREADY_CHECKED_IN") {
      setError("Teacher attendance already checked in.");
      speakAttendanceCue(ATTENDANCE_VOICE.alreadyMarked);
      return;
    }

    if (res.result === "ALREADY_COMPLETED") {
      setError("Teacher attendance already completed.");
      speakAttendanceCue(ATTENDANCE_VOICE.alreadyMarked);
      return;
    }

    setError(res.message || "Invalid or inactive teacher QR code.");
  };

  const postStudent = async (token: string) => {
    try {
      const res = await api.post<StudentScanResponse>("/attendance/qr-scan", { token });
      handleStudentResult(res);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        const fail: StudentScanResponse = {
          result: "INVALID",
          message: "You are not allowed to mark student attendance.",
        };
        setStudentBanner(fail);
        setTeacherBanner(null);
        setError(fail.message);
        onResult?.(fail);
        return;
      }
      const fail: StudentScanResponse = {
        result: "INVALID",
        message: e instanceof Error ? e.message : "Invalid or inactive QR code.",
      };
      setStudentBanner(fail);
      setTeacherBanner(null);
      setError(fail.message);
      onResult?.(fail);
    }
  };

  const postTeacher = async (token: string) => {
    try {
      const res = await api.post<TeacherPunchScanResult>("/attendance/teachers/qr-scan", {
        qrToken: token,
      });
      handleTeacherResult(res);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        const fail: TeacherPunchScanResult = {
          result: "INVALID_CARD",
          message: "You are not allowed to mark teacher attendance.",
        };
        setTeacherBanner(fail);
        setStudentBanner(null);
        setError(fail.message);
        onResult?.(fail);
        return;
      }
      const fail: TeacherPunchScanResult = {
        result: "INVALID_CARD",
        message: e instanceof Error ? e.message : "Invalid or inactive teacher QR code.",
      };
      setTeacherBanner(fail);
      setStudentBanner(null);
      setError(fail.message);
      onResult?.(fail);
    }
  };

  const submitToken = async (raw: string) => {
    const token = raw.trim();
    if (!token || busy) return;
    const now = Date.now();
    // Client debounce is UX-only; backend 10-minute / unique rules are authoritative.
    if (lastRef.current.token === token && now - lastRef.current.at < SCAN_DEBOUNCE_MS) return;
    lastRef.current = { token, at: now };
    setBusy(true);
    setError(null);
    try {
      if (mode === "auto") {
        const kind = classifyAttendanceQrToken(token);
        if (kind === "teacher") {
          await postTeacher(token);
        } else if (kind === "student") {
          await postStudent(token);
        } else {
          setStudentBanner(null);
          setTeacherBanner(null);
          setError("Invalid QR code. Use a student (CC1.) or teacher (TCC1.) ID card.");
        }
        return;
      }

      if (mode === "teacher") {
        await postTeacher(token);
        return;
      }

      // Default / student — unchanged contract
      await postStudent(token);
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

  const heading =
    mode === "auto"
      ? { title: "QR Attendance", subtitle: "Scan a student or teacher ID card" }
      : mode === "teacher"
        ? { title: "Teacher Attendance", subtitle: "Scan Teacher ID Card" }
        : null;

  const placeholder =
    mode === "auto"
      ? "Or paste a CC1. / TCC1. QR token"
      : mode === "teacher"
        ? "Or paste a TCC1 teacher QR token"
        : "Or paste a QR token";

  const showStudentBanner = (mode === "student" || mode === "auto") && studentBanner;
  const showTeacherBanner = (mode === "teacher" || mode === "auto") && teacherBanner;

  return (
    <div className="space-y-4">
      {heading && (
        <div>
          <h3 className="font-semibold text-base">{heading.title}</h3>
          <p className="text-sm text-muted-foreground">{heading.subtitle}</p>
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
      {showStudentBanner && mode === "student" && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", studentTone)}>
          {studentBanner.message}
        </div>
      )}
      {showStudentBanner && mode === "auto" && studentBanner.result !== "SUCCESS" && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", studentTone)}>
          {studentBanner.result === "DUPLICATE" ? "Attendance already marked." : studentBanner.message}
        </div>
      )}
      {showTeacherBanner && <TeacherScanResultBanner result={teacherBanner!} />}
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
          placeholder={placeholder}
        />
        <Button type="submit" variant="outline" loading={busy}>
          {mode === "teacher" ? "Punch" : mode === "auto" ? "Scan" : "Mark"}
        </Button>
      </form>

      <Modal
        open={!!successModal}
        onClose={() => {
          clearModalTimer();
          setSuccessModal(null);
        }}
        title={successModal?.title || "Attendance Marked Successfully"}
        size="sm"
      >
        {successModal && (
          <div className="space-y-2 text-sm">
            <div className="text-lg font-semibold">{successModal.name}</div>
            <div className="text-muted-foreground">{successModal.kind}</div>
            <div className="font-medium">{successModal.statusLine}</div>
            <div>Time: {successModal.timeLine}</div>
            {successModal.extraLine ? <div>{successModal.extraLine}</div> : null}
          </div>
        )}
      </Modal>
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
