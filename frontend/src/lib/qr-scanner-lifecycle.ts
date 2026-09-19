/** Pure rAF loop controller — no React. Used by QrScanner and unit tests. */
export function createScannerLoopController() {
  let rafId: number | null = null;
  let generation = 0;
  const schedule = (fn: FrameRequestCallback) => {
    rafId = requestAnimationFrame(fn);
    return rafId;
  };
  const stop = () => {
    generation += 1;
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  };
  return {
    get generation() {
      return generation;
    },
    get rafId() {
      return rafId;
    },
    schedule,
    stop,
    startLoop(tick: (gen: number) => void) {
      const gen = generation;
      const loop = () => {
        if (gen !== generation) return;
        tick(gen);
        if (gen === generation) schedule(loop);
      };
      schedule(loop);
    },
  };
}
