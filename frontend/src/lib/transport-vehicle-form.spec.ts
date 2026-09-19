import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVehiclePayload,
  toVehicleFormValues,
  vehicleFormFields,
} from "./transport-vehicle-form.ts";

const FORBIDDEN = ["registrationNo", "id", "schoolId", "createdAt", "updatedAt", "routes"];

describe("transport vehicle form", () => {
  it("exposes vehicleNo under a Registration No. label", () => {
    const fields = vehicleFormFields();
    const reg = fields.find((f) => f.key === "vehicleNo");
    assert.ok(reg);
    assert.equal(reg?.label, "Registration No.");
    assert.equal(fields.some((f) => f.key === "registrationNo"), false);
    assert.ok(fields.some((f) => f.key === "type"));
    assert.ok(fields.some((f) => f.key === "driverPhone"));
  });

  it("maps legacy registrationNo into vehicleNo form values", () => {
    const form = toVehicleFormValues({
      id: "v1",
      registrationNo: "ABC-1",
      model: "Hiace",
      capacity: 12,
      driverName: "Ali",
      status: "ACTIVE",
    });
    assert.equal(form.vehicleNo, "ABC-1");
    assert.equal(form.registrationNo, undefined);
  });

  it("builds CreateVehicleDto without registrationNo", () => {
    const payload = buildVehiclePayload({
      vehicleNo: " XYZ-99 ",
      type: "VAN",
      capacity: "20",
      driverName: "Sara",
      driverPhone: "0300",
      model: "Coaster",
      status: "ACTIVE",
      registrationNo: "should-not-send",
      id: "v1",
      schoolId: "s1",
    });

    assert.equal(payload.vehicleNo, "XYZ-99");
    assert.equal(payload.type, "VAN");
    assert.equal(payload.capacity, 20);
    assert.equal(payload.driverName, "Sara");
    assert.equal(payload.driverPhone, "0300");
    assert.equal(payload.model, "Coaster");
    assert.equal(payload.status, "ACTIVE");

    for (const key of FORBIDDEN) {
      assert.equal(key in payload, false, `must not send ${key}`);
    }
  });

  it("omits blank optional strings", () => {
    const payload = buildVehiclePayload({
      vehicleNo: "A-1",
      capacity: 10,
      type: "",
      driverName: "  ",
      driverPhone: "",
      model: "",
      status: "ACTIVE",
    });
    assert.equal("type" in payload, false);
    assert.equal("driverName" in payload, false);
    assert.equal("driverPhone" in payload, false);
    assert.equal("model" in payload, false);
    assert.equal(payload.status, "ACTIVE");
  });
});
