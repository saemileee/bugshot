# Low-End Device Testing Guide

## Quick Test (Chrome DevTools)

### Step 1: Enable CPU Throttling
```
1. F12 (DevTools)
2. Performance tab
3. Settings (⚙️)
4. CPU: "4x slowdown"
```

### Step 2: Test Critical Operations

#### Test 1: Element Selection
```
❌ Fail: UI freezes > 1 second
⚠️  Warning: UI freezes 0.5-1 second
✅ Pass: Smooth, no noticeable delay
```

**How to test:**
1. Open BugShot widget
2. Click element picker
3. Hover over complex elements (many CSS rules)
4. Click to select

**Expected on 4x slowdown:**
- Selection: < 1 second
- Hover highlight: No lag

#### Test 2: Widget Drag
```
❌ Fail: Choppy, stuttering
⚠️  Warning: Occasional frame drops
✅ Pass: Smooth 30+ fps
```

**How to test:**
1. Grab widget toolbar
2. Drag rapidly across screen
3. Check Performance Monitor

**Expected on 4x slowdown:**
- FPS: > 30
- No stuttering

#### Test 3: Annotation Drawing
```
❌ Fail: Lag visible, cursor ahead of drawing
⚠️  Warning: Slight lag on large canvas
✅ Pass: Cursor and drawing in sync
```

**How to test:**
1. Take screenshot
2. Draw arrow/rectangle rapidly
3. Move mouse fast

**Expected on 4x slowdown:**
- Drawing follows cursor
- No visible lag

## Manual Testing Checklist

Use this checklist before every release:

### Performance (4x CPU Throttling)
- [ ] Element selection < 1s
- [ ] Widget drag smooth (30+ fps)
- [ ] Annotation drawing no lag
- [ ] Settings panel opens instantly
- [ ] Submit preview < 500ms

### Memory (Performance Monitor)
- [ ] Idle heap: < 50MB
- [ ] After 10 actions: heap growth < 10MB
- [ ] After widget close: heap returns to baseline

### Stress Test (6x CPU Throttling)
- [ ] No "Page Unresponsive" warnings
- [ ] UI still usable (even if slow)
- [ ] No crashes

## Automated Test (Console)

Paste in DevTools Console:

\`\`\`javascript
// Start low-end simulation
const stopSimulation = window.bugshot?.simulateLowEndDevice?.('medium');

// Test operations
console.log('=== Testing with simulated low-end device ===');

// Test 1: Measure widget open
performance.mark('widget-open-start');
// (manually open widget)
performance.mark('widget-open-end');
performance.measure('widget-open', 'widget-open-start', 'widget-open-end');

// Test 2: Measure element selection
performance.mark('select-start');
// (manually select element)
performance.mark('select-end');
performance.measure('select', 'select-start', 'select-end');

// Check results
const results = performance.getEntriesByType('measure');
results.forEach(m => {
  const status = m.duration < 1000 ? '✅' : '❌';
  console.log(\`\${status} \${m.name}: \${m.duration.toFixed(0)}ms\`);
});

// Stop simulation
if (stopSimulation) stopSimulation();
\`\`\`

## Real Device Testing

### Low-End Device Profiles

#### Budget Laptop (Common)
- **CPU:** Intel Core i3 (8th gen or older)
- **RAM:** 4GB
- **Browser:** Chrome with 10+ tabs open
- **Expected:** Should be usable, slight lag acceptable

#### Old MacBook (2015-2017)
- **CPU:** Intel Core i5 Dual-core
- **RAM:** 8GB
- **Browser:** Chrome with multiple extensions
- **Expected:** Should be smooth

#### Budget Chromebook
- **CPU:** Celeron N4020
- **RAM:** 4GB
- **Browser:** Chrome OS
- **Expected:** Basic functionality, some lag OK

### Test on BrowserStack / LambdaTest

If you don't have physical devices:

\`\`\`bash
# BrowserStack
1. Go to live.browserstack.com
2. Select: Windows 10, Chrome, Low-end device preset
3. Install extension
4. Test all features
\`\`\`

## Performance Targets by Device

| Device Type | Element Select | Widget Drag | Annotation | Submit |
|-------------|----------------|-------------|------------|---------|
| High-end    | < 200ms        | 60fps       | 60fps      | < 300ms |
| Mid-range   | < 500ms        | 30-60fps    | 30-60fps   | < 500ms |
| Low-end     | < 1000ms       | 20-30fps    | 20-30fps   | < 1000ms |
| Very old    | < 2000ms       | 15fps+      | 15fps+     | < 2000ms |

**Note:** "Very old" = should still be usable, just slow
