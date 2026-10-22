/** «Иванов Иван Петрович» → «Иванов И. П.»; демо-метки «Демо: …» не трогаем. */
export function shortFullName(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  if (/^демо:/i.test(trimmed)) return trimmed
  const parts = trimmed.split(' ')
  if (parts.length < 2) return trimmed
  const [surname, ...rest] = parts
  const initials = rest.map((part) => `${(part[0] ?? '').toLocaleUpperCase('ru')}.`).join(' ')
  return `${surname} ${initials}`
}
