const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function loadTsModule(path) {
  const source = readFileSync(path, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: path
  }).outputText

  const mod = new Module(path, module)
  mod.filename = path
  mod.paths = Module._nodeModulePaths(process.cwd())
  mod._compile(compiled, path)
  return mod.exports
}

const {
  normalizeForeignWords,
  protectTranscriptSkeleton
} = loadTsModule(join(process.cwd(), 'src/main/transcription/foreignWordNormalizer.ts'))

const normalizeCases = [
  {
    input: 'би өнөөдөр митинг дээр орно',
    expected: 'би өнөөдөр meeting дээр орно'
  },
  {
    input: 'маргааш презентэйшнээ бэлдэх хэрэгтэй',
    expected: 'маргааш presentation-ээ бэлдэх хэрэгтэй'
  },
  {
    input: 'имэйлээ шалгаад реплай бичээрэй',
    expected: 'email-ээ шалгаад reply бичээрэй'
  },
  {
    input: 'дэдлайнаас өмнө асайнментээ дуусгана',
    expected: 'deadline-аас өмнө assignment-аа дуусгана'
  },
  {
    input: 'апи респонс буруу ирээд бэкэнд дээр эррор гарсан',
    expected: 'API response буруу ирээд backend дээр error гарсан'
  },
  {
    input: 'би кофе уугаад хичээлдээ явна',
    expected: 'би кофе уугаад хичээлдээ явна'
  },
  {
    input: 'миний компьютер асахгүй байна',
    expected: 'миний компьютер асахгүй байна'
  },
  {
    input: 'интернет өнөөдөр удаан байна',
    expected: 'интернет өнөөдөр удаан байна'
  },
  {
    input: 'фигма дизайн арай модерн харагдаж байна',
    expected: 'Figma design арай modern харагдаж байна'
  },
  {
    input: 'линкийг над руу явуулаад файлаа гитхаб дээр пүш хийгээрэй',
    expected: 'link-ийг над руу явуулаад file-аа GitHub дээр push хийгээрэй'
  },
  {
    input: 'интернет удаан болохоор митинг тасалдаад байна',
    expected: 'интернет удаан болохоор meeting тасалдаад байна'
  },
  {
    input: 'Интернет удаан болохоор митинг тасалдаад байна',
    expected: 'Интернет удаан болохоор meeting тасалдаад байна'
  },
  {
    input: 'би кофе уугаад компьютер дээрээ асайнментээ хийнэ',
    expected: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    input: 'би кофе уугаад компьютер дээрээ асайнментаа хийнэ',
    expected: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    input: 'би кофе уугаад компьютер дээрээ асайнмент аа хийнэ',
    expected: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    input: 'би кофе уугаад компьютер дээрээ assignment аа хийнэ',
    expected: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    input: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ',
    expected: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    input: 'би кофе уугаад компьютер дээрээ асайнмент хийнэ',
    expected: 'би кофе уугаад компьютер дээрээ assignment хийнэ'
  },
  {
    input: 'манай маркетинг класс өнөөдөр эрт тарсан',
    expected: 'манай маркетинг class өнөөдөр эрт тарсан'
  },
  {
    input: 'апи респонс буруу ирээд бэкэнд дээр эррор гарсан',
    expected: 'API response буруу ирээд backend дээр error гарсан'
  },
  {
    input: 'дэдлайнаасаа өмнө асайнментээ дуусгана',
    expected: 'deadline-аасаа өмнө assignment-аа дуусгана'
  },
  {
    input: 'deadline-аа өмнө assignment-аа дуусгана',
    expected: 'deadline-аасаа өмнө assignment-аа дуусгана'
  },
  {
    input: 'deadline аасаа өмнө assignment-аа дуусгана',
    expected: 'deadline-аасаа өмнө assignment-аа дуусгана'
  },
  {
    input: 'дэдлайн аа өмнө асайнментээ дуусгана',
    expected: 'deadline-аасаа өмнө assignment-аа дуусгана'
  },
  {
    input: 'буруу гэж хэлсэн болохоос буруу гэж хэлээгүй',
    openaiHint: 'буруу гэж хэлсэн болохоос bro гэж хэлээгүй',
    expected: 'буруу гэж хэлсэн болохоос bro гэж хэлээгүй'
  },
  {
    input: 'өнөөдөр тийм митинг дээр прожектийн дэдлайн ярьсан',
    openaiHint: 'өнөөдөр team meeting дээр project-ийн deadline ярьсан',
    expected: 'өнөөдөр team meeting дээр project-ийн deadline ярьсан'
  },
  {
    input: 'өнөөдөр тийм митинг дээр прожектын дэдлайн ярьсан',
    openaiHint: 'өнөөдөр team meeting дээр project-ийн deadline ярьсан',
    expected: 'өнөөдөр team meeting дээр project-ийн deadline ярьсан'
  },
  {
    input: 'энэ тийм гоё санаа байна',
    openaiHint: '',
    expected: 'энэ тийм гоё санаа байна'
  },
  {
    input: 'прожектын дэдлайн ярьсан',
    expected: 'project-ийн deadline ярьсан'
  },
  {
    input: 'project-ын deadline ярьсан',
    expected: 'project-ийн deadline ярьсан'
  },
  {
    input: 'project ийн deadline ярьсан',
    expected: 'project-ийн deadline ярьсан'
  },
  {
    input: 'projectийн deadline ярьсан',
    expected: 'project-ийн deadline ярьсан'
  }
]

