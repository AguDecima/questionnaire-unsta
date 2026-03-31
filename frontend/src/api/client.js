const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
const API_CLIENT_KEY = import.meta.env.VITE_API_CLIENT_KEY ?? ''

const request = async (path, options = {}) => {
  if (!API_CLIENT_KEY) {
    throw new Error('Falta configurar VITE_API_CLIENT_KEY en el frontend')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-client-key': API_CLIENT_KEY,
      ...(options.headers ?? {}),
    },
    ...options,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.message ?? `Error HTTP ${response.status}`)
  }

  return response.json()
}

export const fetchIntroPage = () => request('/api/intro')

export const fetchQuestions = () => request('/api/questions')

export const submitQuestionnaire = (payload) =>
  request('/api/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
