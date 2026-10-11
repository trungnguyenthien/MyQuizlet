/**
 * MyQuizlet - Gesture Engine
 * High-performance Pointer Events swipe and drag engine with axis locking,
 * scroll conflict resolution, code horizontal scroll passthrough, and rAF physics.
 */

/**
 * Attach swipe and gesture handlers to a card or container element.
 * 
 * @param {HTMLElement} element 
 * @param {{
 *   onUp?: () => void,
 *   onDown?: () => void,
 *   onSide?: (direction: number) => void, // 1 for right, -1 for left
 *   onTap?: () => void
 * }} callbacks 
 * @returns {() => void} cleanup function
 */
export function attachSwipe(element, { onUp, onDown, onSide, onTap } = {}) {
  if (!element) return () => {};

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let startTime = 0;
  let axisLocked = null; // 'h' | 'v' | null
  let isDragging = false;
  let rafId = null;
  let allowVerticalSwipe = false;
  let targetScrollEl = null;

  function findScrollableParent(target) {
    let node = target;
    while (node && node !== element && node !== document.body) {
      if (node.classList && node.classList.contains('card-scroll')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function isInsideCodeBlock(target) {
    let node = target;
    while (node && node !== element) {
      if (node.tagName === 'PRE' || node.tagName === 'CODE') {
        // If it is horizontally scrollable, don't intercept horizontal swipes
        if (node.scrollWidth > node.clientWidth) {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  }

  function isInteractiveElement(target) {
    const tag = target.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    if (target.closest && (target.closest('button') || target.closest('a'))) {
      return true;
    }
    return false;
  }

  function updateTransform() {
    if (!isDragging) return;

    const dx = currentX - startX;
    const dy = currentY - startY;

    if (axisLocked === 'h') {
      // Horizontal drag: subtle rotation and resistance
      const rot = Math.min(Math.max(dx * 0.04, -15), 15);
      element.style.transform = `translate3d(${dx * 0.45}px, 0, 0) rotate(${rot}deg)`;
    } else if (axisLocked === 'v' && allowVerticalSwipe) {
      // Vertical drag: resistance pull
      element.style.transform = `translate3d(0, ${dy * 0.45}px, 0)`;
    }
  }

  function resetTransform(animated = true) {
    if (animated) {
      element.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
      element.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      setTimeout(() => {
        element.style.transition = '';
      }, 260);
    } else {
      element.style.transition = '';
      element.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
    }
  }

  function onPointerDown(e) {
    // Only primary mouse button or touch
    if (e.button !== undefined && e.button !== 0) return;
    if (isInteractiveElement(e.target)) return;

    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
    startTime = Date.now();
    axisLocked = null;
    isDragging = false;
    element.style.transition = '';

    targetScrollEl = findScrollableParent(e.target);
    allowVerticalSwipe = false;

    // Check code block horizontal scrolling
    if (isInsideCodeBlock(e.target)) {
      // Inside scrollable code block, let user scroll code
      return;
    }

    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Ignore capture errors on unsupported browsers
    }
  }

  function onPointerMove(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;

    currentX = e.clientX;
    currentY = e.clientY;
    const dx = currentX - startX;
    const dy = currentY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Axis decision threshold (10px)
    if (!axisLocked && (absX > 10 || absY > 10)) {
      if (absX >= absY) {
        axisLocked = 'h';
        isDragging = true;
      } else {
        axisLocked = 'v';
        // Check if inner content is scrollable
        if (targetScrollEl) {
          const isAtTop = targetScrollEl.scrollTop <= 2;
          const isAtBottom = targetScrollEl.scrollTop + targetScrollEl.clientHeight >= targetScrollEl.scrollHeight - 3;

          // Pull down at top or pull up at bottom
          if ((dy > 0 && isAtTop) || (dy < 0 && isAtBottom)) {
            allowVerticalSwipe = true;
            isDragging = true;
          } else {
            // Normal inner scroll
            allowVerticalSwipe = false;
            isDragging = false;
          }
        } else {
          allowVerticalSwipe = true;
          isDragging = true;
        }
      }
    }

    if (isDragging) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateTransform);
    }
  }

  function onPointerUp(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;

    if (rafId) cancelAnimationFrame(rafId);
    const endTime = Date.now();
    const duration = Math.max(endTime - startTime, 1);
    const dx = currentX - startX;
    const dy = currentY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const velocityY = absY / duration;

    try {
      element.releasePointerCapture(pointerId);
    } catch {
      // Ignore
    }

    pointerId = null;

    // Tap detection: short duration and small distance
    if (!isDragging && absX < 8 && absY < 8 && duration < 320) {
      if (onTap) onTap();
      resetTransform(false);
      return;
    }

    // Horizontal Flip detection: |dx| > 50px
    if (axisLocked === 'h' && absX > 50) {
      const direction = dx > 0 ? 1 : -1;
      resetTransform(false);
      if (onSide) onSide(direction);
      return;
    }

    // Vertical Next / Previous detection: |dy| > 60px or fast swipe
    if (axisLocked === 'v' && allowVerticalSwipe) {
      if (dy < -60 || (dy < -30 && velocityY > 0.45)) {
        // Swipe Up -> Next
        resetTransform(false);
        if (onUp) onUp();
        return;
      } else if (dy > 60 || (dy > 30 && velocityY > 0.45)) {
        // Swipe Down -> Back
        resetTransform(false);
        if (onDown) onDown();
        return;
      }
    }

    // Snap back if threshold not met
    resetTransform(true);
    isDragging = false;
    axisLocked = null;
  }

  function onPointerCancel(e) {
    if (pointerId !== null && e.pointerId === pointerId) {
      if (rafId) cancelAnimationFrame(rafId);
      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // Ignore
      }
      pointerId = null;
      isDragging = false;
      axisLocked = null;
      resetTransform(true);
    }
  }

  element.addEventListener('pointerdown', onPointerDown, { passive: true });
  element.addEventListener('pointermove', onPointerMove, { passive: true });
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
  };
}
