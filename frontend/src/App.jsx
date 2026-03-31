import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchIntroPage, fetchQuestions, submitQuestionnaire } from './api/client'
import './App.css'

const FLOW = {
  LANDING: 'landing',
  QUESTIONS: 'questions',
  RESULT: 'result',
}

const DEFAULT_TIME_LIMIT_SECONDS = 20
const ANNEX_MODAL_CONTENT = {
  anexo1: {
    title: 'ANEXO I - CONSENTIMIENTO INFORMADO',
    content: [
      'Universidad del Norte Santo Tomas de Aquino',
      'Facultad de Ciencias de la Salud - Licenciatura en Nutricion',
      'Titulo del estudio: Nivel de conocimiento en nutricion y su relacion con el estado nutricional en estudiantes universitarios.',
      'Investigador responsable: Decima, Luciano Ariel',
      'Correo electronico: lucianodecima1@gmail.com',
      'Lugar de realizacion: Universidad del Norte Santo Tomas de Aquino - Sede Yerba Buena, Tucuman, Argentina.',
      'Invitacion: Usted esta siendo invitado/a a participar voluntariamente en un estudio academico cuyo objetivo es analizar la relacion entre el nivel de conocimiento en nutricion y el estado nutricional en estudiantes universitarios y, a su vez, realizar una comparacion de grupo entre estudiantes de la Licenciatura en Nutricion y estudiantes de otras carreras de grado que no pertenezcan a la Facultad de Ciencias de la Salud. Esta investigacion forma parte de un trabajo de tesis para la obtencion del titulo de grado de Licenciado en Nutricion en la Universidad del Norte Santo Tomas de Aquino.',
      'Procedimiento: En caso de aceptar participar, se le solicitara responder un cuestionario auto-administrado sobre conocimientos en nutricion y someterse a una evaluacion antropometrica que incluira mediciones de peso, talla y circunferencia de cintura. Estas evaluaciones se realizaran una unica vez, en el consultorio nutricional de la Facultad de Ciencias de la Salud de la UNSTA (espacio fisico privado), bajo condiciones seguras e higienicas, con una duracion aproximada de 10 minutos.',
      'Riesgos y molestias: La participacion en este estudio no implica riesgos significativos para su salud. Las mediciones antropometricas son procedimientos no invasivos, indoloros y seguros.',
      'Beneficios: Los resultados del estudio contribuiran al conocimiento cientifico sobre la relacion entre la educacion nutricional y el estado de salud; lo cual busca orientar futuras estrategias e intervenciones de promocion y politicas de salud en el marco de la educacion alimentaria nutricional.',
      'Confidencialidad: Toda la informacion recolectada sera estrictamente confidencial y anonima. Los datos obtenidos seran utilizados unicamente con fines academicos y cientificos. Los resultados se presentaran de manera grupal y estadistica, garantizando la privacidad de todos los participantes.',
      'Voluntariedad y retiro: Su participacion en este estudio es completamente voluntaria. Puede negarse a participar o retirarse del estudio en cualquier momento, sin que ello le ocasione perjuicio alguno.',
      'Consentimiento: He leido y comprendo la informacion precedente. Se me ha explicado el proposito, los procedimientos, los posibles riesgos y beneficios del estudio. Entiendo que mi participacion es voluntaria y que puedo retirarme cuando lo desee sin consecuencia alguna. Sabiendo todo lo anteriormente mencionado, autorizo a los investigadores a utilizar los datos obtenidos en este estudio con fines academicos, garantizando la confidencialidad y el anonimato de mi informacion personal.',
    ],
  },
  anexo2: {
    title: 'ANEXO II - NOTA DE ACEPTACION',
    content: [
      'Universidad del Norte Santo Tomas de Aquino',
      'Facultad de Ciencias de la Salud - Licenciatura en Nutricion',
      'Titulo del estudio: Nivel de conocimiento en nutricion y su relacion con el estado nutricional en estudiantes universitarios.',
      'Investigador responsable: Decima, Luciano Ariel',
      'Correo electronico: lucianodecima1@gmail.com',
      'Lugar de realizacion: Universidad del Norte Santo Tomas de Aquino - Sede Yerba Buena, Tucuman, Argentina.',
      'Declaro que he leido y comprendido la informacion proporcionada sobre el estudio titulado "Nivel de conocimiento en nutricion y su relacion con el estado nutricional en estudiantes universitarios". Se me ha explicado claramente el proposito de la investigacion, los procedimientos que se llevaran a cabo, asi como los posibles riesgos y beneficios asociados a mi participacion. Entiendo que mi participacion es completamente voluntaria y que puedo retirarme del estudio en cualquier momento sin que esto implique perjuicio alguno. Asimismo, se me ha informado que los datos obtenidos seran utilizados unicamente con fines academicos y cientificos, garantizandose la confidencialidad y el anonimato de mi informacion personal. En conocimiento de todo lo anterior, acepto participar voluntariamente en el presente estudio.',
    ],
  },
}

