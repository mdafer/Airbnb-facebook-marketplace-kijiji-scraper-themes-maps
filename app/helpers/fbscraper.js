const Helpers = require('../helpers/includes'),
	eachOfLimit = require('async/eachOfLimit'),
	axios = require('axios'),
	{ seedCookies, getBrowser, resolvePageDeps } = require('../helpers/browser'),
	{ decryptField, encryptField } = require('../controllers/users')

// Simple in-memory geocode cache to avoid repeated Nominatim calls
const geocodeCache = new Map()

// Diagnostics: cap how many raw listing HTML dumps FB_DEBUG_DUMP writes per
// process so a large search can't fill the disk with multi-MB files.
let _debugDumpsLeft = Number(process.env.FB_DEBUG_DUMP) || 0

async function geocodeLocation(locationText) {
	if (!locationText) return { lat: 0, lon: 0 }
	const cacheKey = locationText.toLowerCase().trim()
	if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)

	try {
		const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
			params: { q: locationText, format: 'json', limit: 1 },
			headers: { 'User-Agent': 'KijijiMaps/1.0' },
			timeout: 10000
		})
		if (resp.data && resp.data.length > 0) {
			const result = { lat: parseFloat(resp.data[0].lat) || 0, lon: parseFloat(resp.data[0].lon) || 0 }
			geocodeCache.set(cacheKey, result)
			return result
		}
	} catch(e) {}
	const empty = { lat: 0, lon: 0 }
	geocodeCache.set(cacheKey, empty)
	return empty
}

const requestDelay = () => Number(process.env.FB_REQUEST_DELAY_MS) || 3000
const detailDelay = () => Number(process.env.FB_DETAIL_DELAY_MS) || 1500
const requestErrorDelay = () => Number(process.env.FB_ERROR_DELAY_MS) || 60000
const scrollPauseMs = () => Number(process.env.FB_SCROLL_PAUSE_MS) || 2000

function jitteredDelay(base) {
	const jitter = base * 0.25
	return Math.round(base + (Math.random() * jitter * 2 - jitter))
}

function humanDelay() {
	const base = requestDelay()
	if (Math.random() < 0.2) return Math.round(base * (2 + Math.random() * 2))
	return Math.round(base * (0.5 + Math.random()))
}

/**
 * Save browser cookies to the user record for reuse across sessions.
 */
async function saveFbCookies(page, db, userId) {
	if (!db || !userId) return
	try {
		const cookies = await page.cookies()
		const cookieStr = cookies
			.filter(c => c.domain.includes('facebook.com') || c.domain.includes('fbsbx.com'))
			.map(c => c.name + '=' + c.value)
			.join('; ')
		if (cookieStr) {
			await db.get('users').update({ _id: userId }, { $set: { fbCookiesEnc: encryptField(cookieStr), fbCookiesDate: new Date() } })
		}
	} catch(e) {}
}

/**
 * Try to restore saved cookies and check if they're still valid.
 * Returns true if session is still active.
 */
async function restoreFbCookies(page, db, userId, jobId) {
	if (!db || !userId) return false
	try {
		const user = await db.get('users').findOne({ _id: userId })
		if (!user || !user.fbCookiesEnc) return false

		// Check cookie age — expire after 30 days
		if (user.fbCookiesDate) {
			const age = Date.now() - new Date(user.fbCookiesDate).getTime()
			if (age > 30 * 24 * 60 * 60 * 1000) {
				Helpers.logger.log({ print: 'Saved Facebook cookies expired (>30 days)', channels: jobId + 'jobUpdate' })
				return false
			}
		}

		const cookieStr = decryptField(user.fbCookiesEnc)
		if (!cookieStr) return false

		Helpers.logger.log({ print: 'Restoring saved Facebook session...', channels: jobId + 'jobUpdate' })
		await seedCookies(cookieStr, '.facebook.com')

		// Authoritative check — confirm Marketplace actually renders (not walled).
		// A stale c_user can survive while the session is dead, so the old
		// cookie/link check gave false "restored" positives.
		if (await verifyMarketplaceAuth(page)) {
			Helpers.logger.log({ print: 'Facebook session restored from saved cookies', channels: jobId + 'jobUpdate' })
			return true
		}
		Helpers.logger.log({ print: 'Saved Facebook cookies no longer valid', channels: jobId + 'jobUpdate' })
		return false
	} catch(e) {
		return false
	}
}

/**
 * Authoritative auth check: load Marketplace and confirm it isn't walled.
 * A lingering c_user cookie can survive a failed login, so the only reliable
 * signal is whether Marketplace actually renders for a logged-in user.
 */
async function verifyMarketplaceAuth(page) {
	try {
		await page.goto('https://www.facebook.com/marketplace/', { waitUntil: 'domcontentloaded', timeout: 30000 })
		await new Promise(r => setTimeout(r, 3000))
		return await page.evaluate(() => {
			if (!document.cookie.includes('c_user')) return false
			// Only treat it as a guest if an actual login form is VISIBLE. Scanning
			// dialog text for "log in"/"sign up" false-negatives on real sessions —
			// logged-in pages contain that chrome text in hidden nodes.
			const pw = document.querySelector('input[type="password"], input[name="pass"]')
			if (pw) {
				const r = pw.getBoundingClientRect()
				if (r.width > 0 && r.height > 0) return false
			}
			return true
		})
	} catch(e) { return false }
}

/**
 * Log into Facebook using Puppeteer with email/password.
 * Returns true if login succeeded, false otherwise.
 */
