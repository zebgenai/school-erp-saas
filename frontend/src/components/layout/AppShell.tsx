import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, GraduationCap, CalendarCheck, Receipt,
  ClipboardList, BarChart3, Settings, LogOut, Menu, X, ChevronLeft, School,
  UserCog, Briefcase, Wallet, BookOpen, Calendar, Bus, Megaphone, Building2, HeartHandshake,
  DollarSign, Activity, ShieldCheck, Globe, KeyRound, CalendarDays,
} from "lucide-react";
import { resolveFileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { schoolLoginOrigin } from "@/lib/host";
import { useAppHost } from "@/lib/use-app-host";
import { applySchoolTheme } from "@/lib/school-branding";
import { usePermissions, homeRouteForRole, isPlatformStaff, roleDisplayName, type Permission } from "@/lib/permissions";
import { otpChallengeStore } from "@/lib/otp-challenge";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { EmptyState } from "@/components/ui-kit";

type NavItem = { to: string; label: string; icon: any; search?: string; permission?: Permission; ownerOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/** Navigation shown to PARENT role — portal only */
const parentNavGroups: NavGroup[] = [
  { label: "My Portal", items: [
    { to: "/parent", label: "My Children", icon: LayoutDashboard },
    { to: "/academic-calendar", label: "Academic Calendar", icon: CalendarDays },
  ]},
];

/** Navigation shown to STUDENT role — student portal only */
const studentNavGroups: NavGroup[] = [
  { label: "My Portal", items: [
    { to: "/student", label: "My Dashboard", icon: LayoutDashboard },
    { to: "/academic-calendar", label: "Academic Calendar", icon: CalendarDays },
  ]},
];

/** Navigation shown to TEACHER role — teacher portal */
const teacherNavGroups: NavGroup[] = [
  { label: "My Portal", items: [
    { to: "/teacher", label: "Teacher Dashboard", icon: LayoutDashboard },
  ]},
  { label: "Classes", items: [
    { to: "/students",   label: "Students",    icon: Users,        permission: "students.view" },
    { to: "/classes",    label: "Classes",     icon: GraduationCap, permission: "classes.view" },
    { to: "/timetable",  label: "Timetable",   icon: Calendar,     permission: "timetable.view" },
    { to: "/academic-calendar", label: "Academic Calendar", icon: CalendarDays, permission: "academic-calendar.view" },
    { to: "/attendance", label: "Attendance",  icon: CalendarCheck, permission: "attendance.view" },
    { to: "/exams",      label: "Exams",       icon: ClipboardList, permission: "exams.view" },
  ]},
  { label: "Resources", items: [
    { to: "/library",       label: "Library",       icon: BookOpen,  permission: "library.view" },
    { to: "/communication", label: "Communication", icon: Megaphone, permission: "communication.view" },
    { to: "/roles",         label: "My Permissions", icon: KeyRound },
  ]},
];

/** Navigation shown to SUPER_ADMIN — platform management only */
const superAdminNavGroups: NavGroup[] = [
  { label: "Platform", items: [
    { to: "/super-admin", label: "Platform Dashboard", icon: LayoutDashboard, search: "" },
  ]},
  { label: "Management", items: [
    { to: "/super-admin", label: "Schools", icon: Building2, search: "?tab=schools" },
    { to: "/super-admin", label: "Role Management", icon: KeyRound, search: "?tab=roles" },
    { to: "/super-admin", label: "Platform Team", icon: UserCog, search: "?tab=team", ownerOnly: true },
    { to: "/super-admin", label: "Subscription Plans", icon: Receipt, search: "?tab=plans" },
    { to: "/super-admin", label: "Billing", icon: DollarSign, search: "?tab=billing" },
  ]},
  { label: "System", items: [
    { to: "/super-admin", label: "Audit Logs", icon: Activity, search: "?tab=audit" },
    { to: "/super-admin", label: "Platform Settings", icon: Settings, search: "?tab=settings", ownerOnly: true },
  ]},
];

/** Navigation shown to all school roles — items are filtered by permissions at runtime */
const schoolNavGroups: NavGroup[] = [
  { label: "Overview", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]},
  { label: "People", items: [
    { to: "/students",  label: "Students", icon: Users,        permission: "students.view" },
    { to: "/parents",   label: "Parents",  icon: HeartHandshake, permission: "parents.view" },
    { to: "/teachers",  label: "Teachers", icon: UserCog,      permission: "teachers.view" },
    { to: "/staff",     label: "Staff",    icon: Briefcase,    permission: "staff.view" },
    { to: "/users",     label: "User Management", icon: ShieldCheck, permission: "users.view" },
  ]},
  { label: "Academics", items: [
    { to: "/classes",    label: "Classes",       icon: GraduationCap, permission: "classes.view" },
    { to: "/subjects",   label: "Subjects",      icon: BookOpen,      permission: "subjects.view" },
    { to: "/timetable",  label: "Timetable",     icon: Calendar,      permission: "timetable.view" },
    { to: "/academic-calendar", label: "Academic Calendar", icon: CalendarDays, permission: "academic-calendar.view" },
    { to: "/attendance", label: "Attendance",    icon: CalendarCheck, permission: "attendance.view" },
    { to: "/exams",      label: "Exams & Results", icon: ClipboardList, permission: "exams.view" },
  ]},
  { label: "Finance", items: [
    { to: "/fees",     label: "Fees",     icon: Receipt, permission: "fees.view" },
    { to: "/payroll",  label: "Payroll",  icon: Wallet,  permission: "payroll.view" },
    { to: "/expenses", label: "Expenses", icon: Wallet,  permission: "expenses.view" },
  ]},
  { label: "Operations", items: [
    { to: "/library",       label: "Library",       icon: BookOpen,  permission: "library.view" },
    { to: "/transport",     label: "Transport",     icon: Bus,       permission: "transport.view" },
    { to: "/communication", label: "Communication", icon: Megaphone, permission: "communication.view" },
  ]},
  { label: "System", items: [
    { to: "/reports",  label: "Reports",           icon: BarChart3,  permission: "reports.view" },
    { to: "/roles",    label: "Roles & Permissions", icon: KeyRound,  permission: "settings.view" },
    { to: "/settings", label: "Settings",           icon: Settings,   permission: "settings.view" },
  ]},
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, canRoute } = usePermissions();
  const host = useAppHost();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const routeAllowed = user ? canRoute(pathname) : false;

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!user?.school?.themeColor) return;
    applySchoolTheme(user.school.themeColor);
  }, [user?.school?.themeColor]);

  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ to: otpChallengeStore.get() ? "/verify-otp" : "/login" });
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && !canRoute(pathname)) {
      router.navigate({ to: homeRouteForRole(user.role) });
    }
  }, [loading, user, pathname, router, canRoute]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  const isSuperAdmin = isPlatformStaff(user.role);
  const wrongSchoolHost =
    host.ready &&
    host.mode === "school" &&
    !isSuperAdmin &&
    Boolean(user.school?.slug) &&
    user.school?.slug !== host.slug;

  if (wrongSchoolHost) {
    const home = user.school?.slug ? `${schoolLoginOrigin(user.school.slug)}/login` : "/login";
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="max-w-md text-center rounded-3xl border bg-card p-8 shadow-lift">
          <h1 className="text-xl font-semibold">Wrong school site</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in to {user.school?.name || "another school"}, but this address is for a different campus.
            The server will not load that school&apos;s data here.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted"
            >
              Sign out
            </button>
            <a
              href={home}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              Go to your school
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = user.role === "SUPER_ADMIN";
  const isParent     = user.role === "PARENT";
  const isTeacher    = user.role === "TEACHER";
  const isStudent    = user.role === "STUDENT";
  const isPortalOnly = isParent || isStudent;

  const baseGroups = isSuperAdmin && !user.schoolId
    ? superAdminNavGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.ownerOnly || isOwner),
      }))
    : isParent  ? parentNavGroups
    : isTeacher ? teacherNavGroups
    : isStudent ? studentNavGroups
    : schoolNavGroups;

  const navGroups = isPortalOnly
    ? baseGroups
    : baseGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.permission || can(item.permission)),
        }))
        .filter((group) => group.items.length > 0);

  const schoolName = isSuperAdmin && !user.schoolId
    ? "Clever Campus Platform"
    : (user.school?.name || user.schoolName || "Your School");
  const schoolLogoUrl = isSuperAdmin && !user.schoolId ? null : user.school?.logoUrl;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -320, opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0.6 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] bg-gradient-sidebar text-sidebar-foreground lg:hidden shadow-lift"
            >
              <SidebarInner pathname={pathname} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} navGroups={navGroups} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-gradient-sidebar text-sidebar-foreground transition-[width] duration-500 ease-out sticky top-0 h-screen border-r border-sidebar-border/60",
          collapsed ? "w-[76px]" : "w-[252px]"
        )}
      >
        <SidebarInner pathname={pathname} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} navGroups={navGroups} collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "m-3 mt-auto flex items-center justify-center gap-2 rounded-xl py-2 text-xs text-sidebar-foreground/60",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground transition-all duration-200"
          )}
        >
          <ChevronLeft className={cn("size-4 transition-transform duration-300", collapsed && "rotate-180")} />
          {!collapsed && <span className="font-medium tracking-wide">Collapse</span>}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-background/75 backdrop-blur-xl border-b border-border/70">
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-16">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden size-9 grid place-items-center rounded-lg hover:bg-muted transition"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>

            <div className="hidden sm:flex lg:hidden items-center gap-2 min-w-0">
              <SchoolLogo logoUrl={schoolLogoUrl} className="size-8 rounded-lg" iconClassName="size-4" />
              <div className="truncate">
                <div className="text-sm font-semibold leading-tight truncate">{schoolName}</div>
                <div className="text-[11px] text-muted-foreground">School ERP</div>
              </div>
            </div>

            <div className="flex-1" />

            <NotificationBell />

            <div className="hidden sm:flex items-center gap-3 pl-3 ml-1 border-l border-border/80">
              <div className="text-right hidden md:block">
                <div className="text-sm font-semibold leading-tight">{user.name || user.email}</div>
                <div className="text-[10px] uppercase tracking-wider mt-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
                    {roleDisplayName(user.role)}
                  </span>
                </div>
              </div>
              <div className="size-9 rounded-full bg-gradient-primary text-primary-foreground grid place-items-center font-bold shadow-glow ring-2 ring-background">
                {(user.name || user.email || "U").charAt(0).toUpperCase()}
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="size-9 grid place-items-center rounded-xl hover:bg-destructive/10 hover:text-destructive transition"
              >
                <LogOut className="size-[18px]" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto"
            >
              {routeAllowed ? children : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Access denied"
                  description="You don't have permission to view this page."
                  action={
                    <Link to={homeRouteForRole(user.role)} className="inline-flex items-center px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                      Go to dashboard
                    </Link>
                  }
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

/** School logo with a graceful fallback to the generic school icon. */
function SchoolLogo({ logoUrl, className, iconClassName }: { logoUrl?: string | null; className?: string; iconClassName?: string }) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <img
        src={resolveFileUrl(logoUrl)}
        alt=""
        onError={() => setFailed(true)}
        className={cn("rounded-xl object-contain bg-white/95 shrink-0", className)}
      />
    );
  }

  return (
    <div className={cn("rounded-xl bg-gradient-primary grid place-items-center shrink-0 shadow-glow", className)}>
      <School className={cn("text-primary-foreground", iconClassName)} />
    </div>
  );
}

