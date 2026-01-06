/**
 * AnimatedCard - Wrapper component for animated cards
 *
 * Provides entrance and hover animations using Framer Motion.
 */

import { motion } from 'framer-motion'

/**
 * Animation variants for staggered entrance
 */
export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
}

export const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24
    }
  }
}

/**
 * AnimatedCard - Card with entrance and hover animations
 */
export function AnimatedCard({
  children,
  className = '',
  delay = 0,
  onClick,
  whileHover = true,
  ...props
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 24,
        delay
      }}
      whileHover={whileHover ? {
        y: -4,
        boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
        transition: { duration: 0.2 }
      } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={className}
      onClick={onClick}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * AnimatedContainer - Container for staggered children animations
 */
export function AnimatedContainer({
  children,
  className = '',
  ...props
}) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * AnimatedItem - Item that animates when parent container animates
 */
export function AnimatedItem({
  children,
  className = '',
  ...props
}) {
  return (
    <motion.div
      variants={itemVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * FadeIn - Simple fade-in animation
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 0.5,
  className = ''
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * SlideIn - Slide in from a direction
 */
export function SlideIn({
  children,
  direction = 'right',
  delay = 0,
  className = ''
}) {
  const directionMap = {
    left: { x: -100, y: 0 },
    right: { x: 100, y: 0 },
    up: { x: 0, y: -100 },
    down: { x: 0, y: 100 }
  }

  const initial = directionMap[direction]

  return (
    <motion.div
      initial={{ ...initial, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={{ ...initial, opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        delay
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * AnimatedNumber - Animate number counting up
 */
export function AnimatedNumber({
  value,
  duration = 1,
  className = ''
}) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={className}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        key={value}
      >
        {value}
      </motion.span>
    </motion.span>
  )
}

/**
 * Pulse - Pulsing animation for attention
 */
export function Pulse({ children, className = '' }) {
  return (
    <motion.div
      animate={{
        scale: [1, 1.05, 1],
        opacity: [1, 0.8, 1]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default AnimatedCard
