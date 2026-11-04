import { useRef, useCallback, useEffect, useState, useMemo } from 'react';

/**
 * Shared gesture system for canvas interactions.
 * Supports: pan (single finger), pinch-to-zoom (two fingers), tap, double-tap, long-press.
 * Uses Pointer Events for unified mouse/touch/pen handling.
 */

export function useCanvasGestures({
  // Configuration
  minScale = 0.5,
  maxScale = 3,
  // Callbacks
  onPan,
  onZoom,
  onTap,
  onDoubleTap,
  onLongPress,
  // Element reference (canvas or wrapper)
  targetRef,
  // Whether gestures are enabled
  enabled = true,
  // Hit test function for tap/selection
  hitTest,
  // Prevent pan when pointer is over selectable/draggable object
  preventPanOnObject = false,
  // Long press delay in ms
  longPressDelay = 500,
  // Double tap threshold in ms
  doubleTapThreshold = 300,
}) {
  // Transform state
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  
  // Pointer tracking
  const pointers = useRef(new Map());
  const lastTap = useRef({ time: 0, pointerId: null, x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const isPanning = useRef(false);
  const isPinching = useRef(false);
  const pinchStart = useRef({ distance: 0, centerX: 0, centerY: 0, scale: 1 });
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const initialHitTest = useRef(null);
  
  // Get target element
  const getTarget = useCallback(() => {
    return targetRef?.current;
  }, [targetRef]);
  
  // Calculate distance between two pointers
  const getDistance = useCallback((p1, p2) => {
    const dx = p2.clientX - p1.clientX;
    const dy = p2.clientY - p1.clientY;
    return Math.hypot(dx, dy);
  }, []);
  
  // Calculate center point between two pointers
  const getCenter = useCallback((p1, p2) => {
    return {
      x: (p1.clientX + p2.clientX) / 2,
      y: (p1.clientY + p2.clientY) / 2,
    };
  }, []);
  
  // Convert client coordinates to canvas coordinates
  const clientToCanvas = useCallback((clientX, clientY) => {
    const target = getTarget();
    if (!target) return { x: clientX, y: clientY };
    
    const rect = target.getBoundingClientRect();
    const { scale, tx, ty } = transform;
    
    return {
      x: ((clientX - rect.left) - tx) / scale,
      y: ((clientY - rect.top) - ty) / scale,
    };
  }, [getTarget, transform]);
  
  // Pointer down handler
  const handlePointerDown = useCallback((e) => {
    if (!enabled) return;
    
    const target = getTarget();
    if (!target) return;
    
    // Track pointer
    pointers.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      time: Date.now(),
    });
    
    // Set pointer capture for smooth tracking
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if capture fails
    }
    
    // Long press timer
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      const pointer = pointers.current.get(e.pointerId);
      if (pointer && onLongPress) {
        const canvasPos = clientToCanvas(pointer.clientX, pointer.clientY);
        onLongPress({ clientX: pointer.clientX, clientY: pointer.clientY, canvasX: canvasPos.x, canvasY: canvasPos.y });
      }
    }, longPressDelay);
    
    // Check for double tap
    const now = Date.now();
    const timeSinceLastTap = now - lastTap.current.time;
    const isSamePointer = lastTap.current.pointerId === e.pointerId;
    const distance = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y);
    
    if (timeSinceLastTap < doubleTapThreshold && isSamePointer && distance < 20) {
      // Double tap detected
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      const canvasPos = clientToCanvas(e.clientX, e.clientY);
      if (onDoubleTap) {
        onDoubleTap({ clientX: e.clientX, clientY: e.clientY, canvasX: canvasPos.x, canvasY: canvasPos.y });
      }
      lastTap.current = { time: 0, pointerId: null, x: 0, y: 0 }; // Reset to prevent triple tap
      return;
    }
    
    lastTap.current = { time: now, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    
    // Hit test for tap/selection
    if (hitTest) {
      const canvasPos = clientToCanvas(e.clientX, e.clientY);
      const hit = hitTest(canvasPos.x, canvasPos.y);
      initialHitTest.current = hit;
    }
    
    // Handle multi-pointer gestures
    if (pointers.current.size === 2) {
      // Start pinch
      const ptrs = Array.from(pointers.current.values());
      pinchStart.current = {
        distance: getDistance(ptrs[0], ptrs[1]),
        centerX: getCenter(ptrs[0], ptrs[1]).x,
        centerY: getCenter(ptrs[0], ptrs[1]).y,
        scale: transform.scale,
      };
      isPinching.current = true;
      isPanning.current = false;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    } else if (pointers.current.size === 1) {
      // Potential pan start - don't start panning immediately, wait for movement threshold
      const pointer = pointers.current.get(e.pointerId);
      panStart.current = {
        x: pointer.clientX,
        y: pointer.clientY,
        tx: transform.tx,
        ty: transform.ty,
      };
      // Don't set isPanning.current = true here; wait for movement in handlePointerMove
      isPanning.current = false;
    }
  }, [enabled, getTarget, getDistance, getCenter, clientToCanvas, transform, onLongPress, onDoubleTap, hitTest, preventPanOnObject, longPressDelay, doubleTapThreshold]);
  
  // Pointer move handler
  const handlePointerMove = useCallback((e) => {
    if (!enabled) return;
    
    const pointer = pointers.current.get(e.pointerId);
    if (!pointer) return;
    
    // Update pointer position
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    
    // Clear long press if moved too much
    if (longPressTimer.current && !longPressTriggered.current) {
      const dx = e.clientX - pointer.startX;
      const dy = e.clientY - pointer.startY;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    // Start panning after movement threshold (5px) for single pointer
    if (!isPanning.current && !isPinching.current && pointers.current.size === 1) {
      const dx = e.clientX - pointer.startX;
      const dy = e.clientY - pointer.startY;
      if (Math.hypot(dx, dy) > 5) {
        // Check preventPanOnObject before starting pan
        if (preventPanOnObject && initialHitTest.current) {
          isPanning.current = false;
        } else {
          isPanning.current = true;
          panStart.current = {
            x: pointer.startX,
            y: pointer.startY,
            tx: transform.tx,
            ty: transform.ty,
          };
        }
      }
    }
    
    // Handle pinch
    if (isPinching.current && pointers.current.size === 2) {
      const ptrs = Array.from(pointers.current.values());
      const currentDistance = getDistance(ptrs[0], ptrs[1]);
      const center = getCenter(ptrs[0], ptrs[1]);
      
      const zoomFactor = currentDistance / pinchStart.current.distance;
      const newScale = Math.min(maxScale, Math.max(minScale, pinchStart.current.scale * zoomFactor));
      
      // Calculate translation to keep pinch center stable
      const target = getTarget();
      if (target) {
        const rect = target.getBoundingClientRect();
        const centerX = center.x - rect.left;
        const centerY = center.y - rect.top;
        
        const newTx = pinchStart.current.centerX - centerX - (pinchStart.current.centerX - centerX) * (newScale / pinchStart.current.scale);
        const newTy = pinchStart.current.centerY - centerY - (pinchStart.current.centerY - centerY) * (newScale / pinchStart.current.scale);
        
        // Adjust for current transform
        setTransform(prev => ({
          scale: newScale,
          tx: prev.tx + (newTx - (pinchStart.current.centerX - centerX - (pinchStart.current.centerX - centerX) * (prev.scale / pinchStart.current.scale))),
          ty: prev.ty + (newTy - (pinchStart.current.centerY - centerY - (pinchStart.current.centerY - centerY) * (prev.scale / pinchStart.current.scale))),
        }));
        
        // Simplified: just use the zoom factor relative to center
        setTransform(prev => {
          const scaleRatio = newScale / prev.scale;
          return {
            scale: newScale,
            tx: centerX - (centerX - prev.tx) * scaleRatio,
            ty: centerY - (centerY - prev.ty) * scaleRatio,
          };
        });
      }
      
      if (onZoom) onZoom({ scale: newScale, center });
      return;
    }
    
    // Handle pan
    if (isPanning.current && pointers.current.size === 1) {
      const pointer = pointers.current.get(e.pointerId);
      if (!pointer) return;
      
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      
      setTransform(prev => ({
        scale: prev.scale,
        tx: panStart.current.tx + dx,
        ty: panStart.current.ty + dy,
      }));
      
      if (onPan) onPan({ dx, dy, tx: panStart.current.tx + dx, ty: panStart.current.ty + dy });
      return;
    }
  }, [enabled, getDistance, getCenter, getTarget, onZoom, onPan, minScale, maxScale, transform]);
  
  // Pointer up handler
  const handlePointerUp = useCallback((e) => {
    if (!enabled) return;
    
    // Clear long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    // Release pointer capture
    const target = getTarget();
    if (target) {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
    }
    
    const pointer = pointers.current.get(e.pointerId);
    const wasPanning = isPanning.current;
    const wasPinching = isPinching.current;
    
    // Remove pointer
    pointers.current.delete(e.pointerId);
    
    // Handle tap (single tap that wasn't a pan or pinch)
    if (!wasPanning && !wasPinching && !longPressTriggered.current && pointer) {
      const dx = e.clientX - pointer.startX;
      const dy = e.clientY - pointer.startY;
      const distance = Math.hypot(dx, dy);
      const duration = Date.now() - pointer.time;
      
      // Tap: small movement, short duration
      if (distance < 10 && duration < 500) {
        const canvasPos = clientToCanvas(e.clientX, e.clientY);
        if (onTap) onTap({ clientX: e.clientX, clientY: e.clientY, canvasX: canvasPos.x, canvasY: canvasPos.y, hit: initialHitTest.current });
      }
    }
    
    // Reset gesture states
    if (pointers.current.size < 2) {
      isPinching.current = false;
    }
    if (pointers.current.size === 0) {
      isPanning.current = false;
    }
    
    initialHitTest.current = null;
  }, [enabled, getTarget, clientToCanvas, onTap]);
  
  // Pointer cancel handler
  const handlePointerCancel = useCallback((e) => {
    handlePointerUp(e);
  }, [handlePointerUp]);
  
  // Wheel zoom handler (for desktop)
  const handleWheel = useCallback((e) => {
    if (!enabled) return;
    if (!e.ctrlKey && !e.metaKey) return;
    
    e.preventDefault();
    
    const target = getTarget();
    if (!target) return;
    
    const rect = target.getBoundingClientRect();
    const centerX = e.clientX - rect.left;
    const centerY = e.clientY - rect.top;
    
    const delta = -e.deltaY * 0.001;
    const newScale = Math.min(maxScale, Math.max(minScale, transform.scale + delta));
    const zoomFactor = newScale / transform.scale;
    
    setTransform(prev => ({
      scale: newScale,
      tx: centerX - (centerX - prev.tx) * zoomFactor,
      ty: centerY - (centerY - prev.ty) * zoomFactor,
    }));
    
    if (onZoom) onZoom({ scale: newScale, center: { x: e.clientX, y: e.clientY } });
  }, [enabled, getTarget, transform, onZoom, minScale, maxScale]);
  
  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;
    
    // Reset view: R or 0
    if (e.key === 'r' || e.key === 'R' || e.key === '0') {
      if (!e.ctrlKey && !e.metaKey) {
        setTransform({ scale: 1, tx: 0, ty: 0 });
      }
    }
    
    // Zoom in: = or +
    if (e.key === '=' || e.key === '+') {
      if (!e.ctrlKey && !e.metaKey) {
        setTransform(prev => ({ scale: Math.min(maxScale, prev.scale + 0.2), tx: prev.tx, ty: prev.ty }));
      }
    }
    
    // Zoom out: - or _
    if (e.key === '-' || e.key === '_') {
      if (!e.ctrlKey && !e.metaKey) {
        setTransform(prev => ({ scale: Math.max(minScale, prev.scale - 0.2), tx: prev.tx, ty: prev.ty }));
      }
    }
  }, [enabled, minScale, maxScale]);
  
  // Public API
  const api = useMemo(() => ({
    setTransform,
    reset: () => setTransform({ scale: 1, tx: 0, ty: 0 }),
    zoomIn: () => setTransform(prev => ({ scale: Math.min(maxScale, prev.scale + 0.2), tx: prev.tx, ty: prev.ty })),
    zoomOut: () => setTransform(prev => ({ scale: Math.max(minScale, prev.scale - 0.2), tx: prev.tx, ty: prev.ty })),
    zoomTo: (scale, centerX, centerY) => {
      const target = getTarget();
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const cx = centerX ?? rect.width / 2;
      const cy = centerY ?? rect.height / 2;
      const zoomFactor = scale / transform.scale;
      setTransform(prev => ({
        scale,
        tx: cx - (cx - prev.tx) * zoomFactor,
        ty: cy - (cy - prev.ty) * zoomFactor,
      }));
    },
    panBy: (dx, dy) => setTransform(prev => ({ scale: prev.scale, tx: prev.tx + dx, ty: prev.ty + dy })),
    getTransform: () => transform,
    clientToCanvas,
  }), [getTarget, transform, maxScale, minScale, clientToCanvas]);
  
  // Attach event listeners
  useEffect(() => {
    const target = getTarget();
    if (!target || !enabled) return;
    
    target.addEventListener('pointerdown', handlePointerDown);
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerCancel);
    target.addEventListener('pointerleave', handlePointerCancel);
    target.addEventListener('wheel', handleWheel, { passive: false });
    
    // Keyboard shortcuts (on window)
    window.addEventListener('keydown', handleKeyDown);
    
    // Prevent context menu on long press
    const preventContextMenu = (e) => {
      if (longPressTriggered.current) {
        e.preventDefault();
      }
    };
    target.addEventListener('contextmenu', preventContextMenu);
    
    return () => {
      target.removeEventListener('pointerdown', handlePointerDown);
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerCancel);
      target.removeEventListener('pointerleave', handlePointerCancel);
      target.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('contextmenu', preventContextMenu);
      
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [enabled, getTarget, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleWheel, handleKeyDown]);
  
  // Return transform state and API
  return { transform, api };
}

