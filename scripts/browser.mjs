import { existsSync } from 'node:fs'

const candidates = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export const browserPath = candidates.find((path) => path && existsSync(path))
if (!browserPath) throw new Error('Navigateur Chrome/Edge introuvable : définissez CHROME_PATH')
