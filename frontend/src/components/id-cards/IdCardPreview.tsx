import type { ReactNode } from "react";
import { resolveFileUrl } from "@/lib/api";
import {
  cardPalette,
  resolveTeacherCardColors,
  teacherCardPalette,
  TEACHER_CARD_PREVIEW_HEIGHT,
  TEACHER_CARD_PREVIEW_WIDTH,
  type IdCardTemplateId,
  type TeacherCardColors,
} from "@/lib/id-card-data";
import { cn } from "@/lib/utils";

export type IdCardPreviewModel = {
  template?: IdCardTemplateId;
  qrSvg?: string;
  qrToken?: string;
  student: {
    fullName: string;
    admissionNo: string;
    fatherName?: string | null;
    photoUrl?: string | null;
    className?: string | null;
    sectionName?: string | null;
  };
  school: {
    name: string;
    logoUrl?: string | null;
    themeColor?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    domain?: string | null;
  };
  card?: { reference?: string | null };
};

export type TeacherIdCardPreviewModel = {
  template?: IdCardTemplateId;
  qrSvg?: string;
  qrToken?: string;
  teacher: {
    fullName: string;
    employeeNo?: string | null;
    designation?: string | null;
    photoUrl?: string | null;
  };
  school: {
    name: string;
    logoUrl?: string | null;
    themeColor?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    domain?: string | null;
    teacherCardColors?: TeacherCardColors | null;
  };
  card?: { reference?: string | null; status?: string | null };
};

export function IdCardPair({ model, template }: { model: IdCardPreviewModel; template?: IdCardTemplateId }) {
  const chosen = template ?? model.template ?? "CLASSIC";
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      <IdCardFront model={model} template={chosen} />
      <IdCardBack model={model} template={chosen} />
    </div>
  );
}

export function TeacherIdCardPair({
  model,
  template,
}: {
  model: TeacherIdCardPreviewModel;
  template?: IdCardTemplateId;
}) {
  const chosen = template ?? model.template ?? "CLASSIC";
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      <TeacherIdCardFront model={model} template={chosen} />
      <TeacherIdCardBack model={model} template={chosen} />
    </div>
  );
}

/** Student landscape shell — do not change dimensions. */
function CardShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
      style={{ width: 340, height: 214 }}
    >
      {children}
    </div>
  );
}

/** Teacher portrait shell — independent of student CardShell. */
function TeacherCardShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
      style={{ width: TEACHER_CARD_PREVIEW_WIDTH, height: TEACHER_CARD_PREVIEW_HEIGHT }}
    >
      {children}
    </div>
  );
}

