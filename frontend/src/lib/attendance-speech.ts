/**
 * Optional browser TTS for attendance scan cues.
 * Feature-detects SpeechSynthesis and never throws into the scan flow.
 */
export function speakAttendanceCue(text: string): void {
  try {
    const phrase = (text ?? "").trim();
    if (!phrase) return;
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    synth.speak(utterance);
  } catch {
    /* speech must never break attendance submission */
  }
}

export const ATTENDANCE_VOICE = {
  studentSuccess: "Attendance done.",
  teacherCheckIn: "Teacher attendance marked. Check in.",
  teacherCheckOut: "Teacher attendance marked. Check out.",
  alreadyMarked: "Attendance already marked.",
} as const;
