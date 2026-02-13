import { useState, useRef, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * PullToRefresh - iOS-style pull-to-refresh for PWA mode
 *
 * Wraps content and adds pull-to-refresh gesture when at top of page
 */
export function PullToRefresh({ children, onRefresh }) {
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const currentY = useRef(0)

  const TRIGGER_THRESHOLD = 80 // pixels to pull before triggering refresh
  const MAX_PULL = 120 // max pull distance

  const handleTouchStart = useCallback((e) => {
    // Only activate when at top of page
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    }
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!pulling || refreshing) return

    currentY.current = e.touches[0].clientY
    const diff = currentY.current - startY.current

    // Only pull down, not up
    if (diff > 0 && window.scrollY === 0) {
      // Apply resistance - pull gets harder the further you go
      const resistance = 0.4
      const pullDist = Math.min(diff * resistance, MAX_PULL)
      setPullDistance(pullDist)

      // Prevent default scroll when pulling
      if (pullDist > 10) {
        e.preventDefault()
      }
    }
  }, [pulling, refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return

    if (pullDistance >= TRIGGER_THRESHOLD && !refreshing) {
      // Trigger refresh
      setRefreshing(true)
      setPullDistance(50) // Keep showing spinner

      try {
        if (onRefresh) {
          await onRefresh()
        } else {
          // Default: reload the page
          window.location.reload()
        }
      } finally {
        // Small delay before hiding
        setTimeout(() => {
          setRefreshing(false)
          setPullDistance(0)
        }, 300)
      }
    } else {
      // Cancel - animate back
      setPullDistance(0)
    }

    setPulling(false)
    startY.current = 0
    currentY.current = 0
  }, [pulling, pullDistance, refreshing, onRefresh])

  useEffect(() => {
    const options = { passive: false }
    document.addEventListener('touchstart', handleTouchStart, options)
    document.addEventListener('touchmove', handleTouchMove, options)
    document.addEventListener('touchend', handleTouchEnd, options)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  const progress = Math.min(pullDistance / TRIGGER_THRESHOLD, 1)
  const shouldTrigger = pullDistance >= TRIGGER_THRESHOLD

  return (
    <div className="relative">
      {/* Pull indicator */}
      <div
        className="fixed left-0 right-0 flex justify-center items-center z-50 pointer-events-none transition-transform duration-200"
        style={{
          top: 0,
          height: `${pullDistance}px`,
          opacity: pullDistance > 10 ? 1 : 0
        }}
      >
        <div
          className={`
            flex items-center justify-center w-10 h-10 rounded-full
            ${shouldTrigger || refreshing ? 'bg-primary' : 'bg-background-elevated'}
            border border-border shadow-lg transition-colors duration-200
          `}
          style={{
            transform: `scale(${0.5 + progress * 0.5})`
          }}
        >
          <RefreshCw
            className={`
              w-5 h-5
              ${shouldTrigger || refreshing ? 'text-primary-foreground' : 'text-foreground-muted'}
              ${refreshing ? 'animate-spin' : ''}
              transition-transform duration-200
            `}
            style={{
              transform: refreshing ? 'none' : `rotate(${progress * 180}deg)`
            }}
          />
        </div>
      </div>

      {/* Content with pull offset */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : 'none',
          transition: pulling ? 'none' : 'transform 0.2s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default PullToRefresh
