/**
 * Performance Testing Utilities
 *
 * Simulate low-end devices and stress test performance-critical operations
 */

/**
 * Simulate CPU-intensive background tasks (low-end device simulation)
 * Use this during manual testing to stress test your features
 */
export function simulateLowEndDevice(intensity: 'light' | 'medium' | 'heavy' = 'medium') {
  const config = {
    light: { interval: 100, workDuration: 10 },
    medium: { interval: 50, workDuration: 20 },
    heavy: { interval: 30, workDuration: 30 },
  };

  const { interval, workDuration } = config[intensity];

  let running = true;

  const doWork = () => {
    const start = performance.now();
    // Simulate CPU-intensive work
    while (performance.now() - start < workDuration) {
      Math.sqrt(Math.random());
    }
  };

  const intervalId = setInterval(doWork, interval);

  console.warn(
    `[PerfTest] Simulating ${intensity} load. CPU will be constantly busy.`
  );

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    running = false;
    console.log('[PerfTest] Low-end device simulation stopped');
  };
}

/**
 * Measure operation time and warn if exceeds threshold
 */
export function measureAndWarn<T>(
  operationName: string,
  threshold: number,
  fn: () => T
): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (duration > threshold) {
    console.warn(
      `[PerfTest] ⚠️ ${operationName} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
    );

    // In low-end devices, this would be even worse
    const estimatedLowEnd = duration * 4;
    if (estimatedLowEnd > 100) {
      console.error(
        `[PerfTest] ❌ On low-end device (~4x slower): ~${estimatedLowEnd.toFixed(0)}ms`
      );
    }
  } else {
    console.log(
      `[PerfTest] ✅ ${operationName} took ${duration.toFixed(2)}ms`
    );
  }

  return result;
}

/**
 * Stress test with multiple tabs/extensions
 * Simulates realistic usage environment
 */
export function simulateMemoryPressure(sizeMB: number = 100) {
  const chunks: ArrayBuffer[] = [];
  const chunkSize = 1024 * 1024; // 1MB

  for (let i = 0; i < sizeMB; i++) {
    chunks.push(new ArrayBuffer(chunkSize));
  }

  console.warn(
    `[PerfTest] Allocated ${sizeMB}MB to simulate memory pressure`
  );

  return () => {
    chunks.length = 0;
    console.log('[PerfTest] Memory pressure released');
  };
}

/**
 * Test if operation causes Long Task (> 50ms)
 */
export function detectLongTask<T>(
  operationName: string,
  fn: () => T
): { result: T; isLongTask: boolean; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  const isLongTask = duration > 50;

  if (isLongTask) {
    console.error(
      `[PerfTest] ❌ LONG TASK DETECTED: ${operationName} blocked for ${duration.toFixed(2)}ms`
    );
  }

  return { result, isLongTask, duration };
}

/**
 * Test memory cleanup after operations
 */
export async function testMemoryLeak(
  setupFn: () => void,
  cleanupFn: () => void,
  iterations: number = 100
): Promise<{ leaked: boolean; growth: number }> {
  // Force GC if available (run Chrome with --expose-gc)
  const gc = (globalThis as any).gc;

  // Initial heap size
  if (gc) gc();
  const initialHeap = (performance as any).memory?.usedJSHeapSize || 0;

  // Run iterations
  for (let i = 0; i < iterations; i++) {
    setupFn();
    cleanupFn();
  }

  // Final heap size
  if (gc) gc();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for GC
  const finalHeap = (performance as any).memory?.usedJSHeapSize || 0;

  const growth = finalHeap - initialHeap;
  const leaked = growth > 5_000_000; // 5MB threshold

  if (leaked) {
    console.error(
      `[PerfTest] ❌ MEMORY LEAK: Heap grew by ${(growth / 1_000_000).toFixed(2)}MB after ${iterations} iterations`
    );
  } else {
    console.log(
      `[PerfTest] ✅ Memory OK: Heap grew by ${(growth / 1_000_000).toFixed(2)}MB`
    );
  }

  return { leaked, growth };
}
