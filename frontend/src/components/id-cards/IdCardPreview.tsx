import type { ReactNode } from "react";
import { resolveFileUrl } from "@/lib/api";
import { cardPalette, type IdCardTemplateId } from "@/lib/id-card-data";
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

/** Staff-oriented front: teal STAFF badge, employee ID + designation (no class/father). */
export function TeacherIdCardFront({
  model,
  template,
}: {
  model: TeacherIdCardPreviewModel;
  template: IdCardTemplateId;
}) {
  const colors = cardPalette(template, model.school.themeColor || "#0f766e");
  const logo = model.school.logoUrl ? resolveFileUrl(model.school.logoUrl) : "";
  const photo = model.teacher.photoUrl ? resolveFileUrl(model.teacher.photoUrl) : "";
  return (
    <CardShell className="ring-1 ring-teal-700/20">
      <div
        className="h-14 px-3 flex items-center gap-2"
        style={{ background: colors.header === "#1e3a5f" ? "#115e59" : colors.header, color: template === "MINIMAL" ? colors.text : "#fff" }}
      >
        {logo ? <img src={logo} alt="" className="size-8 rounded object-contain bg-white/90" /> : null}
        <div className="font-semibold text-xs leading-tight line-clamp-2 flex-1">{model.school.name}</div>
        <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-black/20">STAFF</span>
      </div>
      <div className="h-1" style={{ background: template === "CLASSIC" ? "#2dd4bf" : colors.accent }} />
      <div className="flex gap-3 p-3" style={{ background: colors.bg, color: colors.text }}>
        {photo ? (
          <img src={photo} alt={model.teacher.fullName} className="size-[88px] rounded-lg object-cover border border-teal-200" />
        ) : (
          <div className="size-[88px] rounded-lg border border-dashed border-teal-300 grid place-items-center text-[10px] text-muted-foreground bg-teal-50/50">
            No photo
          </div>
        )}
        <div className="min-w-0 pt-0.5">
          <div className="font-bold text-sm leading-tight">{model.teacher.fullName}</div>
          <div className="text-[11px] mt-1" style={{ color: colors.muted }}>
            {model.teacher.designation || "Teacher"}
          </div>
          <div className="text-[11px] mt-1.5 font-medium">Emp. ID {model.teacher.employeeNo || "—"}</div>
        </div>
      </div>
    </CardShell>
  );
}

export function TeacherIdCardBack({
  model,
  template,
}: {
  model: TeacherIdCardPreviewModel;
  template: IdCardTemplateId;
}) {
  const colors = cardPalette(template, model.school.themeColor || "#0f766e");
  const back = colors.header === "#1e3a5f" ? "#115e59" : colors.back;
  const contact = [model.school.phone, model.school.email, model.school.domain].filter(Boolean).join(" · ");
  return (
    <CardShell className="ring-1 ring-teal-700/20">
      <div className="h-full flex flex-col items-center justify-between p-3 text-center" style={{ background: back, color: colors.backText }}>
        <div className="bg-white rounded-lg p-1.5 size-[118px] grid place-items-center">
          {model.qrSvg ? (
            <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: model.qrSvg }} />
          ) : (
            <div className="text-[10px] text-muted-foreground">QR</div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold">Teacher Attendance QR</div>
          <div className="text-[10px] opacity-80 mt-0.5">
            Ref {model.card?.reference || model.teacher.employeeNo || "—"}
          </div>
        </div>
        <div className="text-[9px] leading-tight opacity-80 px-2">
          {model.school.address ? <div>{model.school.address}</div> : null}
          {contact ? <div>{contact}</div> : null}
        </div>
      </div>
    </CardShell>
  );
}
