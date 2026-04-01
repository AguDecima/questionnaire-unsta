/**
 * Imprime una fila de encabezados (separados por tab) para pegar en la fila 1 de Google Sheets.
 * Uso: node scripts/print-gsheet-headers.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataPath = path.join(__dirname, '../data/gnkq-questions.json')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

const fixed = [
  'DNI',
  'Nombre y Apellido',
  'Edad',
  'Carrera',
  'Año de cursado / condicion',
  'Contacto',
  'Puntaje',
  'Nro de salidas de pantalla',
  'Tiempo Total',
  'Fecha',
]

const perQuestion = data.questions.map((_, i) => `Pregunta ${i + 1}`)

console.log([...fixed, ...perQuestion].join('\t'))