async function loginWithCredentials(page, email, password, jobId, db, userId) {
	try {
		Helpers.logger.log({ print: 'Logging into Facebook...', channels: jobId + 'jobUpdate' })
		// Clear only the SESSION cookies (a stale c_user/xs from a failed attempt
		// could otherwise fool the post-login check). Crucially keep datr/sb — those
		// are Facebook's device-trust cookies behind "remember browser"; wiping them
		// makes every login look like a brand-new device and re-triggers the
		// checkpoint/CAPTCHA every single time.
		try {
			const existing = await page.cookies('https://www.facebook.com', 'https://www.facebook.com/')
			const sessionCookies = existing.filter(c => /^(c_user|xs|checkpoint|sfau|presence)$/.test(c.name))
			if (sessionCookies.length) await page.deleteCookie(...sessionCookies)
		} catch(e) {}
		await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
		await new Promise(r => setTimeout(r, 3000))

		// Accept cookie consent if present
		try {
			const cookieBtn = await page.$('[data-cookiebanner="accept_button"], [data-testid="cookie-policy-manage-dialog-accept-button"]')
			if (cookieBtn) { await cookieBtn.click(); await new Promise(r => setTimeout(r, 1000)) }
		} catch(e) {}

		// Fill in credentials — try multiple selectors for resilience
		const emailSelector = await page.waitForSelector('#email, input[name="email"], input[type="email"]', { timeout: 15000 })
		await emailSelector.type(email, { delay: 50 + Math.random() * 80 })
		await new Promise(r => setTimeout(r, 300 + Math.random() * 500))
		const passField = await page.$('#pass, input[name="pass"], input[type="password"]')
		await passField.type(password, { delay: 50 + Math.random() * 80 })
		await new Promise(r => setTimeout(r, 300 + Math.random() * 500))
		// Submit login — try clicking a button, fall back to pressing Enter
		const loginBtn = await page.$('[name="login"], #loginbutton, button[type="submit"], [data-testid="royal_login_button"], button[id="loginbutton"]')
		if (loginBtn) {
			await loginBtn.click()
		} else {
			await passField.press('Enter')
		}
		await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
		await new Promise(r => setTimeout(r, 3000))

		// Capture the page text up front: the CAPTCHA/2FA recovery below needs it,
		// and we must read it before verifyMarketplaceAuth navigates away.
		const pageText = await page.evaluate(() => document.body.innerText)
		const needsChallenge = /arkose|matchkey|funcaptcha|two-factor|code.*sent|enter.*code|verification code|approvals_code/i.test(pageText)
		const hasSession = await page.evaluate(() => document.cookie.includes('c_user'))

		// Only declare success when there's a session, no pending challenge, AND
		// Marketplace actually renders — a bare c_user can be a stale/limited session
		// that still gets walled. Skip the check when a challenge is pending so we
		// don't navigate away from the checkpoint page the recovery blocks need.
		if (hasSession && !needsChallenge && await verifyMarketplaceAuth(page)) {
			Helpers.logger.log({ print: 'Facebook login successful', channels: jobId + 'jobUpdate' })
			await saveFbCookies(page, db, userId)
			return true
		}

		// Arkose Labs CAPTCHA — stream screenshots to frontend so user can solve it
		if (/arkose|matchkey|funcaptcha/i.test(pageText)) {
			// Dynamically resolve any DNS dependencies the CAPTCHA page needs, then reload
			for (let attempt = 0; attempt < 3; attempt++) {
				const newHosts = await resolvePageDeps(page)
				if (newHosts.length === 0) break
				Helpers.logger.log({ print: 'Resolved DNS for: ' + newHosts.join(', '), channels: jobId + 'jobUpdate' })
				await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
				await new Promise(r => setTimeout(r, 3000))
			}

			Helpers.logger.log({ print: 'Facebook CAPTCHA detected — solve it in the info panel below', channels: jobId + 'jobUpdate' })

			const requestId = Math.random().toString(36).slice(2)
			Helpers.captchaSessions.set(requestId, { page })
			Helpers.io.emit('needCaptcha', { requestId, jobId })

			try {
				const solved = await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						Helpers.pendingManualResponses.delete(requestId)
						reject(new Error('CAPTCHA timeout (5 min)'))
					}, 300000)
					Helpers.pendingManualResponses.set(requestId, {
						resolve: (val) => { clearTimeout(timeout); resolve(val) },
						reject: (err) => { clearTimeout(timeout); reject(err) }
					})

					// Stream screenshots to the frontend
					const sendFrame = async () => {
						try {
							const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 70 })
							Helpers.io.emit('captchaFrame', { requestId, image: screenshot })
						} catch(e) {}
					}
					sendFrame() // send first frame immediately
					const frameInterval = setInterval(sendFrame, 600)

					// Also store interval so we can clean up
					Helpers.captchaSessions.get(requestId).frameInterval = frameInterval
				})

				if (solved === 'skip') {
					Helpers.logger.log({ print: 'CAPTCHA skipped by user', channels: jobId + 'jobWarning' })
					return false
				}

				// User signaled done — they may still be finishing sign-in manually
				// in the remote view, or Facebook may show a "Remember browser /
				// Continue" interstitial. Poll for a real session (the c_user cookie)
				// instead of checking just once, and clear those prompts as they
				// appear, before concluding login failed.
				await new Promise(r => setTimeout(r, 2000))
				Helpers.logger.log({ print: 'CAPTCHA submitted — waiting for login to complete...', channels: jobId + 'jobUpdate' })
				let loggedIn = false
				for (let attempt = 0; attempt < 20; attempt++) {
					loggedIn = await page.evaluate(() => document.cookie.includes('c_user'))
					if (loggedIn) break
					try {
						const clicked = await page.evaluate(() => {
							const wanted = ['continue', 'ok', 'not now', 'this was me', 'remember', 'save']
							const btns = Array.from(document.querySelectorAll('[role="button"], button, a[role="link"], input[type="submit"]'))
							for (const b of btns) {
								const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim().toLowerCase()
								if (t && wanted.some(w => t === w || t.startsWith(w + ' '))) { b.click(); return t }
							}
							return ''
						})
						if (clicked) Helpers.logger.log({ print: 'Dismissed post-login prompt: "' + clicked + '"', channels: jobId + 'jobUpdate' })
					} catch(e) {}
					await new Promise(r => setTimeout(r, 3000))
				}
				if (loggedIn) {
					// c_user alone can be stale — confirm Marketplace really loads.
					if (await verifyMarketplaceAuth(page)) {
						Helpers.logger.log({ print: 'Facebook login successful after CAPTCHA', channels: jobId + 'jobUpdate' })
						await saveFbCookies(page, db, userId)
						return true
					}
					Helpers.logger.log({ print: 'A session cookie was set but Marketplace is still walled — login did not fully complete (likely a checkpoint/2FA step). Re-run, or use FB_COOKIES from a browser where you are already logged in.', channels: jobId + 'jobWarning' })
					return false
				}
				// Still not logged in — fall through to the 2FA check below.
				Helpers.logger.log({ print: 'No active session detected after CAPTCHA — checking for a verification step...', channels: jobId + 'jobWarning' })
			} catch(e) {
				Helpers.logger.log({ print: 'CAPTCHA error: ' + e.message, channels: jobId + 'jobWarning' })
				return false
			} finally {
				const session = Helpers.captchaSessions.get(requestId)
				if (session && session.frameInterval) clearInterval(session.frameInterval)
				Helpers.captchaSessions.delete(requestId)
			}
		}

		if (/two-factor|code.*sent|enter.*code|verification code|approvals_code/i.test(pageText)) {
			Helpers.logger.log({ print: 'Facebook requires a verification code', channels: jobId + 'jobUpdate' })

			// Ask frontend for the 2FA code
			const requestId = Math.random().toString(36).slice(2)
			try {
				const code = await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						Helpers.pendingManualResponses.delete(requestId)
						reject(new Error('2FA code timeout (3 min)'))
					}, 180000)
					Helpers.pendingManualResponses.set(requestId, {
						resolve: (val) => { clearTimeout(timeout); resolve(val) },
						reject: (err) => { clearTimeout(timeout); reject(err) }
					})
					Helpers.io.emit('needFb2FA', { requestId, jobId })
				})

				if (!code || code === 'skip') {
					Helpers.logger.log({ print: '2FA skipped by user', channels: jobId + 'jobWarning' })
					return false
				}

				// Try to find the code input — wait for it to appear
				let codeInput = null
				try {
					codeInput = await page.waitForSelector(
						'input[name="approvals_code"], input[id="approvals_code"], ' +
						'input[autocomplete="one-time-code"], input[inputmode="numeric"], ' +
						'input[aria-label*="code" i], input[aria-label*="Code" i], ' +
						'input[placeholder*="code" i], input[placeholder*="Code" i]',
						{ timeout: 5000 }
					)
				} catch(e) {
					// Fallback: pick the first visible text/tel/number input that isn't email/password
					codeInput = await page.evaluateHandle(() => {
						const inputs = Array.from(document.querySelectorAll('input'))
						return inputs.find(i =>
							['text', 'tel', 'number', ''].includes(i.type) &&
							i.offsetParent !== null &&
							i.name !== 'email' && i.name !== 'pass'
						) || null
					})
					// evaluateHandle returns a JSHandle; unwrap to null if no element
					const isNull = await codeInput.evaluate(el => el === null).catch(() => true)
					if (isNull) codeInput = null
				}

				if (codeInput) {
					Helpers.logger.log({ print: 'Found 2FA input — entering code...', channels: jobId + 'jobUpdate' })
					await codeInput.click({ clickCount: 3 }) // select any existing text
					await codeInput.type(code.trim(), { delay: 50 + Math.random() * 80 })
					await new Promise(r => setTimeout(r, 500))
					// Submit the code — try button first, then Enter
					const submitBtn = await page.$('button[type="submit"], #checkpointSubmitButton, [name="submit[Continue]"], button[id*="submit"], div[role="button"][tabindex="0"]')
					if (submitBtn) {
						await submitBtn.click()
					} else {
						await codeInput.press('Enter')
					}
					await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
					await new Promise(r => setTimeout(r, 3000))

					// Check login success — loop through possible follow-up screens (device approval, etc.)
					for (let step = 0; step < 3; step++) {
						const loggedIn = await page.evaluate(() => {
							return !!document.querySelector('[aria-label="Facebook"], [aria-label="Your profile"]')
								|| document.cookie.includes('c_user')
								|| !!document.querySelector('a[href*="/marketplace"]')
						})
						if (loggedIn) {
							Helpers.logger.log({ print: 'Facebook login successful after 2FA', channels: jobId + 'jobUpdate' })
							await saveFbCookies(page, db, userId)
							return true
						}
						// Try clicking any "Continue" / "This was me" type buttons
						const nextBtn = await page.$('button[type="submit"], [name="submit[Continue]"], [name="submit[This was me]"], div[role="button"][tabindex="0"]')
						if (nextBtn) {
							Helpers.logger.log({ print: '2FA follow-up step ' + (step + 1) + ' — clicking continue...', channels: jobId + 'jobUpdate' })
							await nextBtn.click()
							await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
							await new Promise(r => setTimeout(r, 2000))
						} else {
							break
						}
					}

					const finalCheck = await page.evaluate(() => {
						return document.cookie.includes('c_user') || !!document.querySelector('a[href*="/marketplace"]')
					})
					if (finalCheck) {
						Helpers.logger.log({ print: 'Facebook login successful after 2FA', channels: jobId + 'jobUpdate' })
						return true
					}
				} else {
					Helpers.logger.log({ print: '2FA: could not find code input field on page', channels: jobId + 'jobWarning' })
				}
				Helpers.logger.log({ print: '2FA verification may have failed — continuing anyway', channels: jobId + 'jobWarning' })
				return false
			} catch(e) {
				Helpers.logger.log({ print: '2FA prompt error: ' + e.message, channels: jobId + 'jobWarning' })
				return false
			}
		}

		Helpers.logger.log({ print: 'Facebook login may have failed — continuing anyway', channels: jobId + 'jobWarning' })
		return false
	} catch(e) {
		Helpers.logger.log({ print: 'Facebook login error: ' + e.message, channels: jobId + 'jobWarning' })
		return false
	}
}

