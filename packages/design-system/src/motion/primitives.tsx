import { motion, AnimatePresence } from 'framer-motion'
import type { HTMLMotionProps, Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import type { ReactElement } from 'react'
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

type SlideUpProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
  distance?: number
}

// Slide up from below — modals, bottom sheets, cards entering from bottom
export function SlideUp({
  children,
  delay = 0,
  duration = motionDuration.emphasized,
  distance = 16,
  ...props
}: SlideUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: distance / 2 }}
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

type ScaleInProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
}

// Scale in from 0.92 — dialogs, popovers, context menus
export function ScaleIn({
  children,
  delay = 0,
  duration = motionDuration.standard,
  ...props
}: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
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
      duration: 1.6,
      ease: 'linear',
    },
  },
}

export function ShimmerLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-white/[0.04] ${className}`}
      aria-hidden="true"
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
        variants={shimmerVariants}
        initial="initial"
        animate="animate"
      />
    </div>
  )
}

// Stagger list variants — parent staggers children 40ms apart on mount
export const staggerListVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

// Stagger item variants — each child fades up 6px
export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } },
}

// Stagger item subtle — fades in without y movement (for denser lists)
export const staggerItemFadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] } },
}

type TabContentProps = {
  children: ReactNode
  tabKey: string
  direction: 1 | -1
}

// Directional tab content transition — slide + fade based on direction (1 = forward, -1 = back)
export function TabContent({ children, tabKey, direction }: TabContentProps): ReactElement {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={tabKey}
        custom={direction}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initial={((d: number) => ({ opacity: 0, x: d * 18 })) as any}
        animate={{ opacity: 1, x: 0 }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exit={((d: number) => ({ opacity: 0, x: d * -18 })) as any}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
