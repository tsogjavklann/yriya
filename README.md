# Yriya 🎙

Монгол хэлний дуу хоолойн dictation (бичигч) desktop апп — **Wispr Flow** маягийн.
Global hotkey дараад монголоор ярихад танигдсан текст идэвхтэй цонхны cursor байрлалд
шууд бичигдэнэ.

- **STT engine:** [Chimege API](https://chimege.com) — STT-Long (`/stt-long`)
- **Платформ:** Windows (Electron)
- **Текст оруулалт:** clipboard + Ctrl+V (кирилл/Unicode-д найдвартай)

## Хэрхэн ажилладаг вэ

Chimege API нь жинхэнэ streaming өгдөггүй. Yriya микрофоны яриаг
**энерги-суурьт VAD**-аар чимээгүй завсар бүрд таслаж, өгүүлбэр бүрийг тус
тусад нь Chimege STT-Long руу илгээдэг: эхлээд аудиог `/stt-long` руу илгээж
UUID авч, дараа нь `/stt-long-transcript`-аас хариу бэлэн болтол давтан асуудаг
(асинхрон). Өгүүлбэр дуусаад ~3–10 сек дотор текст гарч ирнэ.

```
hotkey → микрофон → VAD (өгүүлбэр таслах) → WAV → POST /stt-long → UUID
       → GET /stt-long-transcript (poll) → цэгцлэх → clipboard + Ctrl+V
       → идэвхтэй цонхонд бичигдэнэ
```

## Суулгах

```bash
npm install
node scripts/gen-icons.cjs   # resources/icon.png үүсгэнэ (анх удаа)
```

## Ажиллуулах (хөгжүүлэлт)

```bash
npm run dev
```

Эхний удаа token тохируулаагүй тул **Тохиргоо** цонх автоматаар нээгдэнэ.

## Ашиглах

1. **Тохиргоо** цонхонд console.chimege.com-оос авсан **Chimege token**-оо оруулна.
2. Текст бичих программаа (Word, browser, chat г.м) нээж, cursor-оо тавина.
3. Hotkey дарна (default: **Ctrl+Shift+Space**) — доод талд Yriya-ийн товч гарч ирнэ. Дахин дарвал товч нуугдана.
4. Товчин дээр **хулганаар дарж** бичлэгээ эхлүүлнэ.
5. Монголоор ярина. Өгүүлбэр бүр дуусаад текст cursor байрлалд автоматаар бичигдэнэ.
6. Дуусгахын тулд товчин дээр дахин дарна. (Tray icon дээр дарж бас удирдаж болно.)

## Тохиргоо

| Тохиргоо | Тайлбар |
|----------|---------|
| Hotkey | Yriya-ийн товчийг харуулах/нуух товчлуур |
| Микрофон | Ашиглах микрофон |
| Эхний үсэг том | Өгүүлбэрийн эхийг том үсгээр |
| Оруулах арга | Paste (Ctrl+V) эсвэл тэмдэгтээр шивэх |
| Мэдрэмж | VAD-ийн доод босго (орчны шуугаанд автоматаар тохирно) |
| Таслах завсар | Хэдэн мс чимээгүй байвал өгүүлбэр дуусгах |

## Build / Суулгац

```bash
npm run build        # out/ дотор bundle
npm run package:dir  # dist/win-unpacked/ дотор шууд ажиллах апп (Yriya.exe)
npm run package      # dist/ дотор NSIS installer + portable .exe хоёуланг
```

`npm run package` нь хоёр артефакт үүсгэнэ:

- **`Yriya-<version>-x64.exe`** — NSIS суулгагч (Start menu, uninstall-тай)
- **`Yriya-<version>-portable.exe`** — суулгахгүй шууд ажиллах нэг файл

> ⚠️ `npm run package` нь electron-builder-ийн дотоод хэрэгсэл задлахад symlink
> үүсгэх эрх шаарддаг. Алдаа гарвал Windows **Developer Mode**-ийг асаах
> (Settings → For developers) эсвэл terminal-ийг administrator эрхээр
> ажиллуулна. `package:dir` нь энэ эрх шаардахгүй.

### Code signing (заавал биш)

Гарын үсэггүй build-ийг Windows SmartScreen «танихгүй хэвлэгч» гэж анхааруулна —
энэ нь хэвийн. Сертификат (`.pfx`) байгаа бол гарын үсэг зурахын тулд build-ийн
өмнө орчны хувьсагчийг тохируулна:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "нууц үг"
npm run package
```

## Бүтэц

```
src/
  main/       Electron main — tray, hotkey, Chimege client, текст оруулалт, session
  preload/    contextBridge IPG гүүр
  renderer/
    overlay/  Доод талын overlay цонх (микрофон барих, төлөв)
    settings/ Тохиргооны цонх
    audio/    capture (getUserMedia) + vad (энерги VAD) + wav encoder
  shared/     main/renderer хуваалцах төрлүүд
```

## Технологийн анхаарах зүйл

- **Streaming биш:** Chimege streaming API байхгүй. STT-Long нь асинхрон
  (илгээх → poll хийх) тул өгүүлбэр бүр дуусахад ~3–10 сек хүлээнэ.
- **Token:** «Монгол STT-Long» төрлийн идэвхтэй token шаардана. Энгийн богино
  «Монгол STT» token энэ урсгалд ажиллахгүй (`/transcribe` биш `/stt-long`).
- **VAD:** энерги-суурьт хялбар VAD ашигласан (native dependency, asset
  шаардахгүй). Чимээ ихтэй орчинд Silero VAD (`@ricky0123/vad-web`) руу
  сайжруулж болно.
- **Текст оруулалт:** `@nut-tree-fork/nut-js`-ээр Ctrl+V симуляц хийдэг.
  nut-js ачаалагдахгүй бол текст зөвхөн clipboard-д хуулагдана.
- Token нь Electron `safeStorage`-аар шифрлэгдэн хадгалагдана.