/**
 * Stream JPEG frames of the scrape page to the frontend so the run can be
 * watched live (like the CAPTCHA view). Returns a stop function. Disable with
 * FB_LIVE_VIEW=false; tune cadence with FB_LIVE_VIEW_MS.
 */
function startPageStream(page, jobId) {
	if (String(process.env.FB_LIVE_VIEW || 'true').toLowerCase() === 'false') return () => {}
	if (!Helpers.io || !jobId) return () => {}
	let active = true, busy = false
	const tick = async () => {
		if (!active || busy) return
		busy = true
		try {
			const image = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 50 })
			if (active && Helpers.io) Helpers.io.emit('scrapeFrame', { jobId, image })
		} catch(e) {} finally { busy = false }
	}
	const interval = setInterval(tick, Number(process.env.FB_LIVE_VIEW_MS) || 1200)
	const stop = () => {
		if (!active) return
		active = false
		clearInterval(interval)
		if (Helpers.scrapeStreams) Helpers.scrapeStreams.delete(jobId)
		if (Helpers.io) Helpers.io.emit('scrapeStreamEnd', { jobId })
	}
	if (Helpers.scrapeStreams) Helpers.scrapeStreams.set(jobId, stop)
	tick()
	return stop
}

/**
 * Scroll the page to trigger lazy-loaded listings, harvesting cards as they
 * render (the list is virtualized). Returns { listings, guestCapped } where
 * guestCapped is true when a login wall froze us at the ~34-listing guest cap.
 */
async function scrollAndCollect(page, jobId, maxScrolls = Number(process.env.FB_MAX_SCROLLS) || 120) {
	const collected = new Map()
	let stableRounds = 0
	let previousHeight = 0
	let sawLoginWall = false
	let reachedEnd = false
	for (let i = 0; i < maxScrolls; i++) {
		// Facebook virtualizes the results list — cards scrolled out of view are
		// removed from the DOM. Harvest whatever is currently rendered every step
		// and accumulate by id, so recycled items aren't lost. (Reading the count
		// only at the end can never see more than one window's worth.)
		const batch = await extractListingsFromPage(page)
		const before = collected.size
		for (const l of batch) if (l.id && !collected.has(l.id)) collected.set(l.id, l)

		const m = await page.evaluate(() => {
			const doc = document.scrollingElement || document.documentElement
			// Detect the GUEST WALL by its freeze signature, measured BEFORE we try
			// to undo it: a login dialog (or visible password field) present while the
			// page has collapsed to ~viewport height (Facebook sets body overflow
			// hidden, freezing the feed). A logged-in session with a genuinely small
			// result set stays tall and scrollable, so it won't match — that prevents
			// us from discarding a legitimately short result list.
			// The real guest wall is a LARGE, visible login dialog covering the
			// viewport (or a visible password field). Don't use window height as the
			// freeze signal — in Facebook's map layout the window is always ~viewport
			// height (the listings panel scrolls, not the window), so that would
			// false-positive on a healthy logged-in session.
			let wallDialog = false
			document.querySelectorAll('[role="dialog"]').forEach(d => {
				const txt = (d.textContent || '').toLowerCase()
				if (!/log\s*in|sign\s*up|entrar|cadastr/.test(txt)) return
				const r = d.getBoundingClientRect()
				if (r.width > window.innerWidth * 0.4 && r.height > window.innerHeight * 0.4) wallDialog = true
			})
			const pwEl = document.querySelector('input[type="password"], input[name="pass"]')
			const pwRect = pwEl ? pwEl.getBoundingClientRect() : null
			const visiblePwd = !!(pwRect && pwRect.width > 0 && pwRect.height > 0)
			const loginWall = visiblePwd || wallDialog

			// Now try to recover: close any dialog and undo the scroll-lock so lazy
			// loading can continue.
			document.querySelectorAll('[role="dialog"]').forEach(d => {
				const close = d.querySelector('[aria-label="Close"], [aria-label="Fechar"]')
				if (close) close.click()
			})
			for (const el of [document.documentElement, document.body]) {
				el.style.overflow = ''
				el.style.position = ''
				el.style.height = ''
			}

			const items = document.querySelectorAll('a[href*="/marketplace/item/"]')
			const last = items[items.length - 1]

			// Find the scroll container that actually holds the listing cards.
			// Facebook's map layout puts the results in a right-hand panel with its
			// OWN scroll — the centre is a map. Scrolling the window/map does nothing;
			// we must scroll this specific panel. Walk up from a card to the nearest
			// scrollable ancestor.
			let listEl = null
			const firstCard = items[0]
			if (firstCard) {
				let el = firstCard.parentElement
				while (el && el !== document.body) {
					const oy = getComputedStyle(el).overflowY
					if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 50) { listEl = el; break }
					el = el.parentElement
				}
			}

			let listRect = null
			let listScrollHeight = 0
			if (listEl) {
				listEl.scrollTop += Math.round(listEl.clientHeight * 0.85)
				listScrollHeight = listEl.scrollHeight
				const r = listEl.getBoundingClientRect()
				listRect = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height - 20, r.height * 0.6)) }
			}
			// Also nudge the last card into view (works whether the panel or the
			// window scrolls), and push any other scroll containers a little.
			if (last) last.scrollIntoView({ block: 'end' })
			let scrollers = 0
			document.querySelectorAll('div').forEach(el => {
				const oy = getComputedStyle(el).overflowY
				if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
					el.scrollTop += Math.round(el.clientHeight * 0.8)
					scrollers++
				}
			})
			// Track the listings panel's own scroll height when present — the window
			// height stays flat in the map layout, so it can't tell us we're growing.
			const height = listScrollHeight || doc.scrollHeight
			return { height, domItems: items.length, scrollers, loginWall, listRect }
		})
		// Human-like scrolling: a few randomized wheel nudges from a jittered cursor
		// position, with short pauses between — and an occasional longer "reading"
		// pause. Trips Facebook's soft anti-bot wall later than a single hard jump.
		const rnd = (a, b) => Math.round(a + Math.random() * (b - a))
		// Position the cursor OVER the listings panel (right column). Wheeling over
		// the centre just scrolls Facebook's map. Fall back to the right third.
		const wheelX = m.listRect ? m.listRect.x + rnd(-40, 40) : rnd(1500, 1850)
		const wheelY = m.listRect ? m.listRect.y + rnd(-60, 60) : rnd(300, 800)
		await page.mouse.move(wheelX, wheelY).catch(() => {})
		for (let n = 0, nudges = rnd(2, 4); n < nudges; n++) {
			await page.mouse.wheel({ deltaY: rnd(500, 1100) }).catch(() => {})
			await new Promise(r => setTimeout(r, rnd(180, 520)))
		}
		const basePause = jitteredDelay(scrollPauseMs())
		await new Promise(r => setTimeout(r, Math.random() < 0.2 ? basePause + rnd(900, 2200) : basePause))

		const height = m.height
		if (m.loginWall && !sawLoginWall && jobId) {
			Helpers.logger.log({ print: `Login-wall freeze detected (page height ${m.height}px ≈ viewport) — session is being walled.`, channels: jobId + 'jobUpdate' })
		}
		if (m.loginWall) sawLoginWall = true

		if (collected.size > before && jobId) {
			Helpers.logger.log({ print: `Collected ${collected.size} listings so far...`, channels: jobId + 'jobUpdate' })
		}

		// Stop once no new unique cards appear and the page stops growing.
		if (collected.size === before && height === previousHeight) {
			if (++stableRounds >= 4) { reachedEnd = true; break }
		} else {
			stableRounds = 0
		}
		previousHeight = height
	}
	// Tell the user WHY scrolling stopped: ran out of listings vs. hit the cap.
	if (jobId) {
		if (reachedEnd) {
			Helpers.logger.log({ print: `Reached the end of the listings — ${collected.size} found.`, channels: jobId + 'jobUpdate' })
		} else {
			Helpers.logger.log({ print: `Stopped at the scroll limit (FB_MAX_SCROLLS=${maxScrolls}) with ${collected.size} listings — there may be more. Raise FB_MAX_SCROLLS to load them all.`, channels: jobId + 'jobWarning' })
		}
	}
	// Treat it as the guest cap only if we both saw a login wall AND actually
	// stalled near it — otherwise the dialog detector false-positives on logged-in
	// sessions that keep loading well past 34 listings.
	const guestCapped = sawLoginWall && collected.size <= 40
	return { listings: Array.from(collected.values()), guestCapped }
}

