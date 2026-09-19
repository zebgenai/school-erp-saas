export type RouteFormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  full?: boolean;
  defaultValue?: string | number | boolean;
  viewValue?: (row: any) => string;
};

export type TransportVehicleOption = {
  id: string;
  vehicleNo?: string;
  model?: string;
  status?: string;
};

export function vehicleSelectOptions(
  vehicles: TransportVehicleOption[],
): Array<{ label: string; value: string }> {
  return vehicles.map((v) => ({
    value: v.id,
    label: [v.vehicleNo, v.model].filter(Boolean).join(" · ") || v.id,
  }));
}

export function routeFormFields(
  vehicles: TransportVehicleOption[] = [],
): RouteFormField[] {
  return [
    { key: "name", label: "Route Name", required: true },
    { key: "startPoint", label: "From", required: true },
    { key: "endPoint", label: "To", required: true },
    { key: "fare", label: "Monthly Fare", type: "number" },
    {
      key: "vehicleId",
      label: "Assigned Vehicle",
      type: "select",
      options: vehicleSelectOptions(vehicles),
      viewValue: (row: any) => row?.vehicle?.vehicleNo || "—",
    },
    { key: "stops", label: "Stops", type: "textarea", full: true },
    {
      key: "isActive",
      label: "Status",
      type: "select",
      defaultValue: "true",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
      viewValue: (row: any) => (row?.isActive === false ? "Inactive" : "Active"),
    },
  ];
}

export function toRouteFormValues(row: Record<string, any> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  return {
    name: row.name ?? "",
    startPoint: row.startPoint ?? row.from ?? "",
    endPoint: row.endPoint ?? row.to ?? "",
    fare: row.fare ?? "",
    vehicleId: row.vehicleId ?? row.vehicle?.id ?? "",
    stops: row.stops ?? "",
    isActive: row.isActive === false ? "false" : "true",
  };
}

function optionalString(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

/** Build CreateRouteDto / UpdateRouteDto — vehicleId must be a vehicle UUID, never a plate number. */
export function buildRoutePayload(form: Record<string, any>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: String(form.name ?? "").trim(),
    startPoint: String(form.startPoint ?? form.from ?? "").trim(),
    endPoint: String(form.endPoint ?? form.to ?? "").trim(),
  };

  const vehicleId = optionalString(form.vehicleId);
  if (vehicleId) payload.vehicleId = vehicleId;

  const stops = optionalString(form.stops);
  if (stops) payload.stops = stops;

  if (form.fare !== "" && form.fare != null) {
    const fare = Number(form.fare);
    if (!Number.isNaN(fare)) payload.fare = fare;
  }

  if (form.isActive !== undefined && form.isActive !== "") {
    payload.isActive = form.isActive === true || form.isActive === "true";
  }

  delete (payload as any).from;
  delete (payload as any).to;
  delete (payload as any).vehicleNo;
  delete (payload as any).vehicle;
  delete (payload as any).registrationNo;

  return payload;
}

export function displayRouteVehicleNo(row: Record<string, any> | null | undefined): string {
  if (!row) return "—";
  return row.vehicle?.vehicleNo || "—";
}
