import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Check, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Routine,
  RoutineTrigger,
  RoutineCondition,
  RoutineAction,
} from '@auralith/core-domain'

type Step = 'trigger' | 'conditions' | 'action' | 'confirm'
const STEPS: Step[] = ['trigger', 'conditions', 'action', 'confirm']

type ToolInfo = { id: string; tier: string; description: string }

type Props = {
  routine: Routine | null
  onSave: () => void
  onClose: () => void
}

export function RoutineEditor({ routine, onSave, onClose }: Props): ReactElement {
  const [step, setStep] = useState<Step>('trigger')
  const [name, setName] = useState(routine?.name ?? '')
  const [trigger, setTrigger] = useState<RoutineTrigger>(
    routine?.trigger ?? { type: 'schedule', cronHour: 9, cronMinute: 0 },
  )
  const [conditions, setConditions] = useState<RoutineCondition[]>(routine?.conditions ?? [])
  const [action, setAction] = useState<RoutineAction>(routine?.action ?? { toolId: '', params: {} })
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<{
    matchCount: number
    samples: Array<{ ts: number; reason: string }>
  } | null>(null)

  useEffect(() => {
    void window.auralith.invoke('tools.list', {}).then((res) => {
      if (res.ok) {
        const d = res.data as { tools: ToolInfo[] }
        setTools(d.tools)
      }
    })
  }, [])

  const stepIndex = STEPS.indexOf(step)

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Give your routine a name')
      return
    }
    if (!action.toolId) {
      toast.error('Select a tool to run')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        trigger,
        conditions,
        action,
      }
      let res
      if (routine) {
        res = await window.auralith.invoke('routines.update', { id: routine.id, ...payload })
      } else {
        res = await window.auralith.invoke('routines.create', payload)
      }
      if (res.ok) {
        toast.success(routine ? 'Routine updated' : 'Routine created')
        onSave()
      } else {
        toast.error('Failed to save routine')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDryRun = async () => {
    if (!routine) return
    const res = await window.auralith.invoke('routines.dryRun', {
      id: routine.id,
      lookbackHours: 24,
    })
    if (res.ok) {
      setDryRunResult(res.data as typeof dryRunResult)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        data-testid="routine-editor"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg rounded-2xl border border-white/[0.09] bg-[#0E0E14] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-[#F4F4F8]">
              {routine ? 'Edit routine' : 'New routine'}
            </h2>
            <div className="flex items-center gap-1 mt-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={[
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      i < stepIndex
                        ? 'bg-violet-500'
                        : i === stepIndex
                          ? 'bg-violet-400'
                          : 'bg-white/20',
                    ].join(' ')}
                  />
                  {i < STEPS.length - 1 && <div className="h-px w-3 bg-white/10" />}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#6F6F80] hover:text-[#F4F4F8] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Name */}
        <div className="px-6 pt-4">
          <input
            data-testid="routine-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Routine name…"
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-[#F4F4F8] placeholder-[#4A4A5A] focus:outline-none focus:border-violet-500/50"
          />
        </div>

        {/* Step content */}
        <div className="px-6 py-4 min-h-[220px]">
          {step === 'trigger' && <TriggerStep trigger={trigger} onChange={setTrigger} />}
          {step === 'conditions' && (
            <ConditionsStep conditions={conditions} onChange={setConditions} />
          )}
          {step === 'action' && <ActionStep action={action} tools={tools} onChange={setAction} />}
          {step === 'confirm' && (
            <ConfirmStep
              name={name}
              trigger={trigger}
              conditions={conditions}
              action={action}
              tools={tools}
              dryRunResult={dryRunResult}
              {...(routine ? { onDryRun: () => void handleDryRun() } : {})}
            />
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
          <button
            onClick={() => {
              const previousStep = STEPS[stepIndex - 1]
              if (previousStep) setStep(previousStep)
            }}
            disabled={stepIndex === 0}
            className="flex items-center gap-1.5 text-sm text-[#6F6F80] hover:text-[#F4F4F8] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {step !== 'confirm' ? (
            <button
              onClick={() => {
                const nextStep = STEPS[stepIndex + 1]
                if (nextStep) setStep(nextStep)
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              data-testid="routine-save-btn"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : routine ? 'Save changes' : 'Create routine'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Step sub-components ─────────────────────────────────────────────────────

function TriggerStep({
  trigger,
  onChange,
}: {
  trigger: RoutineTrigger
  onChange: (t: RoutineTrigger) => void
}): ReactElement {
  return (
    <div className="space-y-3">
      <Label>When should this run?</Label>
      <Select
        value={trigger.type}
        onChange={(v) => {
          if (v === 'schedule') onChange({ type: 'schedule', cronHour: 9, cronMinute: 0 })
          else if (v === 'event') onChange({ type: 'event', eventKind: 'file.create' })
          else if (v === 'suggestion.accepted')
            onChange({ type: 'suggestion.accepted', suggestionKind: 'morning.brief' })
          else if (v === 'app.startup') onChange({ type: 'app.startup' })
          else if (v === 'on.idle') onChange({ type: 'on.idle', idleMinutes: 30 })
          else if (v === 'webhook') onChange({ type: 'webhook', path: '/my-hook' })
          else if (v === 'ai') onChange({ type: 'ai' })
        }}
        options={[
          { value: 'schedule', label: 'On a schedule' },
          { value: 'event', label: 'When an event fires' },
          { value: 'suggestion.accepted', label: 'When a suggestion is accepted' },
          { value: 'app.startup', label: 'On app startup' },
          { value: 'on.idle', label: 'After idle time' },
          { value: 'webhook', label: 'On webhook call' },
          { value: 'ai', label: 'AI-triggered' },
        ]}
      />
      {trigger.type === 'schedule' && (
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1">
            <Label small>Hour (0–23)</Label>
            <NumberInput
              value={trigger.cronHour}
              min={0}
              max={23}
              onChange={(v) => onChange({ ...trigger, cronHour: v })}
            />
          </div>
          <div className="flex-1">
            <Label small>Minute (0–59)</Label>
            <NumberInput
              value={trigger.cronMinute}
              min={0}
              max={59}
              onChange={(v) => onChange({ ...trigger, cronMinute: v })}
            />
          </div>
        </div>
      )}
      {trigger.type === 'event' && (
        <div>
          <Label small>Event kind</Label>
          <TextInput
            value={trigger.eventKind}
            onChange={(v) => onChange({ ...trigger, eventKind: v })}
            placeholder="e.g. file.create"
          />
        </div>
      )}
      {trigger.type === 'suggestion.accepted' && (
        <div>
          <Label small>Suggestion kind</Label>
          <TextInput
            value={trigger.suggestionKind}
            onChange={(v) => onChange({ ...trigger, suggestionKind: v })}
            placeholder="e.g. morning.brief"
          />
        </div>
      )}
      {trigger.type === 'on.idle' && (
        <div>
          <Label small>Idle minutes</Label>
          <NumberInput
            value={trigger.idleMinutes}
            min={1}
            max={120}
            onChange={(v) => onChange({ ...trigger, idleMinutes: v })}
          />
        </div>
      )}
      {trigger.type === 'webhook' && (
        <div>
          <Label small>Webhook path</Label>
          <TextInput
            value={trigger.path}
            onChange={(v) => onChange({ ...trigger, path: v })}
            placeholder="e.g. /my-hook"
          />
        </div>
      )}
    </div>
  )
}

function ConditionsStep({
  conditions,
  onChange,
}: {
  conditions: RoutineCondition[]
  onChange: (c: RoutineCondition[]) => void
}): ReactElement {
  const addCondition = () => {
    onChange([...conditions, { type: 'time.between', startHour: 9, endHour: 17 }])
  }
  const removeCondition = (i: number) => {
    onChange(conditions.filter((_, idx) => idx !== i))
  }
  const updateCondition = (i: number, c: RoutineCondition) => {
    onChange(conditions.map((x, idx) => (idx === i ? c : x)))
  }

  return (
    <div className="space-y-3">
      <Label>
        Only run when… <span className="text-[#4A4A5A] font-normal">(optional)</span>
      </Label>
      {conditions.length === 0 && (
        <p className="text-sm text-[#4A4A5A]">
          No conditions — routine runs whenever its trigger fires.
        </p>
      )}
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          onChange={(nc) => updateCondition(i, nc)}
          onRemove={() => removeCondition(i)}
        />
      ))}
      <button
        onClick={addCondition}
        className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
      >
        + Add condition
      </button>
    </div>
  )
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: RoutineCondition
  onChange: (c: RoutineCondition) => void
  onRemove: () => void
}): ReactElement {
  return (
    <div className="flex items-start gap-2 bg-white/[0.03] rounded-lg p-3">
      <div className="flex-1 space-y-2">
        <Select
          value={condition.type}
          onChange={(v) => {
            if (v === 'time.between') onChange({ type: 'time.between', startHour: 9, endHour: 17 })
            else if (v === 'weekday.in') onChange({ type: 'weekday.in', days: [1, 2, 3, 4, 5] })
            else onChange({ type: 'setting.eq', key: '', value: '' })
          }}
          options={[
            { value: 'time.between', label: 'Time between' },
            { value: 'weekday.in', label: 'Weekday is' },
            { value: 'setting.eq', label: 'Setting equals' },
          ]}
        />
        {condition.type === 'time.between' && (
          <div className="flex items-center gap-2">
            <NumberInput
              value={condition.startHour}
              min={0}
              max={23}
              onChange={(v) => onChange({ ...condition, startHour: v })}
            />
            <span className="text-xs text-[#6F6F80]">to</span>
            <NumberInput
              value={condition.endHour}
              min={0}
              max={23}
              onChange={(v) => onChange({ ...condition, endHour: v })}
            />
          </div>
        )}
        {condition.type === 'weekday.in' && (
          <div className="flex gap-1 flex-wrap">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  const days = condition.days.includes(i)
                    ? condition.days.filter((x) => x !== i)
                    : [...condition.days, i]
                  onChange({ ...condition, days })
                }}
                className={[
                  'w-7 h-7 rounded text-[11px] font-medium transition-colors',
                  condition.days.includes(i)
                    ? 'bg-violet-500/30 text-violet-300'
                    : 'bg-white/[0.04] text-[#6F6F80] hover:bg-white/[0.08]',
                ].join(' ')}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {condition.type === 'setting.eq' && (
          <div className="flex gap-2">
            <TextInput
              value={condition.key}
              onChange={(v) => onChange({ ...condition, key: v })}
              placeholder="setting.key"
            />
            <TextInput
              value={String(condition.value)}
              onChange={(v) => onChange({ ...condition, value: v })}
              placeholder="value"
            />
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-[#4A4A5A] hover:text-red-400 transition-colors mt-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ActionStep({
  action,
  tools,
  onChange,
}: {
  action: RoutineAction
  tools: ToolInfo[]
  onChange: (a: RoutineAction) => void
}): ReactElement {
  const selected = tools.find((t) => t.id === action.toolId)

  return (
    <div className="space-y-3">
      <Label>What should it do?</Label>
      <Select
        value={action.toolId}
        onChange={(v) => onChange({ toolId: v, params: {} })}
        options={[
          { value: '', label: 'Select a tool…' },
          ...tools
            .filter((t) => t.tier !== 'restricted')
            .map((t) => ({ value: t.id, label: t.id })),
        ]}
      />
      {selected && (
        <p className="text-xs text-[#6F6F80] bg-white/[0.03] rounded-lg px-3 py-2">
          <span className="text-[#8B8B9A]">Tier: </span>
          <span className={selected.tier === 'confirm' ? 'text-amber-400' : 'text-emerald-400'}>
            {selected.tier}
          </span>
          <br />
          {selected.description}
        </p>
      )}
      {action.toolId && (
        <div>
          <Label small>Parameters (JSON)</Label>
          <textarea
            value={JSON.stringify(action.params, null, 2)}
            onChange={(e) => {
              try {
                const p = JSON.parse(e.target.value) as Record<string, unknown>
                onChange({ ...action, params: p })
              } catch {
                /* ignore parse errors while typing */
              }
            }}
            rows={4}
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-xs font-mono text-[#F4F4F8] focus:outline-none focus:border-violet-500/50 resize-none"
          />
        </div>
      )}
    </div>
  )
}

function ConfirmStep({
  name,
  trigger,
  conditions,
  action,
  tools,
  dryRunResult,
  onDryRun,
}: {
  name: string
  trigger: RoutineTrigger
  conditions: RoutineCondition[]
  action: RoutineAction
  tools: ToolInfo[]
  dryRunResult: { matchCount: number; samples: Array<{ ts: number; reason: string }> } | null
  onDryRun?: () => void
}): ReactElement {
  const tool = tools.find((t) => t.id === action.toolId)

  function triggerLabel(t: RoutineTrigger): string {
    switch (t.type) {
      case 'schedule':
        return `Daily at ${String(t.cronHour).padStart(2, '0')}:${String(t.cronMinute).padStart(2, '0')}`
      case 'event':
        return `On event: ${t.eventKind}`
      case 'suggestion.accepted':
        return `When suggestion: ${t.suggestionKind} accepted`
      case 'app.startup':
        return 'On app startup'
      case 'on.idle':
        return `After ${t.idleMinutes} min idle`
      case 'webhook':
        return `Webhook: ${t.path}`
      case 'ai':
        return 'AI-triggered'
    }
  }

  return (
    <div className="space-y-3">
      <Label>Review</Label>
      <div className="bg-white/[0.03] rounded-xl p-4 space-y-2 text-sm">
        <Row label="Name" value={name || '(untitled)'} />
        <Row label="Trigger" value={triggerLabel(trigger)} />
        <Row
          label="Conditions"
          value={
            conditions.length === 0
              ? 'None'
              : `${conditions.length} condition${conditions.length !== 1 ? 's' : ''}`
          }
        />
        <Row label="Action" value={action.toolId || '(not set)'} />
        {tool && <Row label="Tier" value={tool.tier} />}
      </div>
      {onDryRun && (
        <button
          onClick={onDryRun}
          className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Dry run (last 24 h)
        </button>
      )}
      {dryRunResult && (
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 text-xs text-[#8B8B9A] space-y-1">
          <p className="font-medium text-[#F4F4F8]">
            {dryRunResult.matchCount} match{dryRunResult.matchCount !== 1 ? 'es' : ''} in last 24 h
          </p>
          {dryRunResult.samples.slice(0, 3).map((s, i) => (
            <p key={i} className="text-[#4A4A5A]">
              {new Date(s.ts).toLocaleString()} — {s.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#6F6F80] w-20 shrink-0">{label}</span>
      <span className="text-[#F4F4F8] truncate">{value}</span>
    </div>
  )
}

// ── Primitives ──────────────────────────────────────────────────────────────

function Label({ children, small }: { children: React.ReactNode; small?: boolean }): ReactElement {
  return (
    <p className={small ? 'text-xs text-[#6F6F80]' : 'text-sm font-medium text-[#A6A6B3]'}>
      {children}
    </p>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}): ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-[#F4F4F8] focus:outline-none focus:border-violet-500/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#0E0E14]">
          {o.label}
        </option>
      ))}
    </select>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}): ReactElement {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-[#F4F4F8] focus:outline-none focus:border-violet-500/50"
    />
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): ReactElement {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-[#F4F4F8] placeholder-[#4A4A5A] focus:outline-none focus:border-violet-500/50"
    />
  )
}
