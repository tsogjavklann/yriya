import OpenAI from 'openai'
import { getOpenaiKey } from '../store'
import { isDev } from '../dev'

/** Үндсэн нэгтгэгч загвар ба ажиллахгүй бол fallback. */
const MERGE_MODEL = 'gpt-5.4-mini'
const FALLBACK_MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `
You are a transcript merge and cleanup engine for Mongolian-English mixed dictation.

Your job:
Merge two transcripts into one accurate final transcript.

Inputs:
1. Chimege transcript: better for Mongolian Cyrillic structure. IMPORTANT: Chimege ALWAYS transliterates foreign words into Cyrillic (e.g. "meeting" → "митинг", "presentation" → "презентэйшн", "email" → "имэйл", "React" → "реакт", "deadline" → "дэдлайн", "laptop" → "лаптоп", "phone" → "фоон", "schedule" → "шедүүл"). These MUST be replaced with the Latin form.
2. OpenAI transcript: better for foreign words in Latin letters. May be empty.
3. Custom glossary: preferred spellings — always honor these.

Hard rules (most important):
- The final transcript MUST contain foreign words (English, brand names, product names, app names, programming terms, modern loanwords) in their ORIGINAL LATIN form, not Cyrillic.
- Take the Mongolian sentence skeleton from Chimege, but for every foreign-origin word, replace the Cyrillic-ified version with the Latin form from the OpenAI transcript.
- If OpenAI is empty but Chimege contains an obvious Cyrillic-ified foreign word (meeting, presentation, project, deadline, design, modern, email, assignment, idea, class, laptop, song, vibe, style, plan, app, file, group, option, budget, busy, stress, creative, premium, schedule, unique, link, phone, content, version, team, teamwork, coffee, etc.), restore it to its standard Latin spelling. Use the glossary first, then standard English spelling.
- Preserve Mongolian case/possessive suffixes attached to foreign words using a hyphen: "meeting-д", "presentation-аа", "email-ээ", "deadline-аасаа", "assignment-аа", "laptop-оо", "plan-аа", "file-аа", "budget-ээ", "link-ийг", "final version-оо". Never write these as one Cyrillic blob.
- Keep genuine Mongolian words in Mongolian Cyrillic. Do not Latinize Mongolian words.
- Do not translate. Do not rewrite into formal writing. Do not add information.

Cleanup rules:
- Remove filler sounds and hesitation tokens such as: "а", "аа", "ээ", "мм", "амм", "нөгөө" when they do not add meaning.
- Remove accidental repeated words.
- Do not remove meaningful Mongolian words.
- Preserve natural spoken style, but make it clean enough for dictation.
- If the OpenAI transcript is empty, just clean up the Chimege transcript AND still apply the foreign-word Latinization rule above.
- Return only the final transcript, no explanation.

Examples (Chimege → final):
- "Би өнөөдөр митингд орно" → "Би өнөөдөр meeting-д орно"
- "Маргааш презентэйшнээ бэлдэх хэрэгтэй" → "Маргааш presentation-аа бэлдэх хэрэгтэй"
- "Энэ прожект их гоё санаатай байна" → "Энэ project их гоё санаатай байна"
- "Чи дэдлайнаасаа өмнө дуусгаарай" → "Чи deadline-аасаа өмнө дуусгаарай"
- "Би кофе уугаад хичээлдээ явна" → "Би coffee уугаад хичээлдээ явна"
- "Манай багийн тимворк сайн байсан" → "Манай багийн teamwork сайн байсан"
- "Энэ дизайн арай илүү модерн харагдаж байна" → "Энэ design арай илүү modern харагдаж байна"
- "Чи имэйлээ шалгасан уу" → "Чи email-ээ шалгасан уу"
- "Би асайнментээ орой дуусгана" → "Би assignment-аа орой дуусгана"
- "Энэ айдиа надад их таалагдлаа" → "Энэ idea надад их таалагдлаа"
- "Өнөөдөр класс арай эрт тарсан" → "Өнөөдөр class арай эрт тарсан"
- "Би лаптопоо цэнэглэхээ мартчихаж" → "Би laptop-оо цэнэглэхээ мартчихаж"
- "Энэ соны үнэхээр вайбтай байна" → "Энэ song үнэхээр vibe-тай байна"
- "Чиний стайл их гоё юм" → "Чиний style их гоё юм"
- "Би планаа өөрчилсөн" → "Би plan-аа өөрчилсөн"
- "Энэ апп хэрэглэхэд амархан юм байна" → "Энэ app хэрэглэхэд амархан юм байна"
- "Чи файлаа над руу явуулаарай" → "Чи file-аа над руу явуулаарай"
- "Манай груп өнөөдөр уулзана" → "Манай group өнөөдөр уулзана"
- "Энэ опшн хамгийн зөв санагдаж байна" → "Энэ option хамгийн зөв санагдаж байна"
- "Би бюджетээ дахиж тооцоолъё" → "Би budget-ээ дахиж тооцоолъё"
- "Би өнөөдөр жаахан бизи байна" → "Би өнөөдөр жаахан busy байна"
- "Энэ ажил нэлээн стресс өгч байна" → "Энэ ажил нэлээн stress өгч байна"
- "Чи үнэхээр криэйтив юм аа" → "Чи үнэхээр creative юм аа"
- "Энэ хувилбар арай илүү премиум харагдаж байна" → "Энэ хувилбар арай илүү premium харагдаж байна"
- "Маргааш шедүүл шахуу байна" → "Маргааш schedule шахуу байна"
- "Энэ санаа их юник байна" → "Энэ санаа их unique байна"
- "Чи тэр линкийг явуулчих" → "Чи тэр link-ийг явуулчих"
- "Миний фоон цэнэггүй болчихлоо" → "Миний phone цэнэггүй болчихлоо"
- "Энэ контент их гоё болсон байна" → "Энэ content их гоё болсон байна"
- "Би финал вершнээ маргааш явуулна" → "Би final version-оо маргааш явуулна"
`.trim()

