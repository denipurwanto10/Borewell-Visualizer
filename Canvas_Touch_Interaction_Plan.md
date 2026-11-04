# Canvas Touch Interaction Implementation Plan

**Project**: Visualisasi Pipa Sumur Bor  
**Phase**: 3 — Canvas Interaction Overhaul  
**Depends On**: Phase 2.1 Responsive Remediation complete  
**Target**: DesignerCanvas, GeologyLogCanvas, MonitoringHydrographCanvas

---

## 1. Current Desktop Architecture

### DesignerCanvas (`src/components/DesignerCanvas.jsx`)

| Interaction | Event | Handler |
|-------------|-------|---------|
| Pan | `pointerdown`/`pointermove`/`pointerup` on wrapper | `handleWrapperDown/Move/Up` |
| Zoom | `wheel` + Ctrl/Cmd | `onWheel` (e.ctrlKey/e.metaKey) |
| Select Component | `pointerdown` on canvas | `handleDown` → hit-test → `onSelect` |
| Hover Tooltip | `pointermove` on canvas | `handleMove` → hit-test → tooltip |

### CanvasControls (`src/components/CanvasControls.jsx`)

| Button | Action |
|--------|--------|
| Fit | `fitToScreen()` → reset transform |
| Zoom In | `zoomIn()` → scale +0.2 |
| Zoom Out | `zoomOut()` → scale -0.2 |
| Reset | `resetView()` → reset transform |
| Fullscreen | `requestFullscreen()` / `exitFullscreen()` |
| Export PNG | `canvas.toDataURL('image/png')` |

### Transform State

```js
const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
// Applied via CSS: transform: translate(${tx}px, ${ty}px) scale(${scale})
```

---

## 2. Touch Conflicts Analysis

| Touch Gesture | Current Behavior | Conflict | Resolution |
|---------------|------------------|----------|------------|
| **1-finger drag** | Component selection (hit-test on pointerdown) | Prevents pan | **Require 2-finger for pan** |
| **Pinch (2-finger)** | Not handled → may trigger wheel zoom | Unintended zoom | **Add pinch recognizer; disable wheel zoom on touch** |
| **Double-tap** | Not handled | — | **Map to "Fit to Screen"** |
| **Long press** | Not handled | — | **Map to context menu (edit/duplicate/delete)** |
| **Single tap** | Component selection | OK | **Keep as select** |

### Touch-Action CSS

Current: `touch-action: manipulation` on canvas — allows browser pinch/pan but conflicts with custom handlers.

Required: `touch-action: none` during active gesture, `manipulation` otherwise.

---

## 3. Gesture Recognizer Design

### TouchGestureManager Class