/**
 * Hook for canvas that already has its own transform management.
 * Provides gesture detection without managing transform state.
 */
export function useGestureDetection({
  targetRef,
  enabled = true,
  onPanStart,
  onPan,
  onPanEnd,
  onPinchStart,
  onPinch,
  onPinchEnd,
  onTap,
  onDoubleTap,
  onLongPress,
  hitTest,
  preventPanOnObject = false,
  longPressDelay = 500,
  doubleTapThreshold = 300,
}) {
  const pointers = useRef(new Map());
  const lastTap = useRef({ time: 0, pointerId: null, x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const isPanning = useRef(false);
  const isPinching = useRef(false);
  const pinchStart = useRef({ distance: 0, centerX: 0, centerY: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const initialHitTest = useRef(null);
  
  const getTarget = useCallback(() => targetRef?.current, [targetRef]);
  
  const getDistance = useCallback((p1, p2) => Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY), []);
  const getCenter = useCallback((p1, p2) => ({ x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 }), []);
  
  const handlePointerDown = useCallback((e) => {
    if (!enabled) return;
    
    const target = getTarget();
    if (!target) return;
    
    pointers.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      time: Date.now(),
    });
    
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      const pointer = pointers.current.get(e.pointerId);
      if (pointer && onLongPress) {
        onLongPress({ clientX: pointer.clientX, clientY: pointer.clientY });
      }
    }, longPressDelay);
    
    // Double tap detection
    const now = Date.now();
    const timeSinceLastTap = now - lastTap.current.time;
    const isSamePointer = lastTap.current.pointerId === e.pointerId;
    const distance = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y);
    
    if (timeSinceLastTap < doubleTapThreshold && isSamePointer && distance < 20) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (onDoubleTap) onDoubleTap({ clientX: e.clientX, clientY: e.clientY });
      lastTap.current = { time: 0, pointerId: null, x: 0, y: 0 };
      return;
    }
    
    lastTap.current = { time: now, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    
    // Hit test
    if (hitTest) {
      initialHitTest.current = hitTest(e.clientX, e.clientY);
    }
    
    // Multi-pointer gestures
    if (pointers.current.size === 2) {
      const ptrs = Array.from(pointers.current.values());
      pinchStart.current = {
        distance: getDistance(ptrs[0], ptrs[1]),
        centerX: getCenter(ptrs[0], ptrs[1]).x,
        centerY: getCenter(ptrs[0], ptrs[1]).y,
      };
      isPinching.current = true;
      isPanning.current = false;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (onPinchStart) onPinchStart({ center: getCenter(ptrs[0], ptrs[1]) });
    } else if (pointers.current.size === 1) {
      const pointer = pointers.current.get(e.pointerId);
      panStart.current = { x: pointer.clientX, y: pointer.clientY };
      
      if (preventPanOnObject && initialHitTest.current) {
        isPanning.current = false;
      } else {
        isPanning.current = true;
        if (onPanStart) onPanStart({ clientX: pointer.clientX, clientY: pointer.clientY, hit: initialHitTest.current });
      }
    }
  }, [enabled, getTarget, getDistance, getCenter, onLongPress, onDoubleTap, hitTest, preventPanOnObject, longPressDelay, doubleTapThreshold, onPinchStart, onPanStart]);
  
  const handlePointerMove = useCallback((e) => {
    if (!enabled) return;
    
    const pointer = pointers.current.get(e.pointerId);
    if (!pointer) return;
    
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    
    // Clear long press if moved
    if (longPressTimer.current && !longPressTriggered.current) {
      const dx = e.clientX - pointer.startX;
      const dy = e.clientY - pointer.startY;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    
    // Pinch
    if (isPinching.current && pointers.current.size === 2) {
      const ptrs = Array.from(pointers.current.values());
      const currentDistance = getDistance(ptrs[0], ptrs[1]);
      const center = getCenter(ptrs[0], ptrs[1]);
      const scale = currentDistance / pinchStart.current.distance;
      
      if (onPinch) onPinch({ scale, center, startCenter: { x: pinchStart.current.centerX, y: pinchStart.current.centerY } });
      return;
    }
    
    // Pan
    if (isPanning.current && pointers.current.size === 1) {
      const pointer = pointers.current.get(e.pointerId);
      if (!pointer) return;
      
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      
      if (onPan) onPan({ dx, dy, clientX: e.clientX, clientY: e.clientY });
      return;
    }
  }, [enabled, getDistance, getCenter, onPinch, onPan]);
  
  const handlePointerUp = useCallback((e) => {
    if (!enabled) return;
    
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    const target = getTarget();
    if (target) {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    
    const pointer = pointers.current.get(e.pointerId);
    const wasPanning = isPanning.current;
    const wasPinching = isPinching.current;
    
    pointers.current.delete(e.pointerId);
    
    // Tap
    if (!wasPanning && !wasPinching && !longPressTriggered.current && pointer) {
      const dx = e.clientX - pointer.startX;
      const dy = e.clientY - pointer.startY;
      const distance = Math.hypot(dx, dy);
      const duration = Date.now() - pointer.time;
      
      if (distance < 10 && duration < 500) {
        if (onTap) onTap({ clientX: e.clientX, clientY: e.clientY, hit: initialHitTest.current });
      }
    }
    
    // End gestures
    if (wasPinching && onPinchEnd) onPinchEnd({});
    if (wasPanning && onPanEnd) onPanEnd({});
    
    if (pointers.current.size < 2) isPinching.current = false;
    if (pointers.current.size === 0) isPanning.current = false;
    
    initialHitTest.current = null;
  }, [enabled, getTarget, onTap, onPinchEnd, onPanEnd]);
  
  const handlePointerCancel = useCallback((e) => handlePointerUp(e), [handlePointerUp]);
  
  useEffect(() => {
    const target = getTarget();
    if (!target || !enabled) return;
    
    target.addEventListener('pointerdown', handlePointerDown);
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerCancel);
    target.addEventListener('pointerleave', handlePointerCancel);
    
    const preventContextMenu = (e) => {
      if (longPressTriggered.current) e.preventDefault();
    };
    target.addEventListener('contextmenu', preventContextMenu);
    
    return () => {
      target.removeEventListener('pointerdown', handlePointerDown);
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerCancel);
      target.removeEventListener('pointerleave', handlePointerCancel);
      target.removeEventListener('contextmenu', preventContextMenu);
      
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, [enabled, getTarget, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel]);
  
  return {
    isPanning: isPanning.current,
    isPinching: isPinching.current,
  };
}