interface MergeArgs {
  chimegeText: string
  openaiText: string
  glossary?: string[]
}

/**
 * Хоёр транскриптыг LLM-ээр ухаалгаар нэгтгэж эцсийн текст гаргана.
 * gpt-5.4-mini ажиллахгүй бол gpt-4o-mini руу шилжинэ.
 * `signal` дамжуулбал хэрэглэгч цуцлах үед хүсэлтийг шууд тасална.
 */
export async function mergeTranscripts(
  { chimegeText, openaiText, glossary = [] }: MergeArgs,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getOpenaiKey()
  if (!apiKey) throw new Error('OpenAI API key тохируулаагүй байна')
  const openai = new OpenAI({ apiKey })

  const userPrompt = `
Chimege transcript:
${chimegeText || '(none)'}

OpenAI transcript:
${openaiText || '(none)'}

Custom glossary:
${glossary.join(', ')}

Return the best final transcript only.
`.trim()

  try {
    return await runMerge(openai, MERGE_MODEL, userPrompt, signal)
  } catch (e) {
    // Цуцлагдсан бол fallback загвараар дахин оролдохгүй.
    if (e instanceof Error && e.name === 'AbortError') throw e
    // Загвар хүртээмжгүй г.м. — нэг удаа fallback загвараар оролдоно.
    if (isDev()) console.warn(`[merge] ${MERGE_MODEL} алдаа, ${FALLBACK_MODEL} руу:`, e)
    return runMerge(openai, FALLBACK_MODEL, userPrompt, signal)
  }
}

async function runMerge(
  openai: OpenAI,
  model: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await openai.responses.create(
    {
      model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    },
    { signal }
  )
  return (response.output_text ?? '').trim()
}