const shuffleArray = (list) => {
  const clonedList = [...list]

  for (let i = clonedList.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1))
    ;[clonedList[i], clonedList[randomIndex]] = [clonedList[randomIndex], clonedList[i]]
  }

  return clonedList
}

function App() {
  const [flowStep, setFlowStep] = useState(FLOW.LANDING)
  const [introData, setIntroData] = useState(null)
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState('')
  const [answers, setAnswers] = useState([])
  const [questionStartMs, setQuestionStartMs] = useState(null)
  const [remainingTime, setRemainingTime] = useState(DEFAULT_TIME_LIMIT_SECONDS)
  const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT_SECONDS)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [participantData, setParticipantData] = useState({
    dni: '',
    fullName: '',
    age: '',
    career: '',
    yearOrCondition: '',
    contact: '',
    acceptedTerms: false,
  })
  const [openAnnexModal, setOpenAnnexModal] = useState(null)

  const currentQuestion = questions[currentIndex]
  const answeredCount = answers.length

  const progress = useMemo(() => {
    if (!questions.length) return 0
    return Math.round(((answeredCount + 1) / questions.length) * 100)
  }, [answeredCount, questions.length])

  useEffect(() => {
    const loadLanding = async () => {
      const data = await fetchIntroPage()
      setIntroData(data)
      setTimeLimit(data.defaultTimeLimitSeconds)
      setRemainingTime(data.defaultTimeLimitSeconds)
    }

    loadLanding()
  }, [])

  const handleAnswerSubmit = useCallback(
    async ({ forcedByTimeout = false, optionValue = '' }) => {
      if (!currentQuestion || !questionStartMs) return

      const answerToSave = {
        questionId: currentQuestion.id,
        optionId: optionValue || null,
        responseTimeMs: Date.now() - questionStartMs,
        forcedByTimeout,
        tabSwitchCountAtAnswer: tabSwitchCount,
      }

      const updatedAnswers = [...answers, answerToSave]
      setAnswers(updatedAnswers)

      if (currentIndex < questions.length - 1) {
        setCurrentIndex((previous) => previous + 1)
        setSelectedOption('')
        setRemainingTime(timeLimit)
        setQuestionStartMs(Date.now())
        return
      }

      setLoading(true)

      try {
        const payload = {
          meta: {
            timeLimitSeconds: timeLimit,
            totalTabSwitchCount: tabSwitchCount,
            participantData,
          },
          answers: updatedAnswers,
        }

        const backendResult = await submitQuestionnaire(payload)
        setResult(backendResult)
        setFlowStep(FLOW.RESULT)
      } finally {
        setLoading(false)
      }
    },
    [
      answers,
      currentIndex,
      currentQuestion,
      participantData,
      questionStartMs,
      questions.length,
      tabSwitchCount,
      timeLimit,
    ],
  )

  useEffect(() => {
    if (flowStep !== FLOW.QUESTIONS || !currentQuestion) return undefined

    const intervalId = window.setInterval(() => {
      setRemainingTime((previousValue) => {
        if (previousValue <= 1) {
          window.clearInterval(intervalId)
          handleAnswerSubmit({
            forcedByTimeout: true,
            optionValue: selectedOption,
          })
          return 0
        }

        return previousValue - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [flowStep, currentQuestion, selectedOption, handleAnswerSubmit])

  useEffect(() => {
    if (flowStep !== FLOW.QUESTIONS) return undefined

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setTabSwitchCount((previous) => previous + 1)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [flowStep])

  const startQuestionFlow = async () => {
    if (
      !participantData.dni ||
      !participantData.fullName ||
      !participantData.age ||
      !participantData.career ||
      !participantData.yearOrCondition ||
      !participantData.contact ||
      !participantData.acceptedTerms
    ) {
      window.alert('Completa los datos personales y acepta los terminos para continuar.')
      return
    }

    setLoading(true)

    try {
      const backendQuestions = await fetchQuestions()
      const randomizedQuestions = shuffleArray(backendQuestions)

      setQuestions(randomizedQuestions)
      setAnswers([])
      setCurrentIndex(0)
      setSelectedOption('')
      setResult(null)
      setTabSwitchCount(0)
      setRemainingTime(timeLimit)
      setQuestionStartMs(Date.now())
      setFlowStep(FLOW.QUESTIONS)
    } finally {
      setLoading(false)
    }
  }

  const restart = () => {
    setFlowStep(FLOW.LANDING)
    setQuestions([])
    setCurrentIndex(0)
    setSelectedOption('')
    setAnswers([])
    setQuestionStartMs(null)
    setRemainingTime(timeLimit)
    setResult(null)
    setTabSwitchCount(0)
  }

  return (
    <main className="app-shell">
      {flowStep !== FLOW.LANDING && (
        <header className="app-header">
          <h1>Evaluacion de conocimientos y riesgo cardiometabolico</h1>
        </header>
      )}

      {flowStep === FLOW.LANDING && introData && (
        <section className="card first-page">
          <article className="hero-cover">
            <div className="hero-overlay">
              <h1>{introData.title}</h1>
              <p>
                Participa en nuestro estudio academico para ayudar a evaluar el nivel de
                conocimiento y estado nutricional en estudiantes universitarios.
              </p>
            </div>
          </article>

          <article className="panel panel-intro">
            <h2>Introduccion</h2>
            <p>
              {introData.introduction}
            </p>
            <ol>
              {introData.phases.map((phase) => (
                <li key={phase}>{phase}</li>
              ))}
            </ol>
            <p>{introData.thesisDisclaimer}</p>
          </article>

          <article className="panel">
            <h3>Datos personales:</h3>
            <div className="form-grid">
              <label>
                DNI
                <input
                  type="text"
                  value={participantData.dni}
                  onChange={(event) =>
                    setParticipantData((previous) => ({ ...previous, dni: event.target.value }))
                  }
                />
              </label>
              <label>
                Nombre y Apellido
                <input
                  type="text"
                  value={participantData.fullName}
                  onChange={(event) =>
                    setParticipantData((previous) => ({
                      ...previous,
                      fullName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Edad
                <input
                  type="number"
                  min="0"
                  value={participantData.age}
                  onChange={(event) =>
                    setParticipantData((previous) => ({ ...previous, age: event.target.value }))
                  }
                />
              </label>
              <label>
                Carrera
                <input
                  type="text"
                  value={participantData.career}
                  onChange={(event) =>
                    setParticipantData((previous) => ({
                      ...previous,
                      career: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Año de cursado o condición
                <input
                  type="text"
                  value={participantData.yearOrCondition}
                  onChange={(event) =>
                    setParticipantData((previous) => ({
                      ...previous,
                      yearOrCondition: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Medio de contacto
                <input
                  type="text"
                  value={participantData.contact}
                  onChange={(event) =>
                    setParticipantData((previous) => ({
                      ...previous,
                      contact: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </article>

          <article className="panel consent-row">
            <p>{introData.consentText}</p>
            <div className="annex-actions">
              <button
                type="button"
                className="inline-link"
                onClick={() => setOpenAnnexModal('anexo1')}
              >
                Ver Anexo I
              </button>
              <button
                type="button"
                className="inline-link"
                onClick={() => setOpenAnnexModal('anexo2')}
              >
                Ver Anexo II
              </button>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={participantData.acceptedTerms}
                onChange={(event) =>
                  setParticipantData((previous) => ({
                    ...previous,
                    acceptedTerms: event.target.checked,
                  }))
                }
              />
              <span>Acepto los terminos y condiciones</span>
            </label>
          </article>

          <div className="fixed-time">
            Tiempo por pregunta definido por el estudio: <strong>{timeLimit} segundos</strong>
          </div>

          <button onClick={startQuestionFlow} disabled={loading}>
            {loading ? 'Cargando preguntas...' : 'Iniciar cuestionario'}
          </button>
          <p className="thank-you">Muchas gracias por tu participacion</p>
        </section>
      )}

      {flowStep === FLOW.QUESTIONS && currentQuestion && (
        <section className="card">
          <div className="question-header">
            <h2>
              Pregunta {currentIndex + 1} de {questions.length}
            </h2>
            <span className={remainingTime <= 5 ? 'timer is-danger' : 'timer'}>
              {remainingTime}s
            </span>
          </div>

          <div className="progress-line">
            <div style={{ width: `${progress}%` }} />
          </div>

          <p className="question-title">{currentQuestion.text}</p>

          <div className="options">
            {currentQuestion.options.map((option) => (
              <label key={option.id} className="option">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  value={option.id}
                  checked={selectedOption === option.id}
                  onChange={(event) => setSelectedOption(event.target.value)}
                />
                <span>{option.text}</span>
              </label>
            ))}
          </div>

          <div className="footer-row">
            <small>Salidas de pestania detectadas: {tabSwitchCount}</small>
            <button
              onClick={() =>
                handleAnswerSubmit({ forcedByTimeout: false, optionValue: selectedOption })
              }
              disabled={!selectedOption || loading}
            >
              {currentIndex === questions.length - 1 ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </section>
      )}

      {flowStep === FLOW.RESULT && result && (
        <section className="card">
          <h2>Resultado final</h2>
          <p className="result">
            Veredicto: <strong>{result.verdict}</strong>
          </p>
          <p>
            Puntaje estimado: {result.score}/{result.maxScore}
          </p>
          <p>Total de salidas de pestania: {tabSwitchCount}</p>
          <p>{result.message}</p>
          <button onClick={restart}>Volver al inicio</button>
        </section>
      )}

      {!introData && (
        <section className="card">
          <p>Cargando configuracion inicial...</p>
        </section>
      )}

      {openAnnexModal && (
        <section className="modal-overlay" onClick={() => setOpenAnnexModal(null)}>
          <article className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>{ANNEX_MODAL_CONTENT[openAnnexModal].title}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpenAnnexModal(null)}
              >
                Cerrar
              </button>
            </header>
            <div className="modal-content">
              {ANNEX_MODAL_CONTENT[openAnnexModal].content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
        </section>
      )}
    </main>
  )
}

export default App