/**
 * Extract listing card data from the current Marketplace search page.
 * Works with Facebook's rendered DOM (data-testid or href patterns).
 */
async function extractListingsFromPage(page) {
	return page.evaluate(() => {
		const listings = []
		const seen = new Set()
		// Facebook Marketplace listing links contain /marketplace/item/<id>
		const links = document.querySelectorAll('a[href*="/marketplace/item/"]')
		links.forEach(link => {
			const href = link.getAttribute('href') || ''
			const match = href.match(/\/marketplace\/item\/(\d+)/)
			if (!match) return
			const id = match[1]
			if (seen.has(id)) return
			seen.add(id)

			// Try to extract price and title from the card
			const texts = []
			link.querySelectorAll('span').forEach(span => {
				const t = (span.textContent || '').trim()
				if (t) texts.push(t)
			})

			// Price is usually the first monetary value. Parse both en (1,234.56)
			// and pt-BR (1.234,56) number formats.
			const parsePriceText = (t) => {
				let num = t.replace(/[^\d.,]/g, '')
				if (!num) return 0
				const hasComma = num.includes(','), hasDot = num.includes('.')
				if (hasComma && hasDot) {
					num = num.lastIndexOf(',') > num.lastIndexOf('.')
						? num.replace(/\./g, '').replace(',', '.')
						: num.replace(/,/g, '')
				} else if (hasComma) {
					num = /,\d{3}$/.test(num) ? num.replace(/,/g, '') : num.replace(',', '.')
				} else if (hasDot) {
					num = /\.\d{3}$/.test(num) ? num.replace(/\./g, '') : num
				}
				return parseFloat(num) || 0
			}
			let price = 0
			let title = ''
			for (const t of texts) {
				if (!price && /^(?:R\$|CA\$|C\s?\$|\$|€|£)\s?[\d,.]+/.test(t)) {
					price = parsePriceText(t)
				} else if (!title && t.length > 3 && !/^(?:R\$|CA\$|C\s?\$|\$|€|£)/.test(t)) {
					title = t
				}
			}

			// Try to get image from the card
			const img = link.querySelector('img')
			const picture_url = img ? (img.src || img.getAttribute('data-src') || '') : ''

			listings.push({ id, title, price, picture_url, href })
		})
		return listings
	})
}

/**
 * Visit a single listing detail page and extract full info.
 */
