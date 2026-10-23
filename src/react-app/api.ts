// Both are same-origin routes on this site's worker (src/worker), which forwards
// /api/* to the backend worker and serves /media/* from R2 via bindings.
const API_BASE = '/api'
const R2_BASE = '/media'

/** Public URL for an R2 object key such as "icons/python.svg". */
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
  bulleted_description?: string[]
  image: string | null
  priority: number | null
  skills: ChildSkill[]
  contacts: ProjectContact[]
}

export interface Experience {
  id: number
  name: string
  title: string
  icon: string | null
  start_date: string
  end_date: string | null
  bulleted_description: string[]
  priority: number | null
}

export interface Education {
  school: string
  degree: string
  start_date: string
  end_date: string | null
  image: string | null
}

/** Rejects with a curl-style message, e.g. "curl: (22) The requested URL returned error: 500 – ...". */
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const url = API_BASE + path

  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if (signal.aborted) throw err
    throw new Error(`curl: (7) Failed to connect to ${url}`)
  }

  if (!res.ok) {
    const body: { detail?: string } | null = await res.json().catch(() => null)
    throw new Error(
      `curl: (22) The requested URL returned error: ${res.status} – ${body?.detail ?? res.statusText}`,
    )
  }

  try {
    return await res.json()
  } catch {
    throw new Error(`curl: (8) Weird server reply from ${url}`)
  }
}

export const api = {
  skills: (s: AbortSignal) => get<Skill[]>('/skills', s),
  contacts: (s: AbortSignal) => get<Contact[]>('/contacts', s),
  education: (s: AbortSignal) => get<Education[]>('/education', s),
  projects: (s: AbortSignal) => get<Project[]>('/projects', s),
  experience: (s: AbortSignal) => get<Experience[]>('/experience', s),
}
