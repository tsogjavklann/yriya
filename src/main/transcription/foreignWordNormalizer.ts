/**
 * Deterministic cleanup for common Mongolian-English mixed dictation cases.
 *
 * Chimege is strong at Mongolian sentence structure, but it often writes spoken
 * English/brand/tech terms phonetically in Cyrillic. This layer restores common
 * foreign terms to Latin before the LLM merge step, so the final result is not
 * dependent on prompt-following alone.
 */

export interface NormalizeForeignWordsOptions {
  /** User-provided preferred spellings. */
  glossary?: string[]
  /** OpenAI transcript, used only as a hint for uncertain replacements. */
  openaiText?: string
}

export interface ProtectTranscriptOptions {
  /** User-provided preferred spellings. */
  glossary?: string[]
  /** OpenAI transcript, used only as a hint for risky/uncertain terms. */
  openaiText?: string
}

interface TermRule {
  latin: string
  roots: string[]
  /** Avoid replacing naturalized/ambiguous words unless OpenAI or glossary hints this term. */
  requiresHint?: boolean
}

interface ExactRule {
  pattern: RegExp
  replace: string
  latin: string
  requiresHint?: boolean
}

const WORD_LEFT = '(?<![\\p{L}\\p{N}_])'
const WORD_RIGHT = '(?![\\p{L}\\p{N}_])'

const SUFFIXES = [
  'аасаа',
  'ээсээ',
  'оосоо',
  'өөсөө',
  'аараа',
  'ээрээ',
  'оороо',
  'өөрөө',
  'аас',
  'ээс',
  'оос',
  'өөс',
  'аар',
  'ээр',
  'оор',
  'өөр',
  'тай',
  'тэй',
  'той',
  'гүй',
  'уудыг',
  'үүдийг',
  'нуудыг',
  'нүүдийг',
  'ууд',
  'үүд',
  'нууд',
  'нүүд',
  'ийг',
  'ыг',
  'ийн',
  'ын',
  'ний',
  'ны',
  'дээ',
  'даа',
  'тээ',
  'тайгаа',
  'тэйгээ',
  'тойгоо',
  'руу',
  'рүү',
  'аа',
  'ээ',
  'оо',
  'өө',
  'д',
  'т',
  'г'
]

const EXACT_RULES: ExactRule[] = [
  exact('митингд', 'meeting-д', 'meeting'),
  exact('митингт', 'meeting-т', 'meeting'),
  exact('митингээ', 'meeting-ээ', 'meeting'),
  exact('презентэйшнээ', 'presentation-ээ', 'presentation'),
  exact('презентейшнээ', 'presentation-ээ', 'presentation'),
  exact('презентаци', 'presentation', 'presentation', true),
  exact('дэдлайнаасаа', 'deadline-аасаа', 'deadline'),
  exact('дедлайнаасаа', 'deadline-аасаа', 'deadline'),
  exact('deadline аасаа өмнө', 'deadline-аасаа өмнө', 'deadline'),
  exact('deadline-аа өмнө', 'deadline-аасаа өмнө', 'deadline'),
  exact('deadline аа өмнө', 'deadline-аасаа өмнө', 'deadline'),
  exact('дэдлайн аа өмнө', 'deadline-аасаа өмнө', 'deadline'),
  exact('дедлайн аа өмнө', 'deadline-аасаа өмнө', 'deadline'),
  exact('имэйлээ', 'email-ээ', 'email'),
  exact('имейлээ', 'email-ээ', 'email'),
  exact('и-мэйлээ', 'email-ээ', 'email'),
  exact('асайнментээ', 'assignment-аа', 'assignment'),
  exact('асайнментаа', 'assignment-аа', 'assignment'),
  exact('асайнмент аа', 'assignment-аа', 'assignment'),
  exact('assignment аа', 'assignment-аа', 'assignment'),
  exact('ассайнментээ', 'assignment-аа', 'assignment'),
  exact('лаптопоо', 'laptop-оо', 'laptop'),
  exact('планаа', 'plan-аа', 'plan', true),
  exact('файлаа', 'file-аа', 'file'),
  exact('линкийг', 'link-ийг', 'link'),
  exact('финал вершнээ', 'final version-оо', 'final version'),
  exact('финал вершинээ', 'final version-оо', 'final version')
]

