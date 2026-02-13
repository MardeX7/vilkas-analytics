import { useEffect, useState } from 'react'

const loadingMessages = [
  'Haetaan hakukonedataa...',
  'Analysoidaan avainsanoja...',
  'Lasketaan sijoituksia...',
  'Koostetaan raporttia...',
  'Viimeistellään...'
]

export function DataLoadingScreen({ message = null }) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [dots, setDots] = useState('')

  // Cycle through messages
  useEffect(() => {
    if (message) return // Use custom message if provided

    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % loadingMessages.length)
    }, 2000)

    return () => clearInterval(interval)
  }, [message])

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 400)

    return () => clearInterval(interval)
  }, [])

  const displayMessage = message || loadingMessages[messageIndex]

  return (
    <div className="fixed inset-0 bg-background-dark z-50 flex items-center justify-center">
      <div className="text-center">
        {/* Animated data visualization */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-pulse" />

          {/* Spinning ring */}
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-primary animate-spin"
               style={{ animationDuration: '1.5s' }} />

          {/* Inner pulsing circle */}
          <div className="absolute inset-6 rounded-full bg-primary/10 animate-pulse" />

          {/* Data bars animation */}
          <div className="absolute inset-0 flex items-end justify-center gap-1 p-8">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-2 bg-primary rounded-t animate-data-bar"
                style={{
                  animationDelay: `${i * 0.15}s`,
                  height: '100%'
                }}
              />
            ))}
          </div>

          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
        </div>

        {/* Loading text */}
        <p className="text-lg font-medium text-foreground mb-2">
          {displayMessage.replace('...', '')}{dots}
        </p>

        {/* Progress indicator */}
        <div className="w-48 h-1 bg-background-subtle rounded-full mx-auto overflow-hidden">
          <div
            className="h-full bg-primary rounded-full animate-progress"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* CSS for custom animations */}
      <style>{`
        @keyframes data-bar {
          0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .animate-data-bar {
          animation: data-bar 1s ease-in-out infinite;
          transform-origin: bottom;
        }
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
        .animate-progress {
          animation: progress 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
