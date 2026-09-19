import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createScannerLoopController } from "./qr-scanner-lifecycle.ts";

describe("QR scanner rAF lifecycle helper", () => {
  it("stop bumps generation and clears the scheduled frame", () => {
    const ctrl = createScannerLoopController();
    let ticks = 0;
    const realRaf = globalThis.requestAnimationFrame;
    const realCancel = globalThis.cancelAnimationFrame;
    let nextId = 1;
    const pending = new Map<number, FrameRequestCallback>();
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      pending.delete(id);
    }) as typeof cancelAnimationFrame;

    try {
      ctrl.startLoop(() => {
        ticks += 1;
      });
      for (const [id, cb] of [...pending.entries()]) {
        pending.delete(id);
        cb(0);
      }
      assert.ok(ticks >= 1);
      const genBefore = ctrl.generation;
      ctrl.stop();
      assert.equal(ctrl.generation, genBefore + 1);
      assert.equal(ctrl.rafId, null);
      assert.equal(pending.size, 0);
    } finally {
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCancel;
    }
  });
});