```javascript
class TouchGestureManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onPan = options.onPan || (() => {});
    this.onPinch = options.onPinch || (() => {});
    this.onTap = options.onTap || (() => {});
    this.onDoubleTap = options.onDoubleTap || (() => {});
    this.onLongPress = options.onLongPress || (() => {});
    
    this.pointers = new Map(); // pointerId → { x, y, startTime, startX, startY }
    this.gestureState = 'idle'; // 'idle' | 'pan' | 'pinch' | 'tap' | 'longpress'
    this.lastTap = 0;
    this.longPressTimer = null;
    
    this.bind();
  }
  
  bind() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this), { passive: false });
    this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this), { passive: false });
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointerleave', this.onPointerUp.bind(this));
  }
  
  onPointerDown(e) {
    // Prevent default browser gestures during our handling
    if (e.pointerType === 'touch') e.preventDefault();
    
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY,
      startX: e.clientX, startY: e.clientY,
      startTime: Date.now()
    });
    
    if (this.pointers.size === 1) {
      // Potential tap or long press
      this.gestureState = 'tap';
      this.longPressTimer = setTimeout(() => {
        if (this.gestureState === 'tap') {
          this.gestureState = 'longpress';
          this.onLongPress(this.pointers.values().next().value);
        }
      }, 500);
    } else if (this.pointers.size === 2) {
      // Pinch gesture
      clearTimeout(this.longPressTimer);
      this.gestureState = 'pinch';
      this.pinchStart = this.getPinchState();
    }
    
    this.canvas.style.touchAction = 'none';
  }
  
  onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    
    const ptr = this.pointers.get(e.pointerId);
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    
    if (this.gestureState === 'pinch' && this.pointers.size === 2) {
      const pinch = this.getPinchState();
      this.onPinch({
        scale: pinch.distance / this.pinchStart.distance,
        origin: pinch.center,
        rotation: pinch.angle - this.pinchStart.angle
      });
    } else if (this.gestureState === 'tap' && this.pointers.size === 1) {
      const dx = e.clientX - ptr.startX;
      const dy = e.clientY - ptr.startY;
      if (Math.hypot(dx, dy) > 10) {
        // Drag threshold exceeded → cancel tap/longpress
        clearTimeout(this.longPressTimer);
        this.gestureState = 'pan';
      }
    } else if (this.gestureState === 'pan') {
      const ptrs = Array.from(this.pointers.values());
      const dx = ptrs[0].x - ptrs[0].startX;
      const dy = ptrs[0].y - ptrs[0].startY;
      this.onPan({ dx, dy });
    }
  }
  
  onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    
    if (this.gestureState === 'tap') {
      clearTimeout(this.longPressTimer);
      const now = Date.now();
      if (now - this.lastTap < 300) {
        this.onDoubleTap(this.pointers.get(e.pointerId));
      } else {
        this.onTap(this.pointers.get(e.pointerId));
      }
      this.lastTap = now;
    } else if (this.gestureState === 'longpress') {
      // Already handled in timer
    }
    
    this.pointers.delete(e.pointerId);
    
    if (this.pointers.size === 0) {
      this.gestureState = 'idle';
      this.canvas.style.touchAction = 'manipulation';
    } else if (this.pointers.size === 1 && this.gestureState === 'pinch') {
      // Pinch ended, back to single finger
      this.gestureState = 'tap';
    }
  }
  
  getPinchState() {
    const ptrs = Array.from(this.pointers.values());
    const p1 = ptrs[0], p2 = ptrs[1];
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    return { center, distance, angle };
  }
  
  destroy() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerUp);
  }
}
```

---

## 4. Integration with DesignerCanvas

### New Transform State

```javascript
const [transform, setTransform] = useState({ 
  scale: 1, 
  tx: 0, 
  ty: 0,
  // Pinch adds:
  pinchOrigin: null, // { x, y } in canvas coords
  pinchScale: 1      // additional scale from pinch
});

// Combined scale for rendering:
const effectiveScale = transform.scale * (transform.pinchScale || 1);
```

### Gesture Callbacks

```javascript
const onPan = useCallback(({ dx, dy }) => {
  setTransform(prev => ({
    ...prev,
    tx: prev.tx + dx / effectiveScale,
    ty: prev.ty + dy / effectiveScale
  }));
}, [effectiveScale]);

const onPinch = useCallback(({ scale, origin }) => {
  // origin is in screen coords; convert to canvas coords
  const canvasRect = canvasRef.current.getBoundingClientRect();
  const canvasOrigin = {
    x: (origin.x - canvasRect.left - transform.tx) / transform.scale,
    y: (origin.y - canvasRect.top - transform.ty) / transform.scale
  };
  setTransform(prev => ({
    ...prev,
    pinchScale: scale,
    pinchOrigin: canvasOrigin
  }));
}, [transform]);

const onDoubleTap = useCallback((pointer) => {
  // Fit to screen
  setTransform({ scale: 1, tx: 0, ty: 0, pinchScale: 1, pinchOrigin: null });
}, []);

const onLongPress = useCallback((pointer) => {
  // Show context menu at pointer position
  // Convert to canvas coords, hit-test, show component actions
}, []);

const onTap = useCallback((pointer) => {
  // Single tap = select component (existing hit-test logic)
}, []);
```

### Touch-Action Management

```javascript
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  
  // Start with manipulation (allows browser scroll/zoom)
  canvas.style.touchAction = 'manipulation';
  
  // Gesture manager will override to 'none' during active gesture
  // and restore to 'manipulation' when done
  
  return () => {
    canvas.style.touchAction = 'manipulation';
  };
}, []);
```

### Disable Wheel Zoom on Touch Devices

```javascript
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  
  const onWheel = (e) => {
    if (e.pointerType === 'touch') return; // Handled by pinch
    if (!e.ctrlKey && !e.metaKey) return;
    // ... existing wheel zoom logic
  };
  
  canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => canvas.removeEventListener('wheel', onWheel);
}, []);
```