const TERM_RULES: TermRule[] = [
  term('React', ['реакт', 'рийакт']),
  term('component', ['компонент']),
  term('API', ['апи', 'эй пи ай', 'эйпиай']),
  term('response', ['респонс', 'риспонс']),
  term('request', ['реквест', 'рийквест']),
  term('backend', ['бакэнд', 'бэкэнд', 'бекэнд']),
  term('frontend', ['фронтэнд', 'фронтенд']),
  term('Electron', ['электрон']),
  term('TypeScript', ['тайпскрипт', 'тайп скрипт']),
  term('JavaScript', ['жаваскрипт', 'жава скрипт', 'жава скрипт']),
  term('Next.js', ['некст жс', 'некст жи эс', 'некстжейэс']),
  term('Supabase', ['супабэйс', 'супабейс']),
  term('Firebase', ['файрбэйс', 'файрбейз']),
  term('GitHub', ['гитхаб', 'гит хаб']),
  term('Figma', ['фигма']),
  term('Whisper Flow', ['виспер флоу', 'уиспер флоу']),
  term('Wispr Flow', ['виспр флоу', 'уиспр флоу']),
  term('Chimege', ['чимэгэ', 'чимэге']),
  term('OpenAI', ['опен ай', 'опенэй ай', 'опен аи']),
  term('ChatGPT', ['чат жпт', 'чат гпт', 'чатжпт']),
  term('Claude Code', ['клод код', 'клауд код']),

  term('meeting', ['митинг', 'мийтинг', 'миитинг']),
  term('presentation', ['презентэйшн', 'презентейшн', 'пресентэйшн']),
  term('project', ['прожект', 'прожэкт']),
  term('deadline', ['дэдлайн', 'дедлайн']),
  term('email', ['имэйл', 'имейл', 'и-мэйл', 'э-мэйл']),
  term('reply', ['реплай', 'рийплай']),
  term('assignment', ['асайнмент', 'ассайнмент', 'эсайнмент']),
  term('idea', ['айдиа', 'айдеа']),
  term('class', ['класс', 'клас']),
  term('laptop', ['лаптоп']),
  term('song', ['сонг']),
  term('vibe', ['вайб']),
  term('app', ['апп']),
  term('file', ['файл']),
  term('link', ['линк']),
  term('phone', ['фоон']),
  term('phone', ['фон'], true),
  term('content', ['контент']),
  term('version', ['версн', 'вершн', 'вершин']),
  term('final', ['финал']),
  term('team', ['тим'], true),
  term('teamwork', ['тимворк', 'тиймворк']),
  term('schedule', ['шедүүл', 'шедюл', 'скежүүл']),
  term('unique', ['юник', 'юуник']),
  term('error', ['эррор', 'еррор']),
  term('upload', ['аплоад', 'аплоуд']),
  term('push', ['пүш', 'пуш']),
  term('update', ['апдэйт', 'апдейт']),
  term('animation', ['анимэйшн', 'анимейшн']),

  term('design', ['дизайн']),
  term('modern', ['модерн']),
  term('style', ['стайл']),
  term('plan', ['план'], true),
  term('group', ['груп', 'грүп']),
  term('option', ['опшн', 'опшин']),
  term('budget', ['бюджет'], true),
  term('busy', ['бизи']),
  term('stress', ['стресс', 'стрэсс'], true),
  term('creative', ['криэйтив', 'креатив']),
  term('premium', ['премиум'])
]

const NATURALIZED_LOANWORDS = [
  { cyrillic: ['кофе'], latin: 'coffee' },
  { cyrillic: ['интернет', 'интернэт', 'интэрнет', 'интэрнэт'], latin: 'internet' },
  { cyrillic: ['компьютер', 'компютер'], latin: 'computer' },
  { cyrillic: ['банк'], latin: 'bank' },
  { cyrillic: ['менежмент'], latin: 'management' },
  { cyrillic: ['маркетинг'], latin: 'marketing' },
  { cyrillic: ['автобус'], latin: 'bus' },
  { cyrillic: ['ресторан'], latin: 'restaurant' }
]

const NATURALIZED_ROOTS = new Set(NATURALIZED_LOANWORDS.flatMap((word) => word.cyrillic))