export function IdCardFront({ model, template }: { model: IdCardPreviewModel; template: IdCardTemplateId }) {
  const colors = cardPalette(template, model.school.themeColor);
  const logo = model.school.logoUrl ? resolveFileUrl(model.school.logoUrl) : "";
  const photo = model.student.photoUrl ? resolveFileUrl(model.student.photoUrl) : "";
  return (
    <CardShell>
      <div className="h-14 px-3 flex items-center gap-2" style={{ background: colors.header, color: template === "MINIMAL" ? colors.text : "#fff" }}>
        {logo ? <img src={logo} alt="" className="size-8 rounded object-contain bg-white/90" /> : null}
        <div className="font-semibold text-xs leading-tight line-clamp-2">{model.school.name}</div>
      </div>
      <div className="h-1" style={{ background: colors.accent }} />
      <div className="flex gap-3 p-3" style={{ background: colors.bg, color: colors.text }}>
        {photo ? (
          <img src={photo} alt={model.student.fullName} className="size-[88px] rounded-lg object-cover border" />
        ) : (
          <div className="size-[88px] rounded-lg border border-dashed grid place-items-center text-[10px] text-muted-foreground">No photo</div>
        )}
        <div className="min-w-0 pt-0.5">
          <div className="font-bold text-sm leading-tight">{model.student.fullName}</div>
          <div className="text-[11px] mt-1" style={{ color: colors.muted }}>
            Class {model.student.className || "—"} · Sec {model.student.sectionName || "—"}
          </div>
          <div className="text-[11px] mt-1.5 font-medium">Adm. No {model.student.admissionNo}</div>
          {model.student.fatherName ? (
            <div className="text-[11px] mt-1" style={{ color: colors.muted }}>Father {model.student.fatherName}</div>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}

export function IdCardBack({ model, template }: { model: IdCardPreviewModel; template: IdCardTemplateId }) {
  const colors = cardPalette(template, model.school.themeColor);
  const contact = [model.school.phone, model.school.email, model.school.domain].filter(Boolean).join(" · ");
  return (
    <CardShell>
      <div className="h-full flex flex-col items-center justify-between p-3 text-center" style={{ background: colors.back, color: colors.backText }}>
        <div className="bg-white rounded-lg p-1.5 size-[118px] grid place-items-center">
          {model.qrSvg ? (
            <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: model.qrSvg }} />
          ) : (
            <div className="text-[10px] text-muted-foreground">QR</div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold">Scan for Attendance</div>
          <div className="text-[10px] opacity-80 mt-0.5">Ref {model.card?.reference || model.student.admissionNo}</div>
        </div>
        <div className="text-[9px] leading-tight opacity-80 px-2">
          {model.school.address ? <div>{model.school.address}</div> : null}
          {contact ? <div>{contact}</div> : null}
        </div>
      </div>
    </CardShell>
  );
}

/** Portrait staff front — logo, school, STAFF badge, photo, name, designation, emp ID. */
export function TeacherIdCardFront({
  model,
  template,
}: {
  model: TeacherIdCardPreviewModel;
  template: IdCardTemplateId;
}) {
  const design = resolveTeacherCardColors(model.school.teacherCardColors);
  const colors = teacherCardPalette(template, design);
  const logo = model.school.logoUrl ? resolveFileUrl(model.school.logoUrl) : "";
  const photo = model.teacher.photoUrl ? resolveFileUrl(model.teacher.photoUrl) : "";
  return (
    <TeacherCardShell className="ring-1 ring-teal-700/15">
      <div
        className="px-3 pt-3 pb-2 flex flex-col items-center gap-1.5 text-center"
        style={{ background: colors.header, color: template === "MINIMAL" ? colors.text : "#fff" }}
      >
        {logo ? <img src={logo} alt="" className="size-9 rounded object-contain bg-white/90" /> : null}
        <div className="font-semibold text-[11px] leading-tight line-clamp-2 px-1">{model.school.name}</div>
        <span
          className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded"
          style={{
            background: template === "MINIMAL" ? colors.badge : colors.accent,
            color: template === "MINIMAL" ? "#fff" : colors.text,
          }}
        >
          STAFF
        </span>
      </div>
      <div className="h-1" style={{ background: colors.accent }} />
      <div
        className="flex flex-col items-center px-3 pt-3 pb-2 text-center"
        style={{ background: colors.bg, color: colors.text }}
      >
        {photo ? (
          <img
            src={photo}
            alt={model.teacher.fullName}
            className="size-[104px] rounded-xl object-cover border border-teal-200 shadow-sm"
          />
        ) : (
          <div className="size-[104px] rounded-xl border border-dashed border-teal-300 grid place-items-center text-[10px] text-muted-foreground bg-teal-50/50">
            No photo
          </div>
        )}
        <div className="mt-3 font-bold text-sm leading-tight px-1">{model.teacher.fullName}</div>
        <div className="text-[11px] mt-1" style={{ color: colors.muted }}>
          {model.teacher.designation || "Teacher"}
        </div>
        <div className="text-[11px] mt-2 font-medium">Emp. ID {model.teacher.employeeNo || "—"}</div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ background: colors.accent }} />
    </TeacherCardShell>
  );
}

/** Portrait staff back — large QR for reliable scanning. */
export function TeacherIdCardBack({
  model,
  template,
}: {
  model: TeacherIdCardPreviewModel;
  template: IdCardTemplateId;
}) {
  const design = resolveTeacherCardColors(model.school.teacherCardColors);
  const colors = teacherCardPalette(template, design);
  const contact = [model.school.phone, model.school.email, model.school.domain].filter(Boolean).join(" · ");
  return (
    <TeacherCardShell className="ring-1 ring-teal-700/15">
      <div className="h-1.5" style={{ background: colors.accent }} />
      <div
        className="h-[calc(100%-6px)] flex flex-col items-center justify-between p-4 text-center"
        style={{ background: colors.back, color: colors.backText }}
      >
        <div className="bg-white rounded-xl p-2 size-[140px] grid place-items-center shadow-sm">
          {model.qrSvg ? (
            <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: model.qrSvg }} />
          ) : (
            <div className="text-[10px] text-muted-foreground">QR</div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold">Teacher Attendance QR</div>
          <div className="text-[10px] opacity-80 mt-1">
            Ref {model.card?.reference || model.teacher.employeeNo || "—"}
          </div>
        </div>
        <div className="text-[9px] leading-snug opacity-80 px-1">
          {model.school.address ? <div className="line-clamp-2">{model.school.address}</div> : null}
          {contact ? <div className="mt-0.5">{contact}</div> : null}
        </div>
      </div>
    </TeacherCardShell>
  );
}