async function fetchListingDetails(listingId) {
	const browser = await getBrowser()
	const page = await browser.newPage()
	try {
		await page.setViewport({ width: 1920, height: 1080 })
		await page.evaluateOnNewDocument(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		const url = 'https://www.facebook.com/marketplace/item/' + listingId + '/'
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
		// Wait a moment for dynamic content
		await new Promise(r => setTimeout(r, 2000))

		// Set FB_DEBUG_DUMP=1 to write the raw listing HTML to disk — useful for
		// inspecting Facebook's embedded JSON when extraction selectors drift.
		if (_debugDumpsLeft > 0) {
			_debugDumpsLeft--
			try {
				const html = await page.content()
				const dir = process.env.FB_DEBUG_DUMP_DIR || require('os').tmpdir()
				require('fs').mkdirSync(dir, { recursive: true })
				require('fs').writeFileSync(require('path').join(dir, 'fb-listing-' + listingId + '.html'), html)
			} catch(e) {}
		}

		// Open the photo lightbox so Facebook renders the full thumbnail rail (each
		// <div aria-label="Thumbnail N"> carries a real <img>). On the listing page
		// itself only the first photo is in the DOM, so a DOM scrape would otherwise
		// capture a single image. Best-effort — the embedded-JSON pass below still
		// recovers every photo if the click does nothing.
		try {
			const opened = await page.evaluate(() => {
				const img = document.querySelector('img[alt^="Photo of" i]')
				if (!img) return false
				const target = img.closest('[role="button"], a[role="link"]') || img.parentElement || img
				target.click()
				return true
			})
			if (opened) {
				await page.waitForSelector('[aria-label^="Thumbnail"] img', { timeout: 6000 }).catch(() => {})
				// Walk to the end of the rail so any lazy thumbnails past the fold load.
				await page.evaluate(async () => {
					const sleep = ms => new Promise(r => setTimeout(r, ms))
					for (let i = 0; i < 6; i++) {
						const thumbs = document.querySelectorAll('[aria-label^="Thumbnail"]')
						if (thumbs.length) thumbs[thumbs.length - 1].scrollIntoView({ block: 'nearest', inline: 'end' })
						await sleep(300)
					}
				}).catch(() => {})
				await new Promise(r => setTimeout(r, 500))
			}
		} catch(e) {}

		const details = await page.evaluate(() => {
			const result = {
				title: '',
				price: 0,
				description: '',
				location: '',
				lat: 0,
				lon: 0,
				picture_urls: [],
				seller: '',
				category: '',
				propertyType: '',
				bedrooms: 0,
				bathrooms: 0,
				sqMeters: 0,
				parking: 0
			}

			// Title — the first h1 that isn't Facebook chrome. A logged-in page has
			// offscreen accessibility headings ("Notifications", "Marketplace"…) that
			// querySelector('h1') would otherwise grab instead of the listing title.
			const CHROME_TITLES = ['notifications', 'facebook', 'marketplace', 'menu', 'messenger', 'create new listing', 'marketplace search', 'your profile']
			let titleEl = null
			for (const h of document.querySelectorAll('h1')) {
				const t = (h.textContent || '').trim()
				if (t.length > 2 && CHROME_TITLES.indexOf(t.toLowerCase()) === -1) { result.title = t; titleEl = h; break }
			}
			if (!result.title) {
				const og = (document.querySelector('meta[property="og:title"]') || {}).content || ''
				if (og.trim() && !/^facebook/i.test(og.trim())) result.title = og.trim()
			}

			// Price — accept an optional rental-period suffix ("/ Month", "/mês")
			// and parse both en (1,234.56) and pt-BR (1.234,56) number formats.
			const allSpans = document.querySelectorAll('span')
			const PRICE_RE = /^(?:R\$|CA\$|C\s?\$|US\$|\$|€|£)\s?[\d.,]+(?:\s*\/\s*\p{L}+(?:\s\p{L}+)?)?$|^[\d.,]+\s?(?:€|£|kr|zł)$/iu
			const parsePriceText = (t) => {
				let num = t.replace(/[^\d.,]/g, '')
				if (!num) return 0
				const hasComma = num.includes(','), hasDot = num.includes('.')
				if (hasComma && hasDot) {
					// The right-most separator is the decimal one.
					num = num.lastIndexOf(',') > num.lastIndexOf('.')
						? num.replace(/\./g, '').replace(',', '.')
						: num.replace(/,/g, '')
				} else if (hasComma) {
					// Single comma: 3 trailing digits = thousands sep, else decimal.
					num = /,\d{3}$/.test(num) ? num.replace(/,/g, '') : num.replace(',', '.')
				} else if (hasDot) {
					num = /\.\d{3}$/.test(num) ? num.replace(/\./g, '') : num
				}
				return parseFloat(num) || 0
			}
			const priceFromSpans = (spans) => {
				for (const s of spans) {
					const t = (s.textContent || '').trim()
					if (PRICE_RE.test(t)) {
						const val = parsePriceText(t)
						if (val > 0) return val
					}
				}
				return 0
			}
			// Search the title's container first so we don't pick up an unrelated
			// price (similar listings, seller's other items) elsewhere on the page.
			let priceScope = null
			if (titleEl) {
				priceScope = titleEl
				for (let i = 0; i < 4 && priceScope.parentElement; i++) priceScope = priceScope.parentElement
			}
			if (priceScope) result.price = priceFromSpans(priceScope.querySelectorAll('span'))
			if (!result.price) result.price = priceFromSpans(allSpans)

			// Location — try role="listitem" with location pin SVG first
			const LOCATION_PIN_PATH = 'M10 .5A7.5'
			const listItems = document.querySelectorAll('[role="listitem"]')
			for (const item of listItems) {
				const text = (item.textContent || '').trim()
				if (text.length < 3) continue
				const svg = item.querySelector('svg')
				if (!svg) continue
				const pathD = svg.querySelector('path')?.getAttribute('d') || ''
				if (pathD.startsWith(LOCATION_PIN_PATH)) {
					result.location = text
					break
				}
			}
			// Fallback: some listing types have no listItems — scan all spans
			// for text near a location pin SVG anywhere on the page
			if (!result.location) {
				document.querySelectorAll('svg').forEach(svg => {
					if (result.location) return
					const pathD = svg.querySelector('path')?.getAttribute('d') || ''
					if (pathD.startsWith(LOCATION_PIN_PATH)) {
						// Get the text from the nearest sibling/parent container
						const container = svg.closest('div')
						if (container) {
							const text = container.textContent.trim()
							if (text.length > 2 && text.length < 80) result.location = text
						}
					}
				})
			}
			// Last fallback: look for "Listed in <location>" pattern in page text
			if (!result.location) {
				for (const s of allSpans) {
					const t = (s.textContent || '').trim()
					if (/^listed\s+in\s+/i.test(t)) {
						result.location = t.replace(/^listed\s+in\s+/i, '').trim()
						break
					}
					// Location-like text: "City, State" pattern
					if (!result.location && /^[A-Z\u00C0-\u024F][\w\s\u00C0-\u024F-]+,\s*[A-Z]{2}$/.test(t)) {
						result.location = t
					}
				}
			}

			// Category, property details — scan all spans for known patterns
			const spanTexts = []
			allSpans.forEach(s => { const t = (s.textContent || '').trim(); if (t) spanTexts.push(t) })

			// Category: "Home sales", "Property rentals", etc. — usually a link near the price
			const categoryLinks = document.querySelectorAll('a[href*="/marketplace/"][href*="property"], a[href*="/marketplace/"][href*="sale"], a[href*="/marketplace/"][href*="rental"]')
			if (categoryLinks.length) result.category = (categoryLinks[0].textContent || '').trim()

			// Beds · baths pattern: "2 beds · 3 baths"
			for (const t of spanTexts) {
				const bedMatch = t.match(/(\d+)\s*beds?/i)
				const bathMatch = t.match(/(\d+)\s*baths?/i)
				if (bedMatch) result.bedrooms = parseInt(bedMatch[1]) || 0
				if (bathMatch) result.bathrooms = parseInt(bathMatch[1]) || 0
				if (bedMatch || bathMatch) break
			}

			// Square meters: "92 square meters" or "67 m²"
			for (const t of spanTexts) {
				const sqMatch = t.match(/(\d+)\s*(?:square\s*met|m²|sq\s*m)/i)
				if (sqMatch) { result.sqMeters = parseInt(sqMatch[1]) || 0; break }
			}

			// Parking: "2 parking spaces"
			for (const t of spanTexts) {
				const parkMatch = t.match(/(\d+)\s*parking/i)
				if (parkMatch) { result.parking = parseInt(parkMatch[1]) || 0; break }
			}

			// Property type: "Apartment", "House", "Condo", etc.
			const propertyTypes = ['apartment', 'house', 'condo', 'townhouse', 'studio', 'loft', 'villa', 'duplex', 'flat', 'room']
			for (const t of spanTexts) {
				const lower = t.toLowerCase().trim()
				if (propertyTypes.includes(lower)) { result.propertyType = t; break }
			}

			// Description
			const descEls = document.querySelectorAll('[data-testid="marketplace_listing_description"]')
			if (descEls.length) {
				result.description = (descEls[0].textContent || '').trim()
			} else {
				let longest = ''
				allSpans.forEach(s => {
					const t = (s.textContent || '').trim()
					if (t.length > longest.length && t !== result.title && t.length > 30
						&& !t.includes(result.location) && !/^(?:R\$|CA\$|\$|€|£)/.test(t)) {
						longest = t
					}
				})
				if (longest) result.description = longest
			}

			// Images. The listing page lazy-renders only the first photo (or a few)
			// until the gallery is opened, so we combine the rendered <img> tags with
			// the listing's embedded JSON and dedup size-variants of the same photo by
			// its stable "<id>_<id>_<id>_n.jpg" basename. In Docker naturalWidth is
			// always 0, so we never rely on dimensions.
			const byName = new Map()
			const fileName = (u) => (u.split('?')[0].split('/').pop() || '')
			const addImg = (src) => {
				if (!src || !/scontent/.test(src)) return
				const name = fileName(src)
				if (name && !byName.has(name)) byName.set(name, src)
			}
			// Rendered gallery thumbnails (aria-label="Thumbnail N", present once the
			// photo viewer is open) and the main "Photo of …" image(s).
			document.querySelectorAll('[aria-label^="Thumbnail" i] img, img[alt^="Photo of" i]').forEach(img => {
				addImg(img.currentSrc || img.src || img.getAttribute('src') || '')
			})
			// Last resort if nothing matched: any non-avatar scontent image.
			if (byName.size === 0) {
				document.querySelectorAll('img').forEach(img => {
					const src = img.currentSrc || img.src || ''
					if (/scontent/.test(src) && !/(?:\/p\d+x\d+\/|\/c\d+\.\d+\.\d+\.\d+\/|\/cp\d+\/)/.test(src)) addImg(src)
				})
			}

			// Pull the full photo set from this listing's embedded JSON — present even
			// when the gallery never rendered, which is why a DOM-only scrape saved a
			// single image. Scope to the "listing_photos" array so we don't sweep in
			// "similar listings" photos lower on the page. The key can appear escaped,
			// and URIs carry escaped slashes (https:\/\/scontent…).
			{
				const html = document.documentElement.innerHTML
				let idx = html.indexOf('"listing_photos"')
				if (idx === -1) idx = html.indexOf('listing_photos')
				if (idx !== -1) {
					const slice = html.slice(idx, idx + 120000)
					const re = /"uri":"(https:\\?\/\\?\/scontent[^"]+?)"/g
					let mm, added = 0
					while ((mm = re.exec(slice)) !== null && added < 60) {
						addImg(mm[1].replace(/\\\//g, '/'))
						added++
					}
				}
			}
			result.picture_urls = Array.from(byName.values())

			// Lat/lon from structured data
			const ldJsons = []
			document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
				try { ldJsons.push(JSON.parse(s.textContent)) } catch(e) {}
			})
			for (const ld of ldJsons) {
				if (ld.geo) {
					result.lat = parseFloat(ld.geo.latitude) || 0
					result.lon = parseFloat(ld.geo.longitude) || 0
				}
				if (ld.availableAtOrFrom && ld.availableAtOrFrom.geo) {
					result.lat = parseFloat(ld.availableAtOrFrom.geo.latitude) || 0
					result.lon = parseFloat(ld.availableAtOrFrom.geo.longitude) || 0
				}
			}
			// Fallback: dig the coordinates out of the embedded JSON. The map/markers
			// don't render in headless and there's often no ld+json, but the listing's
			// location is in the page source. Prefer a lat/lon adjacent to a
			// "location"/"reverse_geocode" key, else the first coordinate pair.
			if (!result.lat && !result.lon) {
				const pageHtml = document.documentElement.innerHTML
				// Facebook embeds several coordinate pairs. The listing's own pin is
				//   "location":{"latitude":-23.52,"longitude":-46.50}
				// The browse/search centre instead looks like
				//   "location":{"radius":10,"latitude":…}   or   "buyLocation":{…}
				// and is IDENTICAL on every page — matching that (as the first cut of
				// this code did) dropped every listing onto the same São Paulo point.
				// So scan each "location":{…} object, skip any that carry a "radius"
				// (those are the browse/search location), and take the first real
				// lat/lon pair (either key order).
				const re = /"location":\{([^{}]*?)\}/g
				let m
				while ((m = re.exec(pageHtml)) !== null) {
					if (/"radius"/.test(m[1])) continue
					const lat = m[1].match(/"latitude":(-?\d+(?:\.\d+)?)/)
					const lon = m[1].match(/"longitude":(-?\d+(?:\.\d+)?)/)
					if (lat && lon) {
						result.lat = parseFloat(lat[1]) || 0
						result.lon = parseFloat(lon[1]) || 0
						break
					}
				}
			}

			// Seller name
			const sendBtn = document.querySelector('[aria-label^="Send message to"]')
			if (sendBtn) {
				const label = sendBtn.getAttribute('aria-label') || ''
				result.seller = label.replace(/^Send message to\s*/i, '').trim()
			}
			if (!result.seller) {
				const sellerLinks = document.querySelectorAll('a[href*="/marketplace/profile/"], a[href*="/people/"]')
				if (sellerLinks.length) result.seller = (sellerLinks[0].textContent || '').trim()
			}

			return result
		})

		return details
	} catch(e) {
		return null
	} finally {
		await page.close()
	}
}

