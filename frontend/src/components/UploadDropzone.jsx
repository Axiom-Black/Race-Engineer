// ByteCraft Racing — session upload (S5 back half).
// Visual/interaction pattern ported from prototypes/ByteCraft_SessionUpload.jsx:
// a single drag-and-drop target that auto-detects file type by extension,
// three status cards below, and an ingest pipeline indicator
// (pending -> parsing -> complete/failed). Real difference from the
// prototype: this uploads to Supabase and persists, not an in-memory-only
// browser demo.
//
// Atomicity is enforced twice, per the standing bar: client UX here (Upload
// disabled until all three slots are filled) AND the DB constraint in
// lib/sessions.js/the schema — this component is not the security boundary,
// just the UX for it.
import { useRef, useState } from 'react'
import { C, font } from '../theme'
import { Button, Banner } from './ui'
import FaultNotice from './FaultNotice'
import { uploadSession } from '../lib/sessions'

const SLOTS = [
  { key: 'ld', label: '.ld', hint: 'telemetry' },
  { key: 'ldx', label: '.ldx', hint: 'lap summary + setup' },
  { key: 'svm', label: '.svm', hint: 'setup' },
]
const SESSION_TYPES = ['practice', 'qualifying', 'race', 'test']
const PIPELINE_STEPS = ['pending', 'parsing', 'complete']

function extOf(filename) {
  return filename.toLowerCase().split('.').pop()
}

function IngestPipeline({ status }) {
  const idx = status === 'failed' ? 1 : PIPELINE_STEPS.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {PIPELINE_STEPS.map((s, i) => {
        const done = i < idx || status === 'complete'
        const active = i === idx && status !== 'complete'
        const failed = status === 'failed' && i === 1
        const col = failed ? C.danger : done ? C.good : active ? C.pink : C.line
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: col,
                  display: 'inline-block',
                  animation: active ? 'bc-pulse 1.1s infinite' : 'none',
                }}
              />
              <span style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: col }}>
                {failed && i === 1 ? 'FAILED' : s.toUpperCase()}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && <span style={{ width: 22, height: 1, background: C.line }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function UploadDropzone({ onUploaded, onCancel }) {
  const [files, setFiles] = useState({})
  const [sessionType, setSessionType] = useState('practice')
  const [pipeline, setPipeline] = useState('idle') // idle | pending | parsing | complete | failed
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  function handleFiles(fileList) {
    setError('')
    const next = { ...files }
    for (const f of fileList) {
      const ext = extOf(f.name)
      if (ext === 'ld' || ext === 'ldx' || ext === 'svm') next[ext] = f
    }
    setFiles(next)
  }

  const complete = SLOTS.every((s) => files[s.key])
  const busy = pipeline === 'pending' || pipeline === 'parsing'

  async function handleUpload() {
    setPipeline('pending')
    setError('')
    try {
      setPipeline('parsing')
      const sessionId = await uploadSession(files, sessionType)
      setPipeline('complete')
      onUploaded(sessionId)
    } catch (err) {
      setPipeline('failed')
      setError(err)
    }
  }

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: C.panel, padding: 24 }}>
      <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
        Upload a session
      </h2>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 18px' }}>
        All three files, matched to the same session — the atomic set MoTeC exports together.
      </p>

      {typeof error === 'string' ? (
        <Banner kind="error">{error}</Banner>
      ) : (
        <FaultNotice error={error} style={{ marginBottom: 10 }} />
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? C.pink : C.line}`,
          borderRadius: 12,
          background: drag ? C.pinkBg : C.panel2,
          padding: '26px 22px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all .15s',
          marginBottom: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".ld,.ldx,.svm"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 13, color: C.silver2, marginBottom: 4 }}>
          Drop your <b style={{ color: C.pink }}>.ld</b>, <b style={{ color: C.pink }}>.ldx</b> and{' '}
          <b style={{ color: C.pink }}>.svm</b> files here
        </div>
        <div style={{ fontSize: 11, color: C.dim }}>or click to browse · all three required per session</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {SLOTS.map((s) => {
          const f = files[s.key]
          return (
            <div
              key={s.key}
              style={{
                border: `1px solid ${f ? C.pinkBd : C.line}`,
                background: C.panel2,
                borderRadius: 8,
                padding: '11px 13px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: f ? C.pink : C.dim, fontFamily: font.mono }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 13, color: f ? C.good : C.line }}>{f ? '✓' : '○'}</span>
              </div>
              <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>{s.hint}</div>
              <div style={{ fontSize: 9.5, color: f ? C.silver2 : C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f ? `${f.name} · ${(f.size / 1024).toFixed(0)} KB` : 'waiting…'}
              </div>
            </div>
          )
        })}
      </div>

      <label style={{ display: 'block', marginBottom: 18 }}>
        <span style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: C.dim, textTransform: 'uppercase', marginBottom: 6 }}>
          Session type
        </span>
        <select
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value)}
          disabled={busy}
          style={{
            background: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 6,
            padding: '9px 10px',
            color: C.silver3,
            fontFamily: font.ui,
            fontSize: 13,
          }}
        >
          {SESSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </label>

      {pipeline !== 'idle' && (
        <div style={{ marginBottom: 16 }}>
          <IngestPipeline status={pipeline} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <Button onClick={handleUpload} disabled={!complete || busy}>
          {busy ? 'Parsing & uploading…' : 'Upload session'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
