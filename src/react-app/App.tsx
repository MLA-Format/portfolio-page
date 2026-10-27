import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { api, download, r2Url, type Contact, type Education, type Experience, type Project, type Skill } from './api'
import { PROFILE } from './profile'

const PROMPT_USER = 'user@mlacae'
const CELL = 'pr-[2ch] align-top'

// ---------- helpers ----------

/** "2024-03-15" -> "03-2024" */
const formatDate = (date: string | null) => (date ? `${date.slice(5, 7)}-${date.slice(0, 4)}` : 'present')

/** "03-2024 - present", or just "03-2024" when both ends fall in the same month. */
function formatRange(start: string, end: string | null) {
  const [from, to] = [formatDate(start), formatDate(end)]
  return from === to ? from : `${from} - ${to}`
}

/** "Resume App!" -> "resume-app" */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "https://github.com/MLA-Format/my_code" -> "MLA-Format/my_code"; null if the link isn't a GitHub URL. */
function githubPath(link: string | null) {
  if (!link) return null
  try {
    const url = new URL(link)
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null
    return url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '') || null
  } catch {
    return null
  }
}

/** Deterministic 7-char hex "commit hash" (FNV-1a) derived from a record id. */
function commitHash(id: number) {
  let hash = 0x811c9dc5
  for (const char of `career:${id}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 7)
}

/** A size the way curl's progress meter prints it: plain bytes below 100000, then k, then M. */
function curlSize(bytes: number) {
  const k = 1024
  if (bytes < 100_000) return String(Math.floor(bytes))
  if (bytes < 10_000 * k) return `${Math.floor(bytes / k)}k`
  if (bytes < 100 * k * k) return `${(bytes / k / k).toFixed(1)}M`
  return `${Math.floor(bytes / k / k)}M`
}

/** Seconds as H:MM:SS; curl prints "--:--:--" for anything under a second. */
function curlTime(seconds: number) {
  if (!seconds) return '--:--:--'
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${Math.floor(seconds / 3600)}:${mm}:${ss}`
}

/** The last progress-meter line curl prints for a finished download, with its column widths. */
function curlProgress(bytes: number, ms: number) {
  const size = curlSize(bytes).padStart(5)
  const speed = curlSize(ms > 0 ? (bytes * 1000) / ms : bytes).padStart(5)
  const time = curlTime(Math.floor(ms / 1000)).padStart(8)
  return `100 ${size}  100 ${size}    0     0  ${speed}      0 ${time} ${time} --:--:-- ${speed}`
}

// ---------- data loading ----------

type State<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T; ms: number }
  | { status: 'error'; error: string; ms: number }

/** Fetches once on mount. `fetcher` must be a stable reference (the `api.*` functions are). */
function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>): State<T> {
  const [state, setState] = useState<State<T>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const start = performance.now()

    fetcher(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ok', data, ms: performance.now() - start })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err.message : String(err)
        setState({ status: 'error', error, ms: performance.now() - start })
      },
    )

    return () => controller.abort()
  }, [fetcher])

  return state
}

/** Downloads the whole resume so the curl output can show its real size. Module-level, so it is a stable fetcher. */
const fetchResume = (signal: AbortSignal) => download(PROFILE.resume, signal)

// ---------- building blocks ----------

function Cursor() {
  return <span role="status" aria-label="Loading" className="inline-block h-[1.1em] w-[0.6em] animate-blink bg-fg align-text-bottom motion-reduce:animate-none" />
}

