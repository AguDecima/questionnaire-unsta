import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const questionsPath = path.join(__dirname, '../data/gnkq-questions.json')

const validateQuestion = (q, index) => {
  if (!q?.id || !q?.text || !Array.isArray(q?.options) || !q?.correctOptionId) {
    throw new Error(`Pregunta invalida en indice ${index}`)
  }
}

/**
 * Carga `gnkq-questions.json`: formato `{ sections, questions }` (única fuente de datos).
 * Compatibilidad: si el archivo es solo un array (legacy), se asume `sections: []`.
 */
const loadGnkqData = () => {
  const raw = fs.readFileSync(questionsPath, 'utf8')
  const data = JSON.parse(raw)

  if (data?.sections && Array.isArray(data?.questions)) {
    data.questions.forEach(validateQuestion)
    return {
      sections: data.sections,
      questions: data.questions,
    }
  }

  if (Array.isArray(data)) {
    data.forEach(validateQuestion)
    return { sections: [], questions: data }
  }

  throw new Error('gnkq-questions.json debe tener forma { sections, questions } o ser un array de preguntas')
}

const app = express()
const port = Number(process.env.PORT ?? 4000)
const expectedApiClientKey = process.env.API_CLIENT_KEY ?? ''

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-client-key'],
    exposedHeaders: ['Content-Type'],
    maxAge: 86400,
  }),
)
app.use(express.json())

app.use('/api', (req, res, next) => {
  // Allow health checks without key validation.
  if (req.path === '/health') {
    next()
    return
  }

  if (!expectedApiClientKey) {
    res.status(500).json({ message: 'API_CLIENT_KEY no esta configurada en el servidor' })
    return
  }

  const receivedKey = req.header('x-api-client-key')
  if (!receivedKey || receivedKey !== expectedApiClientKey) {
    res.status(401).json({ message: 'No autorizado: header x-api-client-key invalido' })
    return
  }

  next()
})

const INTRO_DATA = {
  title:
    'Nivel de conocimiento en nutricion y su relacion con el estado nutricional en estudiantes universitarios',
  introduction:
    'Este estudio academico pretende analizar la relacion entre el nivel de conocimiento en nutricion y el estado nutricional en estudiantes universitarios.',
  phases: [
    'Valoracion del nivel de conocimiento en nutricion: a traves del cuestionario.',
    'Valoracion del estado nutricional: en consultorio de nutricion UNSTA con toma de peso, talla, IMC y circunferencia de cintura.',
  ],
  thesisDisclaimer:
    'Esta investigacion forma parte de un trabajo de tesis para la obtencion del titulo de grado de Licenciado en Nutricion en la Universidad del Norte Santo Tomas de Aquino. Se asegura el anonimato de todos los datos proporcionados, siendo estos utilizados solo con fines academicos.',
  consentText: 'Aceptacion de terminos y condiciones (Anexo I y II).',
  defaultTimeLimitSeconds: 30,
  links: [{ label: 'Ver anexo I y II', url: 'https://docs.google.com/' }],
}

const { sections: GNKQ_SECTIONS, questions: QUESTION_BANK } = loadGnkqData()

const toPublicQuestion = (question) => {
  const sectionTitle =
    GNKQ_SECTIONS.find((s) => String(s.id) === String(question.section))?.title ?? ''
  return {
    id: question.id,
    section: question.section,
    sectionTitle,
    text: question.text,
    options: question.options.map((option) => ({ id: option.id, text: option.text })),
  }
}

const evaluateAnswers = (payload) => {
  const score = payload.answers.reduce((accumulator, answer) => {
    const question = QUESTION_BANK.find((item) => item.id === answer.questionId)
    if (!question || !answer.optionId) return accumulator
    return answer.optionId === question.correctOptionId ? accumulator + 1 : accumulator
  }, 0)

  const maxScore = QUESTION_BANK.length
  const qualityPenalty = payload.meta?.totalTabSwitchCount >= 3 ? 1 : 0
  const finalScore = Math.max(score - qualityPenalty, 0)
  const passed = finalScore >= Math.ceil(maxScore * 0.6)
  const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0

  const penaltyNote =
    qualityPenalty > 0
      ? ' Se aplicó un ajuste menor al puntaje por cambios frecuentes de pestaña, según los criterios del estudio.'
      : ''

  let message
  if (percentage >= 60) {
    message =
      `Tu resultado se ubica por encima del umbral de referencia del cuestionario, lo que sugiere una buena familiaridad con los temas de nutrición y salud evaluados.${penaltyNote}`
  } else if (percentage >= 40) {
    message =
      `Tu resultado se ubica en un rango intermedio. Los valores son orientativos y el estudio los utilizará de forma agregada y anónima, sin constituir una calificación personal.${penaltyNote}`
  } else {
    message =
      `Tu resultado se ubica por debajo del umbral de referencia del instrumento. Los datos aportan al objetivo científico del trabajo; no implican un diagnóstico ni una evaluación clínica.${penaltyNote}`
  }

  return {
    verdict: passed ? 'Apto' : 'Requiere refuerzo',
    score: finalScore,
    maxScore,
    percentage,
    message,
  }
}

const getSheetsClient = () => {
  const spreadsheetId = process.env.GSHEET_ID
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!spreadsheetId || !clientEmail || !privateKey) {
    return null
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return {
    spreadsheetId,
    sheets: google.sheets({ version: 'v4', auth }),
  }
}

const appendSubmissionToSheet = async (payload, result) => {
  const sheetsClient = getSheetsClient()
  if (!sheetsClient) return { written: false, reason: 'missing_env' }

  const row = [
    new Date().toISOString(),
    payload.meta?.participantData?.dni ?? '',
    payload.meta?.participantData?.fullName ?? '',
    payload.meta?.participantData?.age ?? '',
    payload.meta?.participantData?.career ?? '',
    payload.meta?.participantData?.yearOrCondition ?? '',
    payload.meta?.participantData?.contact ?? '',
    payload.meta?.timeLimitSeconds ?? '',
    payload.meta?.totalTabSwitchCount ?? 0,
    result.verdict,
    result.score,
    result.maxScore,
    JSON.stringify(payload.answers ?? []),
  ]

  await sheetsClient.sheets.spreadsheets.values.append({
    spreadsheetId: sheetsClient.spreadsheetId,
    range: process.env.GSHEET_RANGE ?? 'Respuestas!A:M',
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return { written: true }
}

app.get('/api/intro', (_req, res) => {
  res.json(INTRO_DATA)
})

app.get('/api/questions', (_req, res) => {
  res.json({
    sections: GNKQ_SECTIONS,
    questions: QUESTION_BANK.map(toPublicQuestion),
  })
})

app.post('/api/submit', async (req, res) => {
  const payload = req.body

  if (!payload || !Array.isArray(payload.answers)) {
    res.status(400).json({ message: 'Payload invalido' })
    return
  }

  try {
    const result = evaluateAnswers(payload)
    const gsheet = await appendSubmissionToSheet(payload, result)

    res.json({
      ...result,
      gsheet,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error al procesar evaluacion',
      detail: error instanceof Error ? error.message : 'unknown',
    })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`)
})
