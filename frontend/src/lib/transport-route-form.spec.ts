import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoutePayload,
  displayRouteVehicleNo,
  routeFormFields,
  toRouteFormValues,
} from "./transport-route-form.ts";

const FORBIDDEN = ["from", "to", "vehicleNo", "vehicle", "registrationNo", "id", "schoolId"];

describe("transport route form", () => {
  it("uses startPoint/endPoint/vehicleId field keys with friendly labels", () => {
    const fields = routeFormFields([{ id: "veh-1", vehicleNo: "ABC-1" }]);
    assert.equal(fields.find((f) => f.key === "startPoint")?.label, "From");
    assert.equal(fields.find((f) => f.key === "endPoint")?.label, "To");
    const vehicle = fields.find((f) => f.key === "vehicleId");
    assert.ok(vehicle);
    assert.deepEqual(vehicle?.options, [{ value: "veh-1", label: "ABC-1" }]);
    assert.equal(fields.some((f) => f.key === "from" || f.key === "vehicleNo"), false);
  });

  it("maps legacy from/to into startPoint/endPoint form values", () => {
    const form = toRouteFormValues({
      id: "r1",
      name: "North",
      from: "Gate A",
      to: "Campus",
      vehicleId: "veh-1",
      vehicle: { id: "veh-1", vehicleNo: "ABC-1" },
      fare: 500,
      isActive: true,
    });
    assert.equal(form.startPoint, "Gate A");
    assert.equal(form.endPoint, "Campus");
    assert.equal(form.vehicleId, "veh-1");
    assert.equal(form.isActive, "true");
  });

  it("builds CreateRouteDto with vehicleId, not a plate number", () => {
    const payload = buildRoutePayload({
      name: "North",
      startPoint: "Gate A",
      endPoint: "Campus",
      vehicleId: "veh-uuid-1",
      vehicleNo: "ABC-1",
      from: "legacy-from",
      to: "legacy-to",
      fare: "750",
      stops: "Stop 1, Stop 2",
      isActive: "true",
      vehicle: { id: "veh-uuid-1", vehicleNo: "ABC-1" },
    });

    assert.equal(payload.name, "North");
    assert.equal(payload.startPoint, "Gate A");
    assert.equal(payload.endPoint, "Campus");
    assert.equal(payload.vehicleId, "veh-uuid-1");
    assert.equal(payload.fare, 750);
    assert.equal(payload.stops, "Stop 1, Stop 2");
    assert.equal(payload.isActive, true);

    for (const key of FORBIDDEN) {
      assert.equal(key in payload, false, `must not send ${key}`);
    }
  });

  it("displays vehicle number from the vehicle relation", () => {
    assert.equal(displayRouteVehicleNo({ vehicle: { vehicleNo: "XYZ-9" } }), "XYZ-9");
    assert.equal(displayRouteVehicleNo({ vehicleNo: "XYZ-9" }), "—");
    assert.equal(displayRouteVehicleNo(null), "—");
  });
});
