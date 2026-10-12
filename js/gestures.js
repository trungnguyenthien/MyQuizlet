/**
 * MyQuizlet - Gesture Engine
 * High-performance Pointer Events swipe and drag engine with horizontal axis locking,
 * completely unhindered vertical native scrolling for long answers, and rAF physics.
 */

/**
 * Attach swipe and gesture handlers to a card or track element.
 * 
 * @param {HTMLElement} element 
 * @param {{
 *   onNext?: () => void,  // Triggered on Swipe Left (advance to next card)
 *   onBack?: () => void,  // Triggered on Swipe Right (return to previous card)
 *   onTap?: () => void,   // Triggered on quick tap on empty area
 *   onUp?: () => void,    // Fallback optional
 *   onDown?: () => void   // Fallback optional
 * }} callbacks 
 * @returns {() => void} cleanup function
 */
export function attachSwipe(element, { onNext, onBack, onTap, onUp, onDown } = {}) {
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
  let captured = false;

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
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    if (target.closest && (target.closest('button') || target.closest('a') || target.closest('.card-flip-btn'))) {
      return true;
    }
    return false;
  }

  function updateTransform() {
    if (!isDragging || axisLocked !== 'h') return;

    const dx = currentX - startX;
    // Horizontal drag: subtle rotation and resistance
    const rot = Math.min(Math.max(dx * 0.035, -12), 12);
    element.style.transform = `translate3d(${dx * 0.72}px, 0, 0) rotate(${rot}deg)`;
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
    captured = false;
    element.style.transition = '';

    // Check code block horizontal scrolling
    if (isInsideCodeBlock(e.target)) {
      pointerId = null;
      return;
    }

    // DO NOT call setPointerCapture here! Calling it on pointerdown prevents
    // the browser from performing native vertical scrolling of inner content.
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
      if (absY >= absX) {
        // Vertical movement detected: user is scrolling long card content vertically.
        // We let native browser scroll take complete control!
        axisLocked = 'v';
        isDragging = false;
        return;
      } else {
        // Horizontal movement detected: user is swiping between cards!
        axisLocked = 'h';
        isDragging = true;
        try {
          element.setPointerCapture(pointerId);
          captured = true;
        } catch {
          // Ignore
        }
      }
    }

    if (isDragging && axisLocked === 'h') {
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
    const velocityX = absX / duration;

    if (captured) {
      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // Ignore
      }
      captured = false;
    }

    const currentPointer = pointerId;
    pointerId = null;

    // Clean tap detection: very little movement and quick tap
    if (!axisLocked && absX < 8 && absY < 8 && duration < 320) {
      if (onTap) onTap();
      resetTransform(false);
      axisLocked = null;
      isDragging = false;
      return;
    }

    // Horizontal Swipe detection: |dx| > 50px or fast flick (velocityX > 0.35)
    if (axisLocked === 'h') {
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (dx < -50 || (dx < -25 && velocityX > 0.35)) {
        // Swipe Left -> Next Card
        axisLocked = null;
        isDragging = false;
        if (reducedMotion) {
          resetTransform(false);
          if (onNext) onNext();
        } else {
          // Smooth linear fan exit in swipe direction, followed by linear appearance of next card
          element.style.transition = 'transform 0.12s linear, opacity 0.12s linear';
          element.style.transform = 'translate3d(-105%, 0, 0) rotate(-10deg)';
          element.style.opacity = '0';
          setTimeout(() => {
            element.style.transition = '';
            element.style.opacity = '';
            resetTransform(false);
            if (onNext) onNext();
          }, 120);
        }
        return;
      } else if (dx > 50 || (dx > 25 && velocityX > 0.35)) {
        // Swipe Right -> Previous Card
        axisLocked = null;
        isDragging = false;
        if (reducedMotion) {
          resetTransform(false);
          if (onBack) onBack();
        } else {
          // Smooth linear fan exit in swipe direction, followed by linear appearance of previous card
          element.style.transition = 'transform 0.12s linear, opacity 0.12s linear';
          element.style.transform = 'translate3d(105%, 0, 0) rotate(10deg)';
          element.style.opacity = '0';
          setTimeout(() => {
            element.style.transition = '';
            element.style.opacity = '';
            resetTransform(false);
            if (onBack) onBack();
          }, 120);
        }
        return;
      }
    }

    // If axis was vertical or threshold not reached, snap back
    resetTransform(true);
    isDragging = false;
    axisLocked = null;
  }

  function onPointerCancel(e) {
    if (pointerId !== null && e.pointerId === pointerId) {
      if (rafId) cancelAnimationFrame(rafId);
      if (captured) {
        try {
          element.releasePointerCapture(pointerId);
        } catch {
          // Ignore
        }
        captured = false;
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
    if (captured && pointerId !== null) {
      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // Ignore
      }
    }
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
  };
}