// ---------------------------------------------------------------------------
// Listing-list cache (resume support)
//
// Scrolling Marketplace to harvest every listing card is the slow, block-prone
// part of a Facebook scrape. We persist the harvested list to the `listingCache`
// collection as soon as scrolling finishes, so an interrupted run (app restart,
// crash, or user Stop) can resume straight into detail-fetching without
// re-scrolling. Already-scraped listings are skipped by the per-ad cache, so a
// resume only fetches the listings that weren't reached yet.
//
// Keyed by jobId. Cleared when the job completes cleanly (_finishJob) or when
// the user clears the job's ads. It also stores the run's fingerprint (so the
// resume run re-stamps the same ads — the expired-ads cleanup keys off
// fingerprint) and the search URL (so a stale cache from an edited search isn't
// reused).
// ---------------------------------------------------------------------------
async function loadListingCache(db, jobId, pageUrl) {
	try {
		const doc = await db.get('listingCache').findOne({ jobId: String(jobId) })
		if (!doc) return null
		if (pageUrl && doc.pageUrl && doc.pageUrl !== pageUrl) {
			// Search URL changed since the cache was written — it's stale.
			await db.get('listingCache').remove({ jobId: String(jobId) }).catch(() => {})
			return null
		}
		return doc
	} catch(e) { return null }
}

async function saveListingCache(db, jobId, pageUrl, listings, fingerprint) {
	try {
		await db.get('listingCache').update(
			{ jobId: String(jobId) },
			{ $set: { jobId: String(jobId), platform: 'facebook', pageUrl, fingerprint, listings, savedAt: new Date() } },
			{ upsert: true }
		)
	} catch(e) {
		Helpers.logger.log({ print: 'Could not save listing cache: ' + e, channels: jobId + 'jobWarning' })
	}
}

async function clearListingCache(db, jobId) {
	try { await db.get('listingCache').remove({ jobId: String(jobId) }) } catch(e) {}
}

