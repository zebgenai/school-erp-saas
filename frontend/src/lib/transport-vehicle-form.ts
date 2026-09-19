export type VehicleFormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "tel";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
};

export const VEHICLE_TYPES = [
  { label: "Bus", value: "BUS" },
  { label: "Van", value: "VAN" },
  { label: "Minibus", value: "MINIBUS" },
  { label: "Car", value: "CAR" },
  { label: "Other", value: "OTHER" },
] as const;

export const VEHICLE_STATUSES = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Maintenance", value: "MAINTENANCE" },
] as const;

const CREATE_KEYS = [
  "vehicleNo",
  "type",
  "capacity",
  "driverName",
  "driverPhone",
  "model",
  "status",
] as const;

/** UI fields mapped to CreateVehicleDto / UpdateVehicleDto keys. */
export function vehicleFormFields(): VehicleFormField[] {
  return [
    { key: "vehicleNo", label: "Registration No.", required: true, placeholder: "e.g. ABC-123" },
    { key: "model", label: "Model" },
    {
      key: "type",
      label: "Type",
      type: "select",
      defaultValue: "BUS",
      options: [...VEHICLE_TYPES],
    },
    { key: "capacity", label: "Capacity", type: "number", required: true, defaultValue: 1 },
    { key: "driverName", label: "Driver Name" },
    { key: "driverPhone", label: "Driver Phone", type: "tel" },
    {
      key: "status",
      label: "Status",
      type: "select",
      defaultValue: "ACTIVE",
      options: [...VEHICLE_STATUSES],
    },
  ];
}

export function toVehicleFormValues(row: Record<string, any> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  return {
    vehicleNo: row.vehicleNo ?? row.registrationNo ?? "",
    type: row.type || "BUS",
    capacity: row.capacity ?? "",
    driverName: row.driverName ?? "",
    driverPhone: row.driverPhone ?? "",
    model: row.model ?? "",
    status: row.status || "ACTIVE",
  };
}

function optionalString(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

/** Build CreateVehicleDto / UpdateVehicleDto — never send registrationNo or nested relations. */
export function buildVehiclePayload(form: Record<string, any>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    vehicleNo: String(form.vehicleNo ?? "").trim(),
    capacity: Number(form.capacity) || 0,
  };

  const type = optionalString(form.type);
  if (type) payload.type = type;

  const driverName = optionalString(form.driverName);
  if (driverName) payload.driverName = driverName;

  const driverPhone = optionalString(form.driverPhone);
  if (driverPhone) payload.driverPhone = driverPhone;

  const model = optionalString(form.model);
  if (model) payload.model = model;

  const status = optionalString(form.status);
  if (status) payload.status = status;

  for (const key of Object.keys(payload)) {
    if (!(CREATE_KEYS as readonly string[]).includes(key)) delete payload[key];
  }

  return payload;
}
