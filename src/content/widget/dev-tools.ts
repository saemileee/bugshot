/**
 * Development Tools for Performance Testing
 *
 * Exposed to window.bugshot in development mode only
 * Usage: Open DevTools Console, type `bugshot.testLowEnd()`
 */

import {
  simulateLowEndDevice,
  measureAndWarn,
  simulateMemoryPressure,
  detectLongTask,
} from '@/shared/utils/performance-test';

interface DevTools {
  // Simulate low-end device
  testLowEnd: (intensity?: 'light' | 'medium' | 'heavy') => () => void;

  // Measure operation performance
  measure: <T>(name: string, fn: () => T) => T;

  // Simulate memory pressure
  memoryStress: (sizeMB?: number) => () => void;

  // Check for long tasks
  checkLongTask: <T>(name: string, fn: () => T) => void;

  // Show performance stats
  stats: () => void;
}

export function initDevTools() {
  // Only in development
  if (import.meta.env.MODE !== 'development') return;

  const devTools: DevTools = {
    testLowEnd: (intensity = 'medium') => {
      console.log(
        '%c[BugShot DevTools]%c Starting low-end device simulation...',
        'color: #8b5cf6; font-weight: bold',
        'color: inherit'
      );
      return simulateLowEndDevice(intensity);
    },

    measure: (name, fn) => {
      return measureAndWarn(name, 50, fn);
    },

    memoryStress: (sizeMB = 100) => {
      return simulateMemoryPressure(sizeMB);
    },

    checkLongTask: (name, fn) => {
      const { isLongTask, duration } = detectLongTask(name, fn);

      if (isLongTask) {
        console.error(
          `%c[BugShot]%c ❌ ${name} is a Long Task (${duration.toFixed(0)}ms)`,
          'color: #ef4444; font-weight: bold',
          'color: inherit'
        );
      } else {
        console.log(
          `%c[BugShot]%c ✅ ${name} is fast (${duration.toFixed(0)}ms)`,
          'color: #22c55e; font-weight: bold',
          'color: inherit'
        );
      }
    },

    stats: () => {
      if (!(performance as any).memory) {
        console.warn(
          '[BugShot] Memory stats not available. Start Chrome with --enable-precise-memory-info'
        );
        return;
      }

      const memory = (performance as any).memory;
      const used = (memory.usedJSHeapSize / 1_000_000).toFixed(2);
      const total = (memory.totalJSHeapSize / 1_000_000).toFixed(2);
      const limit = (memory.jsHeapSizeLimit / 1_000_000).toFixed(2);

      console.log(
        '%c[BugShot Performance Stats]',
        'color: #8b5cf6; font-weight: bold; font-size: 14px'
      );
      console.log(`📊 Heap Used: ${used}MB / ${total}MB`);
      console.log(`📈 Heap Limit: ${limit}MB`);
      console.log(`⚡ CPU: Check Performance Monitor`);

      // Performance entries
      const measures = performance.getEntriesByType('measure');
      if (measures.length > 0) {
        console.log('\n🎯 Recent Measurements:');
        measures.slice(-5).forEach((m) => {
          const status = m.duration < 50 ? '✅' : '⚠️';
          console.log(`  ${status} ${m.name}: ${m.duration.toFixed(2)}ms`);
        });
      }

      // Long tasks
      const longTasks = performance.getEntriesByType('longtask') as any[];
      if (longTasks.length > 0) {
        console.warn('\n⚠️ Long Tasks Detected:', longTasks.length);
        longTasks.forEach((task, i) => {
          console.warn(
            `  ${i + 1}. Duration: ${task.duration.toFixed(0)}ms at ${new Date(task.startTime).toLocaleTimeString()}`
          );
        });
      }
    },
  };

  // Expose to window
  (window as any).bugshot = devTools;

  console.log(
    '%c[BugShot DevTools]%c Loaded! Try:%c\n' +
      '  bugshot.testLowEnd()     // Simulate low-end device\n' +
      '  bugshot.stats()          // Show performance stats\n' +
      '  bugshot.memoryStress()   // Add memory pressure\n',
    'color: #8b5cf6; font-weight: bold',
    'color: inherit',
    'color: #64748b; font-family: monospace'
  );
}
