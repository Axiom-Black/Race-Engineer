// ByteCraft Racing — session upload (S5 back half).
// Enforces the atomicity standing bar client-side: the Upload button stays
// disabled until all three files are present, and the file inputs are typed
// by extension so a driver can't accidentally submit two .ld files. The real
// atomicity guarantee is the DB constraint (lib/sessions.js); this is UX.
import { useRef, useState } from 'react'
import { C, font } from '../theme'
import { Button, Banner } from './ui'
import { uploadSession } from '../lib/sessions'

const SLOTS = [
  { key: 'ld', label: '.ld', hint: 'telemetry', accept: '.ld' },
  { key: 'ldx', label: '.ldx', hint: 'lap summary + setup', accept: '.ldx' },
  { key: 'svm', label: '.svm', hint: 'setup', accept: '.svm' },
]

const SESSION_TYPES = ['practice', 'qualifying', 'race', 'test']

function FileSlot({ slot, file, onPick }) {
  const inputRef = useRef(null)
  const filled = Boolean(file)
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const dropped = e.dataTransfer.files?.[0]
        if (dropped) onPick(slot.key, dropped)
      }}
      style={{
        flex: 1,
        border: `1px dashed ${filled ? C.pinkBd : C.line}`,
        background: filled ? C.pinkBg : C.panel2,
        borderRadius: 8,
        padding: '16px 12px',
        textAlign: 'center',
        cursor: 'pointer',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={slot.accept}
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onPick(slot.key, e.target.files[0])}
      />
      <div style={{ color: filled ? C.pink : C.silver2, fontWeight: 700, fontFamily: font.mono, fontSize: 13 }}>
        {slot.label}
      </div>
      <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>{slot.hint}</div>
      <div style={{ color: filled ? C.silver3 : C.dim, fontSize: 11, marginTop: 8, wordBreak: 'break-all' }}>
        {filled ? file.name : 'drop or click'}
      </div>
    </div>
  )
}

export default function UploadDropzone({ onUploaded, onCancel }) {
  const [files, setFiles] = useState({})
  const [sessionType, setSessionType] = useState('practice')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function pick(key, file) {
    setError('')
    setFiles((f) => ({ ...f, [key]: file }))
  }

  const complete = SLOTS.every((s) => files[s.key])

  async function handleUpload() {
    setBusy(true)
    setError('')
    try {
      const sessionId = await uploadSession(files, sessionType)
      onUploaded(sessionId)
    } catch (err) {
      setError(err?.message || 'Upload failed. Try again.')
    } finally {
      setBusy(false)
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

      <Banner kind="error">{error}</Banner>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {SLOTS.map((s) => (
          <FileSlot key={s.key} slot={s} file={files[s.key]} onPick={pick} />
        ))}
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