module.exports = {
	processPage: async function(params, callback = null) {
		Helpers.logger.log({ print: 'Processing Facebook Marketplace listings for: ' + params.jobName, channels: params.jobId + 'jobUpdate' })
		if (!params.pageUrl || params.pageUrl == '')
			return
		params.index_site = 0
		params.startTime = Date.now()
		params.totalListingsFound = 0

		// Resume support: if a listing cache survived from an interrupted run for
		// this same search, reuse its fingerprint and listings so we skip the
		// scroll and re-stamp the already-scraped ads instead of wiping them.
		const newFingerprint = () => Math.floor(Math.random() * (99999999999999 - 1 + 1)) + 1
		const resumeCache = await loadListingCache(params.db, params.jobId, params.pageUrl)
		if (resumeCache && Array.isArray(resumeCache.listings) && resumeCache.listings.length) {
			params._cachedListings = resumeCache.listings
			params.fingerprint = resumeCache.fingerprint || params.fingerprint || newFingerprint()
			Helpers.logger.log({ print: `Found cached listing list (${resumeCache.listings.length} listings) — will resume without re-scrolling`, channels: params.jobId + 'jobUpdate' })
		} else {
			params.fingerprint = params.fingerprint || newFingerprint()
		}

		// Authenticate: try user credentials first, then env cookies
		let fbEmail = '', fbPassword = ''
		if (params.userId) {
			try {
				const user = await params.db.get('users').findOne({ _id: params.userId })
				if (user && user.fbEmail && user.fbPasswordEnc) {
					fbEmail = user.fbEmail
					fbPassword = decryptField(user.fbPasswordEnc)
				}
			} catch(e) {}
		}
		if (!fbEmail && process.env.FB_COOKIES) {
			await seedCookies(process.env.FB_COOKIES, '.facebook.com')
		}

		const pageNumber = await module.exports._scrapeSinglePage(params, params.pageUrl, fbEmail, fbPassword)
		return module.exports._finishJob(params, pageNumber, callback)
	},

	_scrapeSinglePage: async function(params, pageUrl, fbEmail, fbPassword) {
		const browser = await getBrowser()
		let page = null
		let pageNumber = 0
		let stopStream = () => {}

		try {
			page = await browser.newPage()
			await page.setViewport({ width: 1920, height: 1080 })
			await page.evaluateOnNewDocument(() => {
				Object.defineProperty(navigator, 'webdriver', { get: () => false })
			})

			// Try restoring saved session first, then fall back to credential login
			let loggedIn = false
			if (params.userId && params.db) {
				loggedIn = await restoreFbCookies(page, params.db, params.userId, params.jobId)
			}
			if (!loggedIn && fbEmail && fbPassword) {
				loggedIn = await loginWithCredentials(page, fbEmail, fbPassword, params.jobId, params.db, params.userId)
			}
			// FB_COOKIES (no per-user creds) seeds cookies but never sets loggedIn —
			// and any path can leave a stale c_user — so confirm auth authoritatively.
			if (!loggedIn) {
				loggedIn = await verifyMarketplaceAuth(page)
			}

			// Don't scrape guest results: a walled session is capped at ~34 listings
			// and would overwrite the cached ads with a tiny partial set.
			const requireLogin = String(process.env.FB_REQUIRE_LOGIN || 'true').toLowerCase() !== 'false'
			if (!loggedIn && requireLogin) {
				Helpers.logger.log({ print: 'Not logged into Facebook — aborting this run (no guest results saved, cached ads kept). Set FB_COOKIES (c_user and xs) in .env, or log in via Profile > Facebook Marketplace Login.', channels: params.jobId + 'jobWarning' })
				if (page) await page.close().catch(() => {})
				return 0
			}
			if (!loggedIn) {
				Helpers.logger.log({ print: 'Continuing without login — results may be limited (FB_REQUIRE_LOGIN=false)', channels: params.jobId + 'jobWarning' })
			}

			let listings = []
			if (params._cachedListings && params._cachedListings.length) {
				// Resuming: reuse the previously harvested list and skip the scroll.
				// The login above is still done so detail-page fetches stay authed.
				listings = params._cachedListings
				Helpers.logger.log({ print: `Resuming from ${listings.length} cached listings — skipping scroll`, channels: params.jobId + 'jobUpdate' })
				await page.close().catch(() => {})
				page = null
			} else {
				Helpers.logger.log({ print: 'Navigating to: ' + pageUrl, channels: params.jobId + 'jobUpdate' })
				await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
				await new Promise(r => setTimeout(r, 3000))

				// Stream the page to the frontend so the scrape can be watched live.
				stopStream = startPageStream(page, params.jobId)

				// Check if we need to dismiss login prompts or cookie dialogs
				try {
					const closeBtn = await page.$('[aria-label="Close"], [data-testid="cookie-policy-manage-dialog-accept-button"]')
					if (closeBtn) await closeBtn.click()
					await new Promise(r => setTimeout(r, 1000))
				} catch(e) {}

				// Check for login wall — if the page has no marketplace items and shows a login form
				const hasListings = await page.$$eval('a[href*="/marketplace/item/"]', els => els.length)
				if (hasListings === 0) {
					const bodyText = await page.evaluate(() => document.body.innerText)
					if (/log\s*in/i.test(bodyText) && /sign\s*up/i.test(bodyText)) {
						Helpers.logger.log({ print: 'Facebook login wall detected — set your Facebook credentials in Profile, or provide FB_COOKIES in .env', channels: params.jobId + 'jobWarning' })
						if (page) await page.close().catch(() => {})
						return 0
					}
				}

				// Scroll to load all listings, harvesting cards as we go so virtualized
				// (recycled) items aren't lost.
				Helpers.logger.log({ print: 'Scrolling to load listings...', channels: params.jobId + 'jobUpdate' })
				const collected = await scrollAndCollect(page, params.jobId)
				listings = collected.listings
				const guestCapped = collected.guestCapped
				stopStream()
				Helpers.logger.log({ print: `Extracted ${listings.length} unique listings after scrolling`, channels: params.jobId + 'jobUpdate' })

				// A login wall froze us at the guest cap — the session isn't really
				// authenticated. Abort without saving so the partial set doesn't replace
				// the cached ads (unless guest scraping was explicitly allowed).
				if (guestCapped && requireLogin) {
					Helpers.logger.log({ print: 'Facebook login wall hit (~34-listing guest cap) — aborting, cached ads kept. Set FB_COOKIES (c_user and xs) in .env, or log in via Profile.', channels: params.jobId + 'jobWarning' })
					if (page) await page.close().catch(() => {})
					return 0
				}
				if (guestCapped) {
					Helpers.logger.log({ print: 'Login wall hit — saving the limited guest set anyway (FB_REQUIRE_LOGIN=false)', channels: params.jobId + 'jobWarning' })
				}

				// Close the search page — we'll open individual pages for details
				await page.close()
				page = null

				// Persist the harvested list so an interrupted run can resume straight
				// into detail-fetching without re-scrolling the whole search.
				if (listings.length > 0) {
					await saveListingCache(params.db, params.jobId, pageUrl, listings, params.fingerprint)
					Helpers.logger.log({ print: `Saved ${listings.length} listings to resume cache`, channels: params.jobId + 'jobUpdate' })
				}
			}

			if (listings.length > 0) {
				pageNumber = 1
				params.pageNumber = (params.pageNumber || 0) + 1
				await module.exports.processPageListings(params, listings)
			}
		} catch(e) {
			Helpers.logger.log({ print: `Error processing Facebook Marketplace: ${e}`, channels: params.jobId + 'jobWarning' })
		} finally {
			stopStream()
			if (page) await page.close().catch(() => {})
		}

		return pageNumber
	},

	_finishJob: async function(params, pageNumber, callback = null) {
		const aborted = !!params._aborted
		// Only clean up expired ads if this run actually scraped listings AND ran to
		// completion. Otherwise (login wall, block, Stop/abort), keep the cached ads
		// from prior runs — and keep the listing cache so the job can resume.
		if (pageNumber > 0 && !aborted) {
			try {
				const favoritedIds = await Helpers.common.getFavoritedAdIds(params.db)
				const result = await params.db.get('ads').remove({
					$and: [
						{ ['jobs.' + params.jobId]: { $exists: true } },
						{ ['jobs.' + params.jobId + '.fingerprint']: { $ne: params.fingerprint } },
						{ _id: { $nin: favoritedIds } }
					]
				})
				Helpers.logger.log({ print: `All expired ads have been removed! Removed: ${result.result.n} ads. (preserved ${favoritedIds.length} favorited)`, channels: params.jobId + 'jobUpdate' })
			} catch(err) {
				Helpers.logger.log({ print: err, channels: params.jobId + 'jobWarning' })
			}
			// Completed cleanly — drop the resume cache so the next run scrolls fresh.
			await clearListingCache(params.db, params.jobId)
		} else if (aborted) {
			Helpers.logger.log({ print: `Job stopped before finishing — keeping the listing cache so it can resume from where it left off (no expired-ads cleanup).`, channels: params.jobId + 'jobWarning' })
		} else {
			Helpers.logger.log({ print: `Skipping expired-ads cleanup: this run scraped 0 pages (login wall, block, or aborted) — preserving previously cached ads`, channels: params.jobId + 'jobWarning' })
		}

		try {
			await params.db.get('users').update({ 'jobs': { $elemMatch: { id: params.jobId, statusCode: 2 } } }, { '$set': { 'jobs.$.statusCode': 1 } })
		} catch(err) {
			Helpers.logger.log({ print: err, channels: params.jobId + 'jobWarning' })
		}

		Helpers.logger.log({ command: 'doneProc', print: pageNumber, params: { startTime: params.startTime, totalListingsFound: params.totalListingsFound }, channels: params.jobId + 'command' })
		if (callback) callback(null, pageNumber)
		return pageNumber
	},

	processPageListings: async function(params, listings, callback = null) {
		if (params.totalListingsFound !== undefined) params.totalListingsFound += listings.length

		Helpers.logger.log({
			command: 'procPageNumber',
			print: params.pageNumber,
			params: {
				startTime: params.startTime,
				totalListingsFound: params.totalListingsFound
			},
			channels: params.jobId + 'command'
		})
		params.newAdsFound = false
		await eachOfLimit(listings, 1, module.exports.processSingleListing.bind(null, params))
		Helpers.logger.log({
			command: 'donePageNumber',
			params: {
				refresh: params.newAdsFound,
				startTime: params.startTime,
				totalListingsFound: params.totalListingsFound
			},
			print: params.pageNumber,
			channels: params.jobId + 'command'
		})
		if (callback) callback(null, true)
		return params.newAdsFound
	},

	processSingleListing: async function(params, listing, index) {
		if (params._aborted) return
		// Honor a Stop request mid-run so the job can be resumed later from its
		// listing cache. Throttled so an all-cached run doesn't hammer the DB.
		const nowTs = Date.now()
		if (!params._lastStopCheck || nowTs - params._lastStopCheck > 3000) {
			params._lastStopCheck = nowTs
			try {
				const user = await params.db.get('users').findOne({ 'jobs.id': params.jobId })
				const job = user && user.jobs && user.jobs.find(j => j.id == params.jobId)
				if (!job || !job.statusCode || job.statusCode < 2) {
					params._aborted = true
					Helpers.logger.log({ print: 'Stop requested — halting Facebook scrape (resume cache preserved).', channels: params.jobId + 'jobUpdate' })
					return
				}
			} catch(e) {}
		}
		while (true) {
			const url = 'https://www.facebook.com/marketplace/item/' + listing.id + '/'
			try {
				// Check cache first. Refresh the price from the search card (no extra
				// page fetch needed) so live price changes show without a full re-scrape.
				const cacheHitSet = { ['jobs.' + params.jobId]: { fingerprint: params.fingerprint, price: listing.price || 0 }, url }
				if (listing.price) cacheHitSet.price = listing.price
				let doc = await params.db.get('ads').findOneAndUpdate(
					{ 'facebookId': String(listing.id) },
					{ $set: cacheHitSet }
				)
				if (doc) {
					Helpers.logger.log({ print: 'Loading listing from cache: ' + url, channels: params.jobId + 'jobUpdate' })
					return
				}
			} catch(e) { console.log(e) }

			try {
				let title = listing.title || ''
				let price = listing.price || 0
				let lat = 0, lon = 0
				let description = '', location = '', seller = '', category = '', propertyType = ''
				let bedrooms = 0, bathrooms = 0, sqMeters = 0, parking = 0
				let picture_urls = listing.picture_url ? [listing.picture_url] : []

				// Fetch full details from the listing page
				try {
					Helpers.logger.log({ print: `Fetching details for listing ${listing.id}...`, channels: params.jobId + 'jobUpdate' })
					const details = await fetchListingDetails(listing.id)
					if (details) {
						if (details.title) title = details.title
						if (details.price) price = details.price
						if (details.lat) lat = details.lat
						if (details.lon) lon = details.lon
						if (details.description) description = details.description
						if (details.picture_urls && details.picture_urls.length) picture_urls = details.picture_urls
						if (details.location) location = details.location
						if (details.seller) seller = details.seller
						if (details.category) category = details.category
						if (details.propertyType) propertyType = details.propertyType
						if (details.bedrooms) bedrooms = details.bedrooms
						if (details.bathrooms) bathrooms = details.bathrooms
						if (details.sqMeters) sqMeters = details.sqMeters
						if (details.parking) parking = details.parking
					}
				} catch(detailErr) {
					Helpers.logger.log({ print: `Could not fetch details for ${listing.id}: ${detailErr.message}`, channels: params.jobId + 'jobWarning' })
				}

				// Geocode location text if we still have no coordinates
				if (!lat && !lon && location) {
					try {
						const geo = await geocodeLocation(location)
						lat = geo.lat
						lon = geo.lon
					} catch(e) {}
				}

				title = title.replace(/\"/g, '').replace(/\\/g, '').replace(/(\r\n|\n|\r)/gm, '').replace(/    /g, '')
				if (!title) return

				params.newAdsFound = true
				Helpers.logger.log({ print: title, channels: params.jobId + 'jobUpdate' })

				params.db.get('ads').insert({
					facebookId: String(listing.id),
					price, lat, lon, url, title, seller,
					categories: [category, location, propertyType].filter(Boolean),
					description,
					bedrooms, bathrooms, sqMeters, parking, propertyType,
					picture_url: picture_urls[0] || '',
					picture_urls,
					datetime: new Date(),
					pageUrl: params.pageUrl,
					platform: 'facebook',
					jobs: { [params.jobId]: { fingerprint: params.fingerprint } }
				}, function(err, doc) {
					if (err) {
						Helpers.logger.log({ print: 'Error adding listing to DB: ' + err, channels: params.jobId + 'jobWarning' })
						return
					}
					if (doc && Helpers.io) Helpers.io.emit('newAd', {jobId: params.jobId, ad: doc})
				})

				// Delay between detail page fetches
				await Helpers.common.sleep(jitteredDelay(detailDelay()))
				return
			} catch(e) {
				Helpers.logger.log({ print: `Retrying Facebook listing in ${requestErrorDelay() / 1000}s: ${e}`, channels: params.jobId + 'jobWarning' })
				await Helpers.common.sleep(requestErrorDelay())
			}
		}
	},
	refetchMissingPhotos: async function(params, callback = null) {
		Helpers.logger.log({print: 'Photo refetch not yet implemented for Facebook Marketplace. Re-run the full search instead.', channels: params.jobId+'jobWarning'})
		if (callback) callback(null, 0)
		return 0
	}
}
