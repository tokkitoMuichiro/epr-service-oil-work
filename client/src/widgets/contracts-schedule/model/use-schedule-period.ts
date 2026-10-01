import { computed, ref, watch, type Ref } from 'vue'
import {
  availableScales,
  periodContaining,
  periodsInRange,
  shiftPeriod,
  type DateSpan,
  type ScheduleScale,
} from '@/entities/contract'
import { todayIso } from '@shared/dates'

function clampDay(day: string, bounds: DateSpan | null): string {
  if (!bounds) return day
  if (day < bounds.from) return bounds.from
  if (day > bounds.to) return bounds.to
  return day
}

export function useSchedulePeriod(bounds: Ref<DateSpan | null>, focus: Ref<DateSpan | null>) {
  const today = todayIso()
  const scale = ref<ScheduleScale>('month')
  const anchor = ref(clampDay(today, bounds.value))

  const scales = computed<ScheduleScale[]>(() =>
    bounds.value ? availableScales(bounds.value.from, bounds.value.to) : ['week'],
  )

  const period = computed(() => periodContaining(scale.value, anchor.value))

  const options = computed(() =>
    bounds.value ? periodsInRange(scale.value, bounds.value.from, bounds.value.to) : [period.value],
  )

  const canPrev = computed(() => Boolean(bounds.value && period.value.start > bounds.value.from))
  const canNext = computed(() => Boolean(bounds.value && period.value.end < bounds.value.to))
  const canToday = computed(() =>
    Boolean(bounds.value && today >= bounds.value.from && today <= bounds.value.to),
  )

  function setScale(next: ScheduleScale) {
    const { start, end } = period.value
    const span = focus.value
    let day = start
    if (today >= start && today <= end) day = today
    else if (span && span.from <= end && start <= span.to) day = span.from > start ? span.from : start
    anchor.value = clampDay(day, bounds.value)
    scale.value = next
  }

  function step(direction: -1 | 1) {
    anchor.value = clampDay(shiftPeriod(period.value, direction).start, bounds.value)
  }

  function goTo(start: string) {
    anchor.value = clampDay(start, bounds.value)
  }

  function goToday() {
    anchor.value = clampDay(today, bounds.value)
  }

  watch(scales, (list) => {
    if (!list.includes(scale.value)) scale.value = list[list.length - 1]
  })

  watch(
    focus,
    (span) => {
      if (!span) return
      const { start, end } = period.value
      if (span.from <= end && start <= span.to) return
      const day = today >= span.from && today <= span.to ? today : span.from
      anchor.value = clampDay(day, bounds.value)
    },
    { immediate: true },
  )

  return { today, scale, scales, period, options, canPrev, canNext, canToday, setScale, step, goTo, goToday }
}
