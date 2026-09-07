import { Select } from "@/components/form";

export const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

/** Descending list of years from this year back, for historical record filtering. */
export function yearOptions(span = 8): string[] {
  const current = new Date().getFullYear();
  return Array.from({ length: span }, (_, i) => String(current - i));
}

type Props = {
  month: string;
  year: string;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  monthLabel?: string;
  yearLabel?: string;
};

export function MonthYearFilter({
  month,
  year,
  onMonthChange,
  onYearChange,
  monthLabel = "All Months",
  yearLabel = "All Years",
}: Props) {
  return (
    <>
      <Select value={month} onChange={(e) => onMonthChange(e.target.value)}>
        <option value="">{monthLabel}</option>
        {MONTH_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </Select>
      <Select value={year} onChange={(e) => onYearChange(e.target.value)}>
        <option value="">{yearLabel}</option>
        {yearOptions().map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
    </>
  );
}
