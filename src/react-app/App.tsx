import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { api, r2Url, type Education, type Experience, type Project, type Skill } from './api'
import { PROFILE } from './profile'

const PROMPT_USER = 'user@mlacae'
const CELL = 'pr-[2ch] align-top'

// ---------- helpers ----------

const formatDate = (date: string | null) => (date ? date.slice(0, 7) : 'present')

/** "2024-03-15" -> "03/2024" */
const formatMonthYear = (date: string | null) => (date ? `${date.slice(5, 7)}/${date.slice(0, 4)}` : 'present')

/** "Resume App!" -> "resume-app" */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Deterministic 7-char hex "commit hash" (FNV-1a) derived from a record id. */
function commitHash(id: number) {
  let hash = 0x811c9dc5
  for (const char of `career:${id}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 7)
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

// ---------- building blocks ----------

function Cursor() {
  return <span role="status" aria-label="Loading" className="inline-block h-[1.1em] w-[0.6em] animate-blink bg-fg align-text-bottom motion-reduce:animate-none" />
}

/** Hidden when the key is null or the image fails to load. */
function R2Image({ src, className, alt = '' }: { src: string | null; className: string; alt?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return <img src={r2Url(src)} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
}

const Icon = ({ src }: { src: string | null }) => (
  <R2Image src={src} className="mr-[0.5ch] inline-block size-4 object-contain align-text-bottom" />
)

/** Wide output scrolls inside its section, never the page. */
const Scroll = ({ children }: { children: ReactNode }) => <div className="overflow-x-auto">{children}</div>

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

/** A command whose output comes from an API route. */
function Section<T>({ cmd, state, children }: { cmd: string; state: State<T>; children: (data: T) => ReactNode }) {
  return (
    <Command cmd={cmd}>
      {state.status === 'loading' && <Cursor />}
      {state.status === 'error' && <p className="text-love">{state.error}</p>}
      {state.status === 'ok' && children(state.data)}
    </Command>
  )
}

// ---------- sections ----------

function Neofetch() {
  return (
    <Command cmd="neofetch">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-2">
        {PROFILE.headshot ? (
          <R2Image src={PROFILE.headshot} alt={PROFILE.name} className="size-28 shrink-0 rounded-full object-cover sm:size-32" />
        ) : (
          <div aria-hidden className="grid size-28 shrink-0 place-items-center rounded-full bg-overlay text-4xl text-muted sm:size-32">
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

// Decorative curl progress table; the numbers are not measured.
const CURL_PROGRESS = `  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  128k  100  128k    0     0   512k      0 --:--:-- --:--:-- --:--:--  514k`

function Resume() {
  const fileName = PROFILE.resume.split('/').pop()
  return (
    <Command
      cmd={
        <a href={r2Url(PROFILE.resume)} download={fileName} className="underline decoration-muted underline-offset-4 hover:text-pine">
          curl -O .../{fileName}
        </a>
      }
    >
      <Scroll>
        <pre className="w-max text-subtle">{CURL_PROGRESS}</pre>
      </Scroll>
    </Command>
  )
}

function SkillsTree({ skills }: { skills: Skill[] }) {
  const files = skills.reduce((sum, skill) => sum + skill.children.length, 0)
  return (
    <>
      <Scroll>
        <div className="w-max whitespace-pre">
          <p className="font-bold text-pine">skills/</p>
          {skills.map((parent, i) => {
            const lastParent = i === skills.length - 1
            return (
              <Fragment key={parent.id}>
                <p>
                  <span className="text-subtle">{lastParent ? '└── ' : '├── '}</span>
                  <Icon src={parent.icon} />
                  <span className="font-bold text-pine">{parent.name}/</span>
                </p>
                {parent.children.map((child, j) => (
                  <p key={child.id}>
                    <span className="text-subtle">
                      {lastParent ? '    ' : '│   '}
                      {j === parent.children.length - 1 ? '└── ' : '├── '}
                    </span>
                    <Icon src={child.icon} />
                    {child.name}
                  </p>
                ))}
              </Fragment>
            )
          })}
        </div>
      </Scroll>
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
          {!!project.bulleted_description?.length && (
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
            {project.skills.length > 0 && (
              <p>
                <span className="font-bold text-pine">Tech Stack:</span> {project.skills.map((skill) => skill.name).join(', ')}
              </p>
            )}
            <p className="text-subtle">
              {formatMonthYear(project.start_date)} - {formatMonthYear(project.end_date)}
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
          <Icon src={job.icon} />
          {job.title} @ {job.name}{' '}
          <span className="text-subtle">
            {formatDate(job.start_date)}–{formatDate(job.end_date)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function EducationTable({ entries }: { entries: Education[] }) {
  return (
    <>
      <p>total {entries.length}</p>
      <Scroll>
        <table className="whitespace-nowrap">
          <tbody>
            {entries.map((entry, i) => (
              <tr key={`${entry.school}-${i}`}>
                <td className={`${CELL} text-subtle`}>-rw-r--r--</td>
                <td className={CELL}>1</td>
                <td className={CELL}>{PROFILE.name}</td>
                <td className={CELL}>{formatDate(entry.end_date)}</td>
                <td className="align-top">
                  <Icon src={entry.image} />
                  {entry.degree} <span className="text-subtle">— {entry.school}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
    </>
  )
}

// ---------- page ----------

export default function App() {
  // All requests start in the same commit, so they run in parallel.
  const skills = useApi(api.skills)
  const projects = useApi(api.projects)
  const experience = useApi(api.experience)
  const education = useApi(api.education)
  const contacts = useApi(api.contacts)

  const states = [skills, projects, experience, education, contacts]
  const settled = states.filter((s) => s.status !== 'loading')
  const booted = settled.length === states.length

  return (
    <div className="flex min-h-screen flex-col gap-5 px-4 py-4 sm:px-8 sm:py-6">
      <h1 className="font-bold">Portfolio 1.0.0</h1>

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
      <Resume />

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
        {(data) => <EducationTable entries={data} />}
      </Section>

      <Section cmd="ss -tl" state={contacts}>
        {(data) => (
          <Scroll>
            <table className="whitespace-nowrap">
              <thead>
                <tr className="text-left font-normal text-subtle">
                  <th className={`${CELL} font-normal`}>State</th>
                  <th className={`${CELL} font-normal`}>Address</th>
                  <th className="font-normal">Service</th>
                </tr>
              </thead>
              <tbody>
                {data.map((contact, i) => (
                  <tr key={`${contact.name}-${i}`}>
                    <td className={`${CELL} text-foam`}>LISTEN</td>
                    <td className={CELL}>
                      {contact.link ? (
                        <a href={contact.link} target="_blank" rel="noreferrer" className="text-pine hover:underline">
                          {contact.value}
                        </a>
                      ) : (
                        contact.value
                      )}
                    </td>
                    <td className="align-top">{contact.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        )}
      </Section>

      <Command cmd="exit">
        <p>Connection closed.</p>
      </Command>
    </div>
  )
}
