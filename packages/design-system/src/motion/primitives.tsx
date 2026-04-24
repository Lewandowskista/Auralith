import { motion, AnimatePresence } from 'framer-motion'
import type { HTMLMotionProps, Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import { motionDuration, motionEasing, variants } from '../tokens/motion'

type FadeRiseProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
}

// Fade up 8px — standard enter/exit for panels, cards, overlays
export function FadeRise({
  children,
  delay = 0,
  duration = motionDuration.enterExit,
  ...props
}: FadeRiseProps) {
  return (
    <motion.div
      initial={variants.fadeRise.initial}
      animate={variants.fadeRise.animate}
      exit={variants.fadeRise.exit}
      transition={{
        duration: duration / 1000,
        delay: delay / 1000,
        ease: motionEasing.standard,
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

type FadeInProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
}

// Simple opacity fade — for text, subtle content reveals
export function FadeIn({
  children,
  delay = 0,
  duration = motionDuration.standard,
  ...props
}: FadeInProps) {
  return (
    <motion.div
      initial={variants.fadeIn.initial}
      animate={variants.fadeIn.animate}
      exit={variants.fadeIn.exit}
      transition={{
        duration: duration / 1000,
        delay: delay / 1000,
        ease: motionEasing.decelerate,
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

type Scale98Props = HTMLMotionProps<'div'> & {
  children: ReactNode
  disabled?: boolean
}

// Subtle scale on hover/press — buttons, cards, interactive elements
export function Scale98({ children, disabled = false, ...props }: Scale98Props) {
  const tapProps = disabled
    ? {}
    : { whileHover: { scale: 1.02 } as const, whileTap: { scale: 0.98 } as const }
  return (
    <motion.div {...tapProps} transition={motionEasing.spring} {...props}>
      {children}
    </motion.div>
  )
}

type SlideInRightProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  duration?: number
}

// Slide from right — drawers, side panels
export function SlideInRight({
  children,
  duration = motionDuration.emphasized,
  ...props
}: SlideInRightProps) {
  return (
    <motion.div
      initial={variants.slideInRight.initial}
      animate={variants.slideInRight.animate}
      exit={variants.slideInRight.exit}
      transition={{
        duration: duration / 1000,
        ease: motionEasing.decelerate,
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// AnimatePresence re-export for convenience
export { AnimatePresence }

// Shimmer line — loading indicator for text/content
export const shimmerVariants: Variants = {
  initial: { x: '-100%' },
  animate: {
    x: '100%',
    transition: {
      repeat: Infinity,
      repeatType: 'loop',
      duration: 1.4,
      ease: 'linear',
    },
  },
}

export function ShimmerLine({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded bg-white/5 ${className}`} aria-hidden="true">
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent"
        variants={shimmerVariants}
        initial="initial"
        animate="animate"
      />
    </div>
  )
}
