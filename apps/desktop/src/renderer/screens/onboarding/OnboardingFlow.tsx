import { useState, useCallback } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EtherBackdrop } from '@auralith/design-system'
import { StepWelcome } from './steps/StepWelcome'
import { StepOllama } from './steps/StepOllama'
import { StepFolders } from './steps/StepFolders'
import { StepSpaces } from './steps/StepSpaces'
import { StepNewsWeather } from './steps/StepNewsWeather'

export type OnboardingData = {
  ollamaUrl: string
  classifierModel: string
  chatModel: string
  embedModel: string
  watchedFolders: string[]
  firstSpaceName: string
  firstSpacePath: string
  newsTopics: string[]
  weatherLat: string
  weatherLon: string
  briefingEnabled: boolean
}

const DEFAULTS: OnboardingData = {
  ollamaUrl: 'http://localhost:11434',
  classifierModel: 'llama3.2:3b',
  chatModel: 'qwen2.5:7b-instruct',
  embedModel: 'nomic-embed-text',
  watchedFolders: [],
  firstSpaceName: '',
  firstSpacePath: '',
  newsTopics: [],
  weatherLat: '',
  weatherLon: '',
  briefingEnabled: true,
}

export type StepProps = {
  data: OnboardingData
  onChange: (partial: Partial<OnboardingData>) => void
  onNext: () => void
  onSkip: (() => void) | undefined
}

const STEPS: Array<(props: StepProps) => ReactElement> = [
  StepWelcome,
  StepOllama,
  StepFolders,
  StepSpaces,
  StepNewsWeather,
]

const SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 32 : -32 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -32 : 32 }),
}

type Props = {
  onComplete: () => void
}

export function OnboardingFlow({ onComplete }: Props): ReactElement {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [data, setData] = useState<OnboardingData>(DEFAULTS)

  const onChange = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  const goNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setDir(1)
      setStep((s) => s + 1)
    } else {
      void persistAndComplete()
    }
  }, [step])

  async function persistAndComplete() {
    // Persist onboarding choices as settings
    await window.auralith.invoke('settings.set', { key: 'ollama.url', value: data.ollamaUrl })
    await window.auralith.invoke('settings.set', {
      key: 'ollama.classifierModel',
      value: data.classifierModel,
    })
    await window.auralith.invoke('settings.set', { key: 'ollama.chatModel', value: data.chatModel })
    await window.auralith.invoke('settings.set', {
      key: 'ollama.embedModel',
      value: data.embedModel,
    })
    await window.auralith.invoke('settings.set', {
      key: 'activity.watchedFolders',
      value: data.watchedFolders,
    })
    await window.auralith.invoke('settings.set', { key: 'news.topics', value: data.newsTopics })
    if (data.newsTopics.length > 0) {
      await window.auralith.invoke('news.seedTopics', { topics: data.newsTopics })
    }
    await window.auralith.invoke('settings.set', { key: 'weather.lat', value: data.weatherLat })
    await window.auralith.invoke('settings.set', { key: 'weather.lon', value: data.weatherLon })
    await window.auralith.invoke('settings.set', {
      key: 'briefing.morningEnabled',
      value: data.briefingEnabled,
    })
    await window.auralith.invoke('settings.set', { key: 'onboarding.complete', value: true })

    // Grant folder watch permissions
    for (const folder of data.watchedFolders) {
      await window.auralith.invoke('permissions.grant', { scope: `folder:${folder}` })
    }

    // Start watching the granted folders
    await window.auralith.invoke('activity.refreshWatcher', {})

    onComplete()
  }

  const StepComponent = STEPS[step] ?? StepWelcome

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--color-bg-0)]">
      <EtherBackdrop className="absolute inset-0" />

      {/* Step indicators */}
      <div className="absolute top-6 left-1/2 flex -translate-x-1/2 gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={[
              'h-1 rounded-full transition-all duration-300',
              i === step
                ? 'w-6 bg-violet-400'
                : i < step
                  ? 'w-3 bg-violet-600/60'
                  : 'w-3 bg-white/15',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="relative z-10 w-full max-w-md px-6">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <StepComponent
              data={data}
              onChange={onChange}
              onNext={goNext}
              onSkip={step > 0 ? goNext : undefined}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
