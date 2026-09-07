import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Skeleton } from "@/components/ui-kit";

const AreaChartLazy = lazy(() =>
  import("recharts").then((m) => ({ default: m.AreaChart as ComponentType<any> })),
);
const BarChartLazy = lazy(() =>
  import("recharts").then((m) => ({ default: m.BarChart as ComponentType<any> })),
);
const LineChartLazy = lazy(() =>
  import("recharts").then((m) => ({ default: m.LineChart as ComponentType<any> })),
);
const PieChartLazy = lazy(() =>
  import("recharts").then((m) => ({ default: m.PieChart as ComponentType<any> })),
);

export {
  lazy as lazyRecharts,
  Suspense,
  AreaChartLazy as AreaChart,
  BarChartLazy as BarChart,
  LineChartLazy as LineChart,
  PieChartLazy as PieChart,
};

export {
  Area,
  Bar,
  Line,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export function ChartSuspense({ children, height = "100%" }: { children: ReactNode; height?: string | number }) {
  const h = typeof height === "number" ? `${height}px` : height;
  return (
    <Suspense fallback={<div style={{ height: h }}><Skeleton className="w-full h-full" /></div>}>
      {children}
    </Suspense>
  );
}
