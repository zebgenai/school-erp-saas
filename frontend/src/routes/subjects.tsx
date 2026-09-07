import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CrudPage } from "@/components/CrudPage";
import { useApiQuery, asList } from "@/lib/hooks";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/subjects")({
  head: () => ({ meta: [{ title: "Subjects — School ERP" }] }),
  component: () => <AppShell><Subjects /></AppShell>,
});

function Subjects() {
  // Subject mutations are restricted to school/super admin on the API, so the UI mirrors
  // that rather than showing buttons that would fail with 403.
  const { role } = usePermissions();
  const canManage = role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";

  const classes = useApiQuery<any>("/classes");
  const sections = useApiQuery<any>("/sections", { limit: 200 });
  const teachers = useApiQuery<any>("/teachers", { limit: 200 });

  const classOptions = asList<any>(classes.data).map((c) => ({ label: c.name, value: c.id }));
  const sectionOptions = asList<any>(sections.data).map((s) => ({
    label: s.class?.name ? `${s.class.name} · ${s.name}` : s.name,
    value: s.id,
  }));
  const teacherOptions = asList<any>(teachers.data).map((t) => ({ label: t.fullName, value: t.id }));

  return (
    <CrudPage
      title="Subjects"
      description="Manage subjects offered across classes, and who teaches them."
      endpoint="/subjects"
      resourceName="subject"
      emptyIcon={BookOpen}
      canCreate={canManage}
      canEdit={canManage}
      canDelete={canManage}
      searchFields={["name", "code"]}
      columns={[
        { key: "name", label: "Name" },
        { key: "code", label: "Code", mono: true },
        { key: "class", label: "Class", render: (r: any) => r.class?.name || "—" },
        { key: "section", label: "Section", render: (r: any) => r.section?.name || "All sections" },
        { key: "teacher", label: "Teacher", render: (r: any) => r.teacher?.fullName || "Unassigned" },
      ]}
      fields={[
        { key: "name", label: "Subject Name", required: true },
        { key: "code", label: "Code" },
        { key: "classId", label: "Class", type: "select", options: classOptions },
        { key: "sectionId", label: "Section", type: "select", options: sectionOptions },
        { key: "teacherId", label: "Teacher", type: "select", options: teacherOptions },
      ]}
    />
  );
}