const RISKY_FALSE_FRIENDS = [
  { cyrillic: 'буруу', latin: 'bro' }
]

const FOREIGN_GENITIVE_IIN_TERMS = ['project', 'app', 'design', 'file']

/** Common foreign terms that are safe to feed into STT/merge prompts as glossary. */
export const DEFAULT_FOREIGN_GLOSSARY = TERM_RULES.map((rule) => rule.latin)

export function normalizeForeignWords(
  text: string,
  options: NormalizeForeignWordsOptions = {}
): string {
  if (!text.trim()) return text

  const hints = makeHintSet(options)
  let next = text

  for (const rule of EXACT_RULES) {
    if (rule.requiresHint && !hasHint(hints, rule.latin)) continue
    next = next.replace(rule.pattern, rule.replace)
  }

  for (const rule of TERM_RULES) {
    if (rule.requiresHint && !hasHint(hints, rule.latin)) continue
    for (const root of rule.roots) {
      if (NATURALIZED_ROOTS.has(root)) continue
      next = replaceRoot(next, root, rule.latin)
    }
  }

  next = applyHintedRiskyTerms(next, options.openaiText)
  next = applyHintedPhrases(next, hints)
  next = normalizeForeignGenitives(next)

  return next
}

/**
 * Final safety pass after LLM merge.
 *
 * If the Chimege skeleton contains a protected Mongolian word, keep that word
 * authoritative and undo English-looking false positives from the merge.
 */
export function protectTranscriptSkeleton(
  text: string,
  chimegeText: string,
  options: ProtectTranscriptOptions = {}
): string {
  if (!text.trim() || !chimegeText.trim()) return text

  const customHints = makeHintSet({ glossary: options.glossary })
  let next = text

  for (const word of NATURALIZED_LOANWORDS) {
    if (hasHint(customHints, word.latin)) continue
    const source = findAnySourceWord(chimegeText, word.cyrillic)
    if (!source) continue
    if (hasLatinWord(chimegeText, word.latin)) continue
    next = replaceLatinWord(next, word.latin, source)
  }

  for (const pair of RISKY_FALSE_FRIENDS) {
    if (hasHint(customHints, pair.latin)) continue
    if (isRiskyTermAllowedByHint(pair.latin, options.openaiText)) continue
    const source = findSourceWord(chimegeText, pair.cyrillic)
    if (!source) continue
    if (hasLatinWord(chimegeText, pair.latin)) continue
    next = replaceLatinWord(next, pair.latin, source)
  }

  next = restoreAssignmentSuffixesByOccurrence(next, chimegeText, options.openaiText)
  next = normalizeForeignGenitives(next)

  return next
}

function replaceRoot(text: string, root: string, latin: string): string {
  const pattern = new RegExp(
    `${WORD_LEFT}${escapeRegExp(root)}(${SUFFIXES.map(escapeRegExp).join('|')})?${WORD_RIGHT}`,
    'giu'
  )
  return text.replace(pattern, (_match, suffix: string | undefined) => {
    return suffix ? `${latin}-${suffix}` : latin
  })
}

function applyHintedRiskyTerms(text: string, openaiText?: string): string {
  if (!isRiskyTermAllowedByHint('bro', openaiText)) return text
  return text.replace(
    new RegExp(`${WORD_LEFT}буруу(?=\\s+гэж\\s+хэлээгүй${WORD_RIGHT})`, 'iu'),
    'bro'
  )
}

function applyHintedPhrases(text: string, hints: Set<string>): string {
  let next = text
  if (hasHint(hints, 'team') || hasHint(hints, 'team meeting')) {
    next = next.replace(
      new RegExp(`${WORD_LEFT}(?:тийм|тим)(\\s+meeting)${WORD_RIGHT}`, 'giu'),
      'team$1'
    )
  }
  return next
}

function normalizeForeignGenitives(text: string): string {
  let next = text
  for (const term of FOREIGN_GENITIVE_IIN_TERMS) {
    const pattern = new RegExp(
      `${WORD_LEFT}${escapeRegExp(term)}(?:-|\\s*)?(?:ын|ийн)${WORD_RIGHT}`,
      'giu'
    )
    next = next.replace(pattern, `${term}-ийн`)
  }
  return next
}

interface AssignmentOccurrence {
  hasSuffix: boolean
}