---

## 5. CanvasControls Touch Updates

### Pinch Zoom Indicator

```jsx
// In CanvasControls
{transform.pinchScale && transform.pinchScale !== 1 && (
  <div className="pinch-zoom-indicator">
    {Math.round(transform.scale * transform.pinchScale * 100)}%
  </div>
)}
```

### Touch-Friendly Button Sizing

```css
/* Already in mobile.css */
@media (max-width: 820px) {
  .canvas-controls .btn { min-height: 48px; min-width: 48px; }
}
```

---

## 6. GeologyLogCanvas & MonitoringHydrographCanvas

### Shared Gesture Manager

Extract `TouchGestureManager` to `src/utils/touchGestures.js` for reuse.

### GeologyLogCanvas Specifics

- Pan: horizontal scroll through depth
- Pinch: vertical zoom (depth scale)
- Tap: select layer
- Long press: layer actions

### MonitoringHydrographCanvas Specifics

- Pan: horizontal (time) + vertical (depth)
- Pinch: proportional zoom both axes
- Tap: select measurement point
- Long press: measurement actions

---

## 7. Testing Matrix

| Device | OS | Browser | Gestures to Test |
|--------|-----|---------|------------------|
| iPhone 14 | iOS 17 | Safari | Pan, pinch, tap, double-tap, long press |
| iPad Pro | iPadOS 17 | Safari | All + Apple Pencil |
| Galaxy S23 | Android 14 | Chrome | All |
| Surface Pro | Windows 11 | Edge | Touch + mouse + pen |
| Desktop | macOS/Windows | Chrome/Firefox | Mouse only (no regression) |

### Automated Tests (Phase 3)

```javascript
// e2e tests using Playwright
test('DesignerCanvas: two-finger pan moves canvas', async ({ page }) => {
  await page.goto('/#/desain');
  const canvas = page.locator('.designer-sheet canvas');
  await canvas.dispatchEvent('pointerdown', { pointerType: 'touch', ... });
  // ... simulate two-finger drag
  await expect(canvas).toHaveCSS('transform', /translate.*scale/);
});

test('DesignerCanvas: pinch zoom scales canvas', async ({ page }) => {
  // ... simulate pinch gesture
});

test('DesignerCanvas: double-tap fits to screen', async ({ page }) => {
  // ... simulate double-tap
});

test('DesignerCanvas: long press shows context menu', async ({ page }) => {
  // ... simulate long press
});
```

---

## 8. Files to Modify (Phase 3)

| File | Changes |
|------|---------|
| `src/utils/touchGestures.js` | **NEW** — `TouchGestureManager` class |
| `src/components/DesignerCanvas.jsx` | Integrate gesture manager, update transform state, add touch-action management |
| `src/components/GeologyLogCanvas.jsx` | Integrate gesture manager |
| `src/components/MonitoringHydrographCanvas.jsx` | Integrate gesture manager |
| `src/components/CanvasControls.jsx` | Add pinch zoom indicator |
| `src/mobile.css` | Touch-action overrides, control sizing |

---

## 9. Acceptance Criteria

| Criterion | Pass Condition |
|-----------|----------------|
| Two-finger pan | Canvas translates smoothly, no selection triggered |
| Pinch zoom | Canvas scales from pinch center, zoom limits 0.5x–3x |
| Single tap | Selects component, shows tooltip |
| Double-tap | Fits canvas to screen (calls `fitToScreen()`) |
| Long press (500ms) | Shows context menu for component under finger |
| Mouse/keyboard | No regression — all desktop interactions work |
| Touch-action | No browser scroll/zoom during gestures; restored after |
| Performance | 60fps during pan/pinch on 5-year-old mobile devices |

---

## 10. Timeline Estimate

| Task | Effort |
|------|--------|
| TouchGestureManager implementation | 1 day |
| DesignerCanvas integration | 1.5 days |
| GeologyLogCanvas integration | 0.5 days |
| MonitoringHydrographCanvas integration | 0.5 days |
| CanvasControls updates | 0.5 days |
| Cross-device testing | 1 day |
| Bug fixes & polish | 0.5 days |
| **Total** | **~5.5 days** |

---

*Plan created as part of Phase 2.1 deliverables — implementation deferred to Phase 3*