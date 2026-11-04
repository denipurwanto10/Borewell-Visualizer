import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasGestures } from './useCanvasGestures';

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn(id => clearTimeout(id));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock getBoundingClientRect
const mockRect = {
  left: 0,
  top: 0,
  width: 800,
  height: 600,
};

describe('useCanvasGestures', () => {
  let container;
  let target;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    
    target = document.createElement('div');
    target.style.width = '800px';
    target.style.height = '600px';
    target.getBoundingClientRect = vi.fn(() => mockRect);
    container.appendChild(target);
    
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createPointerEvent = (type, pointerId, clientX, clientY, options = {}) => {
    const event = new PointerEvent(type, {
      pointerId,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      pointerType: options.pointerType || 'mouse',
      button: options.button || 0,
      ctrlKey: options.ctrlKey || false,
      metaKey: options.metaKey || false,
      ...options,
    });
    return event;
  };

  const createWheelEvent = (deltaY, clientX, clientY, options = {}) => {
    const event = new WheelEvent('wheel', {
      deltaY,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      ctrlKey: options.ctrlKey || false,
      metaKey: options.metaKey || false,
      ...options,
    });
    return event;
  };

  it('should initialize with default transform', () => {
    const targetRef = { current: target };
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
    }));

    expect(result.current.transform).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('should handle single pointer pan', () => {
    const onPan = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onPan,
    }));

    // Pointer down
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    // Pointer move
    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 150, 150));
    });

    // Should have panned
    expect(result.current.transform.tx).toBe(50);
    expect(result.current.transform.ty).toBe(50);
    expect(onPan).toHaveBeenCalled();

    // Pointer up
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 150, 150));
    });
  });

  it('should handle two pointer pinch zoom', () => {
    const onZoom = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onZoom,
    }));

    // First pointer down
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    // Second pointer down (start pinch)
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 2, 300, 100));
    });

    // Move second pointer to pinch
    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 2, 350, 100));
    });

    // Should have zoomed
    expect(result.current.transform.scale).toBeGreaterThan(1);
    expect(onZoom).toHaveBeenCalled();

    // Pointer up
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 100, 100));
      target.dispatchEvent(createPointerEvent('pointerup', 2, 350, 100));
    });
  });

  it('should handle pinch zoom centered on midpoint', () => {
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      minScale: 0.5,
      maxScale: 3,
    }));

    // Two pointers at (100, 100) and (300, 100) - center at (200, 100)
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
      target.dispatchEvent(createPointerEvent('pointerdown', 2, 300, 100));
    });

    // Pinch out - move pointers apart
    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 50, 100));
      target.dispatchEvent(createPointerEvent('pointermove', 2, 350, 100));
    });

    const { scale, tx, ty } = result.current.transform;
    expect(scale).toBeGreaterThan(1);
    
    // Center should remain roughly at (200, 100) in screen coordinates
    // The transform should keep the pinch center stable
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 50, 100));
      target.dispatchEvent(createPointerEvent('pointerup', 2, 350, 100));
    });
  });

  it('should distinguish tap from pan', () => {
    const onTap = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onTap,
    }));

    // Quick tap - small movement, short duration
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    // Advance time slightly (don't wrap in act)
    vi.advanceTimersByTime(50);

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 101, 101)); // Very small movement
    });

    expect(onTap).toHaveBeenCalled();

    // Reset
    onTap.mockClear();

    // Pan - larger movement
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 2, 200, 200));
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 2, 250, 250));
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 2, 250, 250));
    });

    // Should not trigger tap
    expect(onTap).not.toHaveBeenCalled();
  });

  it('should handle double tap', () => {
    const onDoubleTap = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onDoubleTap,
      doubleTapThreshold: 300,
    }));

    // First tap
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 101, 101));
    });

    // Second tap within threshold
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 101, 101));
    });

    expect(onDoubleTap).toHaveBeenCalled();
  });

  it('should handle long press', () => {
    const onLongPress = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onLongPress,
      longPressDelay: 500,
    }));

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    // Advance past long press delay
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onLongPress).toHaveBeenCalled();

    // Clean up
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 100, 100));
    });
  });

  it('should cancel long press on pointer move', () => {
    const onLongPress = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onLongPress,
      longPressDelay: 500,
    }));

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    // Move pointer before long press triggers
    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 115, 115));
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 115, 115));
    });
  });

  it('should cancel long press on pointer up before delay', () => {
    const onLongPress = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onLongPress,
      longPressDelay: 500,
    }));

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 100, 100));
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should handle pointer cancellation', () => {
    const onPan = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onPan,
    }));

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 150, 150));
    });

    // Cancel instead of up
    act(() => {
      target.dispatchEvent(createPointerEvent('pointercancel', 1, 150, 150));
    });

    // Should not crash
    expect(result.current.transform.tx).toBe(50);
  });

  it('should handle wheel zoom with ctrl/meta key', () => {
    const onZoom = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      onZoom,
    }));

    // Wheel with ctrl key
    act(() => {
      target.dispatchEvent(createWheelEvent(-100, 400, 300, { ctrlKey: true }));
    });

    expect(result.current.transform.scale).toBeGreaterThan(1);
    expect(onZoom).toHaveBeenCalled();

    // Wheel without modifier key should not zoom
    onZoom.mockClear();
    act(() => {
      target.dispatchEvent(createWheelEvent(-100, 400, 300, { ctrlKey: false }));
    });

    expect(onZoom).not.toHaveBeenCalled();
  });

  it('should respect min/max scale bounds', () => {
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      minScale: 0.5,
      maxScale: 2,
    }));

    // Zoom in past max
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 100, 100));
      target.dispatchEvent(createPointerEvent('pointerdown', 2, 300, 100));
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 0, 100));
      target.dispatchEvent(createPointerEvent('pointermove', 2, 400, 100));
    });

    expect(result.current.transform.scale).toBeLessThanOrEqual(2);

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 0, 100));
      target.dispatchEvent(createPointerEvent('pointerup', 2, 400, 100));
    });

    // Zoom out past min
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 200, 100));
      target.dispatchEvent(createPointerEvent('pointerdown', 2, 250, 100));
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 190, 100));
      target.dispatchEvent(createPointerEvent('pointermove', 2, 260, 100));
    });

    expect(result.current.transform.scale).toBeGreaterThanOrEqual(0.5);
  });

  it('should provide API methods', () => {
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
    }));

    // Test reset
    act(() => {
      result.current.api.reset();
    });
    expect(result.current.transform).toEqual({ scale: 1, tx: 0, ty: 0 });

    // Test zoomIn
    act(() => {
      result.current.api.zoomIn();
    });
    expect(result.current.transform.scale).toBe(1.2);

    // Test zoomOut
    act(() => {
      result.current.api.zoomOut();
    });
    expect(result.current.transform.scale).toBe(1.0);

    // Test panBy
    act(() => {
      result.current.api.panBy(10, 20);
    });
    expect(result.current.transform.tx).toBe(10);
    expect(result.current.transform.ty).toBe(20);
  });

  it('should cleanup event listeners on unmount', () => {
    const targetRef = { current: target };
    const removeEventListenerSpy = vi.spyOn(target, 'removeEventListener');
    
    const { unmount } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
    }));

    unmount();

    // Should have removed event listeners
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });

  it('should handle hitTest for tap selection', () => {
    const hitTest = vi.fn((x, y) => {
      if (x > 100 && x < 200 && y > 100 && y < 200) return { id: 'obj1' };
      return null;
    });
    const onTap = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      hitTest,
      onTap,
    }));

    // Tap on object
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 150, 150));
    });
    vi.advanceTimersByTime(50);
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 151, 151));
    });

    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({
      hit: expect.objectContaining({ id: 'obj1' }),
    }));

    // Tap outside object
    onTap.mockClear();
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 50, 50));
    });
    vi.advanceTimersByTime(50);
    act(() => {
      target.dispatchEvent(createPointerEvent('pointerup', 1, 51, 51));
    });

    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({
      hit: null,
    }));
  });

  it('should prevent pan when preventPanOnObject and hitTest returns object', () => {
    const hitTest = vi.fn(() => ({ id: 'obj1' }));
    const onPan = vi.fn();
    const targetRef = { current: target };
    
    const { result } = renderHook(() => useCanvasGestures({
      targetRef,
      enabled: true,
      hitTest,
      preventPanOnObject: true,
      onPan,
    }));

    act(() => {
      target.dispatchEvent(createPointerEvent('pointerdown', 1, 150, 150));
    });

    act(() => {
      target.dispatchEvent(createPointerEvent('pointermove', 1, 200, 200));
    });

    // Should not pan because preventPanOnObject is true and hitTest returns object
    expect(onPan).not.toHaveBeenCalled();
    expect(result.current.transform.tx).toBe(0);
    expect(result.current.transform.ty).toBe(0);
  });
});