// this file is responsible for defining the API client used by the frontend application
// to communicate with the backend server, including error handling and JSON response parsing

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export async function getJson<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>
): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  let url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value))
      }
    }
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network request failed'
    throw new ApiError(0, `Network failure: ${message}`)
  }

  // if the response is not ok (status code outside 200-299), attempt to parse the error detail from the response body
  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`
    try {
      const errBody = await response.json()
      if (errBody && typeof errBody === 'object' && 'detail' in errBody) {
        if (typeof errBody.detail === 'string') {
          errorDetail = errBody.detail
        } else if (Array.isArray(errBody.detail)) {
          errorDetail = errBody.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(', ')
        } else {
          errorDetail = JSON.stringify(errBody.detail)
        }
      }
    } catch {
      // Body not JSON, fallback to status text
      if (response.statusText) {
        errorDetail = response.statusText
      }
    }
    throw new ApiError(response.status, errorDetail)
  }

  return response.json() as Promise<T>
}