function restoreAssignmentSuffixesByOccurrence(
  text: string,
  chimegeText: string,
  openaiText?: string
): string {
  const source = extractAssignmentOccurrences(chimegeText)
  const openaiHints = extractAssignmentOccurrences(openaiText ?? '')
  const hints =
    source.length > 0
      ? source.map((occurrence, i) => ({
          hasSuffix: occurrence.hasSuffix || !!openaiHints[i]?.hasSuffix
        }))
      : openaiHints
  if (hints.length === 0) return text

  let index = 0
  return text.replace(
    new RegExp(`${WORD_LEFT}assignment(?:-аа)?${WORD_RIGHT}`, 'giu'),
    (match) => {
      const hint = hints[index++]
      if (!hint) return match
      return hint.hasSuffix ? 'assignment-аа' : 'assignment'
    }
  )
}

function extractAssignmentOccurrences(text: string): AssignmentOccurrence[] {
  const out: AssignmentOccurrence[] = []
  const pattern = new RegExp(
    [
      'assignment-аа',
      'assignment\\s+аа',
      'асайнмент\\s+аа',
      'асайнмент(?:ээ|аа)',
      'асайнментаа',
      'ассайнментээ',
      'assignment',
      'асайнмент',
      'ассайнмент'
    ].join('|'),
    'giu'
  )

  for (const match of text.matchAll(pattern)) {
    out.push({ hasSuffix: /(?:-аа|\s+аа|ээ|аа|таа)$/iu.test(match[0]) })
  }
  return out
}

function makeHintSet(options: NormalizeForeignWordsOptions): Set<string> {
  const hints = new Set<string>()
  for (const term of options.glossary ?? []) addHint(hints, term)

  const latinTerms = options.openaiText?.match(/[A-Za-z][A-Za-z0-9.+#-]*(?:\s+[A-Za-z][A-Za-z0-9.+#-]*)*/g)
  for (const term of latinTerms ?? []) addHint(hints, term)

  return hints
}

function addHint(hints: Set<string>, term: string): void {
  const normalized = normalizeHint(term)
  if (normalized) hints.add(normalized)
}

function hasHint(hints: Set<string>, term: string): boolean {
  return hints.has(normalizeHint(term))
}

function hasLatinWord(text: string, latin: string): boolean {
  const pattern = new RegExp(`${WORD_LEFT}${escapeRegExp(latin)}${WORD_RIGHT}`, 'iu')
  return pattern.test(text)
}

function isRiskyTermAllowedByHint(latin: string, openaiText?: string): boolean {
  if (!openaiText) return false
  if (latin.toLowerCase() === 'bro') {
    return new RegExp(`${WORD_LEFT}bro\\s+гэж(?:\\s+хэлээгүй)?${WORD_RIGHT}`, 'iu').test(openaiText)
  }
  return hasLatinWord(openaiText, latin)
}

function findSourceWord(text: string, cyrillic: string): string | null {
  const pattern = new RegExp(
    `${WORD_LEFT}(${escapeRegExp(cyrillic)}(?:${SUFFIXES.map(escapeRegExp).join('|')})?)${WORD_RIGHT}`,
    'iu'
  )
  return pattern.exec(text)?.[1] ?? null
}

function findAnySourceWord(text: string, cyrillicWords: string[]): string | null {
  for (const word of cyrillicWords) {
    const found = findSourceWord(text, word)
    if (found) return found
  }
  return null
}

function replaceLatinWord(text: string, latin: string, replacement: string): string {
  const suffixPattern = SUFFIXES.map(escapeRegExp).join('|')
  const pattern = new RegExp(
    `${WORD_LEFT}${escapeRegExp(latin)}(?:-(${suffixPattern}))?${WORD_RIGHT}`,
    'giu'
  )
  return text.replace(pattern, replacement)
}

function normalizeHint(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim()
}

function exact(text: string, replace: string, latin: string, requiresHint = false): ExactRule {
  return {
    pattern: new RegExp(`${WORD_LEFT}${escapeRegExp(text)}${WORD_RIGHT}`, 'giu'),
    replace,
    latin,
    requiresHint
  }
}

function term(latin: string, roots: string[], requiresHint = false): TermRule {
  return { latin, roots, requiresHint }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