for (const testCase of normalizeCases) {
  assert.equal(
    normalizeForeignWords(testCase.input, { openaiText: testCase.openaiHint }),
    testCase.expected,
    testCase.input
  )
}

const safetyCases = [
  {
    finalText: 'API response bro ирээд backend дээр error гарсан',
    chimegeText: 'апи респонс буруу ирээд бэкэнд дээр эррор гарсан',
    expected: 'API response буруу ирээд backend дээр error гарсан'
  },
  {
    finalText: 'Би coffee уугаад хичээлдээ явна',
    chimegeText: 'би кофе уугаад хичээлдээ явна',
    expected: 'Би кофе уугаад хичээлдээ явна'
  },
  {
    finalText: 'Миний computer асахгүй байна',
    chimegeText: 'миний компьютер асахгүй байна',
    expected: 'Миний компьютер асахгүй байна'
  },
  {
    finalText: 'Internet өнөөдөр удаан байна',
    chimegeText: 'интернет өнөөдөр удаан байна',
    expected: 'интернет өнөөдөр удаан байна'
  },
  {
    finalText: 'Internet удаан болохоор meeting тасалдаад байна',
    chimegeText: 'интернэт удаан болохоор митинг тасалдаад байна',
    expected: 'интернэт удаан болохоор meeting тасалдаад байна'
  },
  {
    finalText: 'Миний computer-ээ асааж чадсангүй',
    chimegeText: 'миний компьютерээ асааж чадсангүй',
    expected: 'Миний компьютерээ асааж чадсангүй'
  },
  {
    finalText: 'Internet-ийн хурд удаан байна',
    chimegeText: 'интернетийн хурд удаан байна',
    expected: 'интернетийн хурд удаан байна'
  },
  {
    finalText: 'API response bro ирээд backend дээр error гарсан',
    chimegeText: 'апи респонс буруу ирээд бэкэнд дээр эррор гарсан',
    options: { glossary: ['bro'] },
    expected: 'API response bro ирээд backend дээр error гарсан'
  },
  {
    finalText: 'Буруу гэж хэлсэн болохоос bro гэж хэлээгүй',
    chimegeText: 'буруу гэж хэлсэн болохоос буруу гэж хэлээгүй',
    options: { openaiText: 'буруу гэж хэлсэн болохоос bro гэж хэлээгүй' },
    expected: 'Буруу гэж хэлсэн болохоос bro гэж хэлээгүй'
  },
  {
    finalText: 'Буруу гэж хэлсэн болохоос bro гэж хэлээгүй',
    chimegeText: 'буруу гэж хэлсэн болохоос буруу гэж хэлээгүй',
    expected: 'Буруу гэж хэлсэн болохоос буруу гэж хэлээгүй'
  },
  {
    finalText: 'Би кофе уугаад компьютер дээрээ assignment хийнэ',
    chimegeText: 'би кофе уугаад компьютер дээрээ асайнментээ хийнэ',
    expected: 'Би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    finalText: 'Би кофе уугаад компьютер дээрээ assignment хийнэ',
    chimegeText: 'би кофе уугаад компьютер дээрээ асайнмент хийнэ',
    expected: 'Би кофе уугаад компьютер дээрээ assignment хийнэ'
  },
  {
    finalText: 'Би кофе уугаад компьютер дээрээ assignment-аа хийнэ. Би кофе уугаад компьютер дээрээ assignment-аа хийнэ',
    chimegeText: 'би кофе уугаад компьютер дээрээ асайнментээ хийнэ. би кофе уугаад компьютер дээрээ асайнмент хийнэ',
    expected: 'Би кофе уугаад компьютер дээрээ assignment-аа хийнэ. Би кофе уугаад компьютер дээрээ assignment хийнэ'
  },
  {
    finalText: 'Би кофе уугаад компьютер дээрээ assignment-аа хийнэ',
    chimegeText: 'би кофе уугаад компьютер дээрээ асайнментээ хийнэ',
    expected: 'Би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  },
  {
    finalText: 'Би кофе уугаад компьютер дээрээ assignment хийнэ',
    chimegeText: 'би кофе уугаад компьютер дээрээ асайнмент хийнэ',
    options: { openaiText: 'би кофе уугаад компьютер дээрээ assignment-аа хийнэ' },
    expected: 'Би кофе уугаад компьютер дээрээ assignment-аа хийнэ'
  }
]

for (const testCase of safetyCases) {
  assert.equal(
    protectTranscriptSkeleton(testCase.finalText, testCase.chimegeText, testCase.options),
    testCase.expected,
    testCase.finalText
  )
}

console.log(`foreignWordNormalizer: ${normalizeCases.length + safetyCases.length} tests passed`)
