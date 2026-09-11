export function UnknownSchool() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-sidebar grid place-items-center px-4">
      <div className="absolute inset-0 bg-gradient-mesh opacity-90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.18_258/0.25),transparent_60%)]" />
      <div className="relative w-full max-w-md">
        <div className="bg-card/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-lift text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Clever Campus</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">School not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This address is not an active Clever Campus school. Check the link from your administrator.
          </p>
          <a
            href="https://clevercampus.cloud"
            className="inline-flex mt-6 text-sm font-medium text-primary hover:underline"
          >
            Go to Clever Campus
          </a>
        </div>
      </div>
    </div>
  );
}
