// Both are same-origin routes on this site's worker (src/worker), which forwards
// /api/* to the backend worker and serves /media/* from R2 via bindings.
const API_BASE = '/api'
const R2_BASE = '/media'

/** Public URL for an R2 object key such as "headshot.png". */
export const r2Url = (key: string) => `${R2_BASE}/${key.replace(/^\/+/, '')}`

// Dates are "YYYY-MM-DD"; icon/image fields are R2 keys.
export interface ChildSkill {
  id: number
  name: string
  priority: number | null
  icon: string | null
}

export interface Skill extends ChildSkill {
  children: ChildSkill[]
}

export interface Contact {
  name: string
  value: string
  icon: string | null
  link: string | null
  priority: number | null
  show_in_header: boolean | null
}

export interface ProjectContact extends Contact {
  id: number
  type: 'github' | 'live'
}

export interface Project {
  id: number
  name: string
  start_date: string
  end_date: string | null
  description: string | null
  bulleted_description: string[]
  tech_stack: string[]
  image: string | null
  priority: number | null
  contacts: ProjectContact[]
}

export interface Experience {
  id: number
  name: string
  title: string
  start_date: string
  end_date: string | null
  priority: number | null
}

export interface Education {
  school: string
  degree: string
  start_date: string
  end_date: string | null
}

/** fetch() that rejects with a curl-style message, e.g. "curl: (22) The requested URL returned error: 500 – ...". */
async function request(url: string, signal: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if (signal.aborted) throw err
    throw new Error(`curl: (7) Failed to connect to ${url}`)
  }

  if (!res.ok) {
    const body: { detail?: string } | null = await res.json().catch(() => null)
    // statusText is empty over HTTP/2, so only append a reason when there is one.
    const reason = body?.detail ?? res.statusText
    throw new Error(`curl: (22) The requested URL returned error: ${res.status}${reason ? ` – ${reason}` : ''}`)
  }

  return res
}

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const url = API_BASE + path
  const res = await request(url, signal)

  try {
    return await res.json()
  } catch {
    throw new Error(`curl: (8) Weird server reply from ${url}`)
  }
}

/** Downloads a whole file and resolves with its size in bytes. */
export async function download(url: string, signal: AbortSignal): Promise<number> {
  const res = await request(url, signal)

  try {
    return (await res.blob()).size
  } catch (err) {
    if (signal.aborted) throw err
    throw new Error(`curl: (18) Transferred a partial file from ${url}`)
  }
}

export const api = {
  skills: (s: AbortSignal) => get<Skill[]>('/skills', s),
  contacts: (s: AbortSignal) => get<Contact[]>('/contacts', s),
  education: (s: AbortSignal) => get<Education[]>('/education', s),
  projects: (s: AbortSignal) => get<Project[]>('/projects', s),
  experience: (s: AbortSignal) => get<Experience[]>('/experience', s),
}