/** Renders `fallback` (nothing by default) when the key is null or the image fails to load. */
function R2Image({ src, className, alt = '', fallback = null }: { src: string | null; className: string; alt?: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return fallback
  return <img src={r2Url(src)} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
}

const Icon = ({ src }: { src: string | null }) => (
  <R2Image src={src} className="mr-[0.5ch] inline-block size-4 object-contain align-text-bottom" />
)

/**
 * A bordered button-style link that opens in a new tab, so it reads as clickable.
 * With `fullWidth` it fills its container (e.g. a table cell), so stacked buttons share the widest one's width.
 */
function LinkButton({ href, icon = null, title, fullWidth = false, children }: { href: string; icon?: string | null; title?: string; fullWidth?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer"
      className={`${fullWidth ? 'flex w-full' : 'inline-flex max-w-full'} items-center gap-[0.5ch] rounded border border-highlight px-[1ch] text-pine transition-colors hover:border-pine hover:bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine`}
    >
      <R2Image src={icon} className="size-4 shrink-0 object-contain" />
      {children}
      <span aria-hidden className="ml-auto pl-[0.5ch]">
        ↗
      </span>
    </a>
  )
}

/** A contact as a link button labelled `label` (its value by default), or its icon and value as plain text when it has no link. */
function ContactLink({ contact, label = contact.value, fullWidth = false }: { contact: Contact; label?: string; fullWidth?: boolean }) {
  if (!contact.link) {
    return (
      <>
        <Icon src={contact.icon} />
        {contact.value}
      </>
    )
  }

  return (
    <LinkButton href={contact.link} icon={contact.icon} title={contact.value} fullWidth={fullWidth}>
      {label}
    </LinkButton>
  )
}

/** A prompt line followed by its output. */
function Command({ cmd, children }: { cmd: ReactNode; children?: ReactNode }) {
  return (
    <section>
      <p className="break-words">
        <span className="font-bold text-iris">{PROMPT_USER}</span>:<span className="font-bold text-pine">~</span>$ {cmd}
      </p>
      {children && <div className="mt-1 min-w-0 break-words">{children}</div>}
    </section>
  )
}

/** A command whose output comes from a request. */
function Section<T>({ cmd, state, children }: { cmd: ReactNode; state: State<T>; children: (data: T, ms: number) => ReactNode }) {
  return (
    <Command cmd={cmd}>
      {state.status === 'loading' && <Cursor />}
      {state.status === 'error' && <p className="text-love">{state.error}</p>}
      {state.status === 'ok' && children(state.data, state.ms)}
    </Command>
  )
}

// ---------- sections ----------

function Neofetch() {
  return (
    <Command cmd="neofetch">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-2">
        {PROFILE.headshot ? (
          <R2Image src={PROFILE.headshot} alt={PROFILE.name} className="size-42 shrink-0 rounded-full object-cover sm:size-48" />
        ) : (
          <div aria-hidden className="grid size-42 shrink-0 place-items-center rounded-full bg-overlay text-6xl text-muted sm:size-48">
            {PROFILE.name.charAt(0)}
          </div>
        )}
        <dl>
          <dt className="mb-1 font-bold text-iris underline underline-offset-4">{PROMPT_USER}</dt>
          {(['Name', 'Role', 'Location'] as const).map((label) => (
            <div key={label}>
              <dt className="inline font-bold text-pine">{label}:</dt> <dd className="inline">{PROFILE[label.toLowerCase() as 'name' | 'role' | 'location']}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Command>
  )
}

const CURL_HEADER = `  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed`

/** Real download stats: the resume is fetched in full, so size, speed and time are measured. */
function Resume({ state }: { state: State<number> }) {
  const fileName = PROFILE.resume.slice(PROFILE.resume.lastIndexOf('/') + 1)
  const path = `./${fileName}`
  return (
    <Section
      cmd={
        <>
          curl -O{' '}
          {state.status === 'error' ? path : <LinkButton href={PROFILE.resume}>{path}</LinkButton>}
        </>
      }
      state={state}
    >
      {(bytes, ms) => <pre className="whitespace-pre-wrap text-subtle">{`${CURL_HEADER}\n${curlProgress(bytes, ms)}`}</pre>}
    </Section>
  )
}

/** One line of `tree` output; long names wrap under the name, not under the branch lines. */
const TreeLine = ({ prefix, children }: { prefix: string; children: ReactNode }) => (
  <p className="flex">
    <span className="shrink-0 whitespace-pre text-subtle">{prefix}</span>
    <span className="min-w-0">{children}</span>
  </p>
)

function SkillsTree({ skills }: { skills: Skill[] }) {
  const files = skills.reduce((sum, skill) => sum + skill.children.length, 0)
  return (
    <>
      <p className="font-bold text-pine">skills/</p>
      {skills.map((parent, i) => {
        const lastParent = i === skills.length - 1
        return (
          <Fragment key={parent.id}>
            <TreeLine prefix={lastParent ? '└── ' : '├── '}>
              <Icon src={parent.icon} />
              <span className="font-bold text-pine">{parent.name}/</span>
            </TreeLine>
            {parent.children.map((child, j) => (
              <TreeLine key={child.id} prefix={`${lastParent ? '    ' : '│   '}${j === parent.children.length - 1 ? '└── ' : '├── '}`}>
                <Icon src={child.icon} />
                {child.name}
              </TreeLine>
            ))}
          </Fragment>
        )
      })}
      <p className="mt-3">
        {count(skills.length, 'directory', 'directories')}, {count(files, 'file')}
      </p>
    </>
  )
}

/** `head` output for several files: a "==> file <==" banner per project, separated by blank lines. */
function ProjectFiles({ projects }: { projects: Project[] }) {
  return (
    <div className="flex flex-col gap-[1lh]">
      {projects.map((project) => (
        <article key={project.id}>
          <p className="text-subtle">
            ==&gt; projects/{slug(project.name)}.md &lt;==
          </p>
          <h2 className="font-bold text-pine"># {project.name}</h2>
          {project.description && <p>{project.description}</p>}
          {project.bulleted_description.length > 0 && (
            <ul>
              {project.bulleted_description.map((bullet, i) => (
                <li key={i} className="pl-[2ch] -indent-[2ch]">
                  <span className="text-subtle">- </span>
                  {bullet}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-[1lh]">
            {project.tech_stack.length > 0 && (
              <p>
                <span className="font-bold text-pine">Tech Stack:</span> {project.tech_stack.join(', ')}
              </p>
            )}
            {project.contacts.length > 0 && (
              <p className="my-1 flex flex-wrap items-center gap-x-[1ch] gap-y-1">
                <span className="font-bold text-pine">Links:</span>
                {project.contacts.map((contact) => (
                  <ContactLink key={contact.id} contact={contact} label={githubPath(contact.link) ?? contact.name} />
                ))}
              </p>
            )}
            <p className="text-subtle">
              {formatRange(project.start_date, project.end_date)}
            </p>
          </div>
        </article>
      ))}
    </div>
  )
}

function GitLog({ jobs }: { jobs: Experience[] }) {
  return (
    <ul>
      {jobs.map((job) => (
        <li key={job.id}>
          <span className="text-gold">{commitHash(job.id)}</span>{' '}
          {job.end_date === null && <span className="font-bold text-love">(HEAD) </span>}
          {job.title} @ {job.name}{' '}
          <span className="text-subtle">
            {formatRange(job.start_date, job.end_date)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// The space between columns plus this margin makes a 1.5ch gap; keeping real spaces lets lines wrap there.
const COLUMN = 'mr-[0.5ch]'

/** `ls -l` lines. Every column before the degree has a fixed width, so plain text lines stay aligned and wrap like a terminal. */
function EducationList({ entries }: { entries: Education[] }) {
  return (
    <>
      <p>total {entries.length}</p>
      <ul>
        {entries.map((entry, i) => (
          <li key={`${entry.school}-${i}`}>
            <span className={`${COLUMN} text-subtle`}>-rw-r--r--</span> <span className={COLUMN}>1</span>{' '}
            <span className={COLUMN}>{PROFILE.name}</span> <span className={COLUMN}>{formatDate(entry.end_date)}</span>{' '}
            {entry.degree} <span className="text-subtle">— {entry.school}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ContactsTable({ contacts }: { contacts: Contact[] }) {
  return (
    <table>
      <thead>
        <tr className="text-left font-normal text-subtle">
          <th className={`${CELL} font-normal`}>State</th>
          <th className={`${CELL} font-normal`}>Address</th>
          <th className="font-normal">Service</th>
        </tr>
      </thead>
      <tbody>
        {contacts.map((contact, i) => (
          <tr key={`${contact.name}-${i}`}>
            <td className={`${CELL} text-foam`}>LISTEN</td>
            <td className={`${CELL} wrap-anywhere`}>
              <ContactLink contact={contact} fullWidth />
            </td>
            <td className="align-top">{contact.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------- page ----------

export default function App() {
  // All requests start in the same commit, so they run in parallel.
  const resume = useApi(fetchResume)
  const skills = useApi(api.skills)
  const projects = useApi(api.projects)
  const experience = useApi(api.experience)
  const education = useApi(api.education)
  const contacts = useApi(api.contacts)

  const states = [resume, skills, projects, experience, education, contacts]
  const settled = states.filter((s) => s.status !== 'loading')
  const booted = settled.length === states.length

  return (
    <div className="flex min-h-screen flex-col gap-5 px-4 py-4 sm:px-8 sm:py-6">
      <h1 className="font-bold">Portfolio 1.0.3</h1>

      <section>
        <p>
          <span className="text-rose">[mlacae]</span> Launching application...
        </p>
        {booted ? (
          <>
            <p>
              <span className="text-rose">[mlacae]</span> {settled.filter((s) => s.status === 'ok').length} connections established.
            </p>
            <p>
              <span className="text-rose">[mlacae]</span> Loading application took {Math.round(Math.max(...settled.map((s) => s.ms)))} ms.
            </p>
          </>
        ) : (
          <Cursor />
        )}
      </section>

      <Neofetch />
      <Resume state={resume} />

      <Command cmd="cat about.txt">
        <p className="whitespace-pre-wrap">{PROFILE.about}</p>
      </Command>

      <Section cmd="tree skills/" state={skills}>
        {(data) => <SkillsTree skills={data} />}
      </Section>

      <Section cmd="head projects/*.md" state={projects}>
        {(data) => <ProjectFiles projects={data} />}
      </Section>

      <Section cmd="git log --oneline career" state={experience}>
        {(data) => <GitLog jobs={data} />}
      </Section>

      <Section cmd="ls -l education/" state={education}>
        {(data) => <EducationList entries={data} />}
      </Section>

      <Section cmd="ss -tl" state={contacts}>
        {(data) => <ContactsTable contacts={data} />}
      </Section>

      <Command cmd="exit">
        <p>Connection closed.</p>
      </Command>
    </div>
  )
}
