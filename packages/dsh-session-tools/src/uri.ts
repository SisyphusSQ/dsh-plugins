/** Browser-safe mention encoding that matches `@deepseek-ai/dsh-session-reference`. */
export const SESSION_REFERENCE_SCHEME = 'dsh-session:'

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url')
  }
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function escapeLabel(label: string): string {
  return label.replace(/[\\\]]/gu, (match) => `\\${match}`)
}

/** Encode any session-id string as a canonical lossless `dsh-session:` URI. */
export function encodeSessionReferenceUri(sessionId: string): string {
  return `${SESSION_REFERENCE_SCHEME}${utf8ToBase64Url(JSON.stringify(sessionId))}`
}

/** Render a host-neutral Markdown mention carrying the canonical URI. */
export function formatSessionReferenceMention(reference: {
  readonly sessionId: string
  readonly label?: string
}): string {
  return `@[${escapeLabel(reference.label ?? reference.sessionId)}](${encodeSessionReferenceUri(reference.sessionId)})`
}