function SidebarInner({
  pathname, schoolName, schoolLogoUrl, navGroups, collapsed, onClose,
}: { pathname: string; schoolName: string; schoolLogoUrl?: string | null; navGroups: NavGroup[]; collapsed?: boolean; onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-sidebar-border/60">
        <SchoolLogo logoUrl={schoolLogoUrl} className="size-9" iconClassName="size-5" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate text-[15px]">Clever Campus</div>
            <div className="text-[11px] text-sidebar-foreground/55 truncate">{schoolName}</div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="ml-auto size-8 grid place-items-center rounded-lg hover:bg-sidebar-accent/70 transition" aria-label="Close">
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="p-3 space-y-1 overflow-y-auto flex-1">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "pt-2" : ""}>
            {!collapsed && (
              <div className="px-3 pt-1 pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase text-sidebar-foreground/40">
                {group.label}
              </div>
            )}
            {group.items.map((item, i) => {
              const search = item.search ?? "";
              const fullHref = `${item.to}${search}`;
              const active = search
                ? (pathname + (typeof window !== "undefined" ? window.location.search : "")) === fullHref ||
                  (typeof window !== "undefined" ? window.location.search : "") === search
                : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: (gi * 0.04) + (i * 0.025), ease: [0.16, 1, 0.3, 1] }}
                >
                  <a
                    href={fullHref}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300",
                      active
                        ? "text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/40"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-bg"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-xl nav-active-glow"
                      />
                    )}
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-rail"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary-glow shadow-[0_0_12px_oklch(0.72_0.16_285)]"
                      />
                    )}
                    <Icon className={cn(
                      "size-[18px] shrink-0 relative z-10 transition-transform duration-300",
                      "group-hover:scale-110",
                      active && "text-primary-glow"
                    )} />
                    {!collapsed && (
                      <span className="truncate relative z-10">{item.label}</span>
                    )}
                  </a>
                </motion.div>
              );
            })}
          </div>
        ))}
      </nav>


      {!collapsed && (
        <div className="mx-3 mb-3 p-3 rounded-xl bg-sidebar-accent/40 border border-sidebar-border/60">
          <div className="text-[11px] font-semibold text-sidebar-foreground/80">Need help?</div>
          <div className="text-[10px] text-sidebar-foreground/55 mt-0.5">Check the docs or contact support.</div>
        </div>
      )}
    </div>
  );
}
