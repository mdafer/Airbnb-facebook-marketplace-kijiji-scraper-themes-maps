const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const https = require('https')
const fs = require('fs')
const path = require('path')

puppeteer.use(StealthPlugin())

// Persistent browser profile. Without this Chromium starts from a blank profile
// every launch, so it never accumulates the cookies / localStorage / device
// history a trusted browser has — which is why Facebook keeps treating it as a
// fresh device. Point it at a stable dir (mount a volume in Docker to persist
// across container recreation).
const USER_DATA_DIR = process.env.PUPPETEER_USER_DATA_DIR || path.resolve(__dirname, '../../.browser-profile')

// Resolve a hostname via Cloudflare DoH and pin it in /etc/hosts
const _resolvedHosts = new Set()
async function resolveHost(hostname) {
	if (_resolvedHosts.has(hostname)) return
	_resolvedHosts.add(hostname)
	return new Promise((resolve) => {
		const req = https.get(
			`https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
			{ headers: { 'Accept': 'application/dns-json' }, timeout: 5000 },
			(res) => {
				let data = ''
				res.on('data', c => data += c)
				res.on('end', () => {
					try {
						const json = JSON.parse(data)
						const ip = json.Answer && json.Answer.find(a => a.type === 1)
						if (ip) {
							fs.appendFileSync('/etc/hosts', `${ip.data} ${hostname}\n`)
						}
					} catch(e) {}
					resolve()
				})
			}
		)
		req.on('error', () => resolve())
		req.on('timeout', () => { req.destroy(); resolve() })
	})
}

/**
 * Resolve multiple hostnames via DoH and pin in /etc/hosts.
 * Call this before navigating to pages that load cross-origin resources.
 */
async function resolveHosts(hostnames) {
	await Promise.all(hostnames.map(h => resolveHost(h)))
}

/**
 * Scan a Puppeteer page for all cross-origin hostnames in iframes/scripts
 * and resolve any unresolved ones via DoH.
 */
async function resolvePageDeps(page) {
	const hosts = await page.evaluate(() => {
		const set = new Set()
		document.querySelectorAll('iframe[src], script[src], link[href]').forEach(el => {
			try { set.add(new URL(el.src || el.href).hostname) } catch(e) {}
		})
		return Array.from(set)
	})
	// Also check iframes' contents
	for (const frame of page.frames()) {
		try {
			const frameHosts = await frame.evaluate(() => {
				const set = new Set()
				document.querySelectorAll('iframe[src], script[src], link[href]').forEach(el => {
					try { set.add(new URL(el.src || el.href).hostname) } catch(e) {}
				})
				return Array.from(set)
			})
			hosts.push(...frameHosts)
		} catch(e) {}
	}
	const newHosts = [...new Set(hosts)].filter(h => !_resolvedHosts.has(h))
	if (newHosts.length > 0) await resolveHosts(newHosts)
	return newHosts
}

let _browser = null

// Chromium writes a SingletonLock (symlink encoding hostname+PID) into the
// profile. With a persistent userDataDir, a container restart gets a new hostname,
// so the leftover lock looks like "another computer" and the launch fails with
// "profile appears to be in use". We only ever launch when no live browser is
// connected, so any lock present here is stale — clear it before launching.
function clearStaleProfileLocks() {
	for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
		try { fs.rmSync(path.join(USER_DATA_DIR, f), { force: true }) } catch(e) {}
	}
}

async function getBrowser() {
	if (!_browser || !_browser.isConnected()) {
		clearStaleProfileLocks()
		_browser = await puppeteer.launch({
			executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
			headless: 'new',
			userDataDir: USER_DATA_DIR,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-blink-features=AutomationControlled',
				'--window-size=1920,1080',
				'--lang=en-CA,en'
			]
		})
	}
	return _browser
}

async function fetchPage(url, opts = {}) {
	const browser = await getBrowser()
	const page = await browser.newPage()
	try {
		await page.setViewport({ width: 1920, height: 1080 })
		await page.evaluateOnNewDocument(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		const response = await page.goto(url, {
			waitUntil: opts.waitUntil || 'domcontentloaded',
			timeout: opts.timeout || 30000
		})
		const html = await page.content()
		return { status: response ? response.status() : 200, html }
	} finally {
		await page.close()
	}
}

/**
 * Long-lived airbnb.com origin page, used so that in-page fetch() requests
 * inherit the browser's cookie jar + session — needed for /api/v3 POSTs
 * (CSRF-without-token, datadome, _aat etc.).
 */
let _airbnbOriginPage = null
let _airbnbOriginNavigating = null
async function getAirbnbOriginPage() {
	if (_airbnbOriginPage && !_airbnbOriginPage.isClosed()) {
		try {
			const url = _airbnbOriginPage.url()
			if (url.startsWith('https://www.airbnb.com')) return _airbnbOriginPage
		} catch(e) {}
	}
	if (_airbnbOriginNavigating) return _airbnbOriginNavigating
	_airbnbOriginNavigating = (async () => {
		const browser = await getBrowser()
		const page = await browser.newPage()
		await page.setViewport({ width: 1600, height: 1000 })
		await page.evaluateOnNewDocument(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		// Visit a real search URL so the page picks up search-session cookies
		// (some downstream APIs validate these — bare /homepage isn't enough).
		await page.goto('https://www.airbnb.com/s/homes', { waitUntil: 'domcontentloaded', timeout: 30000 })
		await new Promise(r => setTimeout(r, 1500))
		_airbnbOriginPage = page
		return page
	})()
	try { return await _airbnbOriginNavigating } finally { _airbnbOriginNavigating = null }
}

/**
 * POST JSON to an Airbnb API endpoint via the origin page's fetch().
 * Returns { status, body } where body is parsed JSON (or the raw text on parse failure).
 */
async function fetchJson(url, { method='GET', headers={}, body=null } = {}) {
	const page = await getAirbnbOriginPage()
	return await page.evaluate(async (u, m, h, b) => {
		const resp = await fetch(u, {
			method: m,
			headers: h,
			body: b,
			credentials: 'include',
			mode: 'cors'
		})
		const text = await resp.text()
		let parsed
		try { parsed = JSON.parse(text) } catch(e) { parsed = text }
		return { status: resp.status, body: parsed }
	}, url, method, headers, body)
}

async function seedCookies(cookieString, domain) {
	const browser = await getBrowser()
	const page = await browser.newPage()
	try {
		const cookies = cookieString.split(';').map(c => {
			const [name, ...rest] = c.trim().split('=')
			return name ? { name: name.trim(), value: rest.join('=').trim(), domain } : null
		}).filter(Boolean)
		if (cookies.length) await page.setCookie(...cookies)
	} finally {
		await page.close()
	}
}

module.exports = { getBrowser, fetchPage, fetchJson, getAirbnbOriginPage, seedCookies, resolveHosts, resolvePageDeps }
