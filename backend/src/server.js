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

const loadQuestionBank = () => {
  const raw = fs.readFileSync(questionsPath, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) {
    throw new Error('gnkq-questions.json debe ser un array')
  }
  data.forEach((q, index) => {
    if (!q?.id || !q?.text || !Array.isArray(q?.options) || !q?.correctOptionId) {
      throw new Error(`Pregunta invalida en indice ${index}`)
    }
  })
  return data
}

const app = express()
const port = Number(process.env.PORT ?? 4000)
const expectedApiClientKey = process.env.API_CLIENT_KEY ?? ''

app.use(cors())
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
  defaultTimeLimitSeconds: 20,
  links: [{ label: 'Ver anexo I y II', url: 'https://docs.google.com/' }],
}

const QUESTION_BANK = loadQuestionBank()

const toPublicQuestion = (question) => ({
  id: question.id,
  section: question.section,
  text: question.text,
  options: question.options.map((option) => ({ id: option.id, text: option.text })),
})

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

  return {
    verdict: passed ? 'Apto' : 'Requiere refuerzo',
    score: finalScore,
    maxScore,
    message: passed
      ? 'Buen rendimiento general. Resultado listo para enviar a GSheet.'
      : 'Se recomienda revisar contenidos basicos antes de una nueva evaluacion.',
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
  res.json(QUESTION_BANK.map(toPublicQuestion))
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
