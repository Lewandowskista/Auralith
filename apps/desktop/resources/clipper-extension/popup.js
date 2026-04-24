const ENDPOINT = 'auralith://localhost/clip'

async function extractPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      url: location.href,
      title: document.title,
      text: document.body?.innerText ?? '',
      selection: window.getSelection()?.toString() ?? '',
      html: document.documentElement?.innerHTML ?? '',
    }),
  })
  return result.result
}

async function sendClip(payload) {
  await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, clippedAt: Date.now() }),
  })
}

function setStatus(msg, kind = '') {
  const el = document.getElementById('status')
  el.textContent = msg
  el.className = kind
}

document.getElementById('clip-page').addEventListener('click', async () => {
  try {
    setStatus('Clipping...')
    const payload = await extractPage()
    await sendClip(payload)
    setStatus('Clipped!', 'ok')
    setTimeout(() => window.close(), 800)
  } catch (e) {
    setStatus('Failed: ' + (e?.message ?? 'unknown error'), 'err')
  }
})

document.getElementById('clip-selection').addEventListener('click', async () => {
  try {
    const payload = await extractPage()
    if (!payload.selection) {
      setStatus('No text selected', 'err')
      return
    }
    setStatus('Clipping selection...')
    await sendClip({ ...payload, html: '' })
    setStatus('Selection clipped!', 'ok')
    setTimeout(() => window.close(), 800)
  } catch (e) {
    setStatus('Failed: ' + (e?.message ?? 'unknown error'), 'err')
  }
})
