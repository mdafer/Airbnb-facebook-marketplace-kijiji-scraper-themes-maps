const Helpers = require('../helpers/includes'),
	axios = require('axios')

// Real Quinto Andar endpoints (discovered via puppeteer network trace, not guessed):
//   POST {APIGW}/house-listing-search/v2/search/list      → paginated listing data with location
//   GET  {APIGW}/house-listing-search/v2/search/count     → total result count
//   GET  www.quintoandar.com.br/property/{id}/photos      → simple photo list per listing
//   GET  www.quintoandar.com.br/api/kodak/v1/media/photo/house/{id}/categorized-photos → richer
// The /search/list response does NOT include photos; they must be fetched per-listing.
const APIGW = 'https://apigw.prod.quintoandar.com.br'
const SEARCH_LIST_URL = APIGW + '/house-listing-search/v2/search/list'
const PHOTOS_URL = id => `https://www.quintoandar.com.br/api/kodak/v1/media/photo/house/${id}/categorized-photos`
const IMG_BASE = 'https://www.quintoandar.com.br/img/'
// QA CDN sizes verified empirically: med ≈ 30KB, xxl ≈ 140KB, no-size folder
// returns the ~800KB original. xxl is the right balance for gallery thumbs;
// the client rewrites to no-size for the single-image zoom view.
const IMG_SIZE = process.env.QUINTOANDAR_IMG_SIZE || 'xxl'

const PAGE_SIZE = Number(process.env.QUINTOANDAR_PAGE_SIZE) || 50
const requestErrorDelay = () => Number(process.env.QUINTOANDAR_ERROR_DELAY_MS) || 60000

function humanDelay() {
	const base = Number(process.env.QUINTOANDAR_REQUEST_DELAY_MS) || 4000
	if (Math.random() < 0.15) return Math.round(base * (2 + Math.random() * 2))
	return Math.round(base * (0.5 + Math.random()))
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'

// MongoDB rejects field names containing '.' or starting with '$'. QA category
// names like "Hall do Apto." trip this — sanitize before using as a key.
function sanitizeCategoryKey(name) {
	if (!name) return ''
	return String(name).replace(/\./g, '').replace(/^\$/, '_').trim()
}

// SCREAMING_SNAKE_CASE → "Title case with spaces", preserving common abbreviations.
function humanizeCode(code) {
	if (!code || typeof code !== 'string') return ''
	return code.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function extractNextData(html) {
	const m = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
	if (!m) return null
	try { return JSON.parse(m[1]) } catch(e) { return null }
}

// Pull slug from a QA URL: /comprar/imovel/{slug}[/...]
function extractSlug(pageUrl) {
	try {
		const u = new URL(pageUrl)
		const m = u.pathname.match(/\/comprar\/imovel\/([^/?#]+)/)
		return m ? m[1] : null
	} catch(e) { return null }
}

// QA's SPA mutates the map viewport in client state only and never reflects it
// back into the URL, so a copy-pasted URL after panning still encodes the
// original area. Allow the user to override via `#bbox=south,west,north,east`.
function parseBboxOverride(pageUrl) {
	try {
		const u = new URL(pageUrl)
		const m = (u.hash || '').match(/bbox=(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)/)
		if (!m) return null
		const south = Number(m[1]), west = Number(m[2]), north = Number(m[3]), east = Number(m[4])
		if (!(south < north) || !(west < east)) return null
		return {
			viewport: { north, south, east, west },
			center: { lat: (north + south) / 2, lng: (east + west) / 2 }
		}
	} catch(e) { return null }
}

// Hit the SSR search page once to recover the QA-resolved viewport, center, and
// filters for the user's URL. These are required as the `filters` body for the
// API — the URL slug alone does not encode bounding box or price filters.
async function fetchSearchContext(pageUrl) {
	const resp = await axios.get(pageUrl, {
		headers: {
			'User-Agent': UA,
			'Accept': 'text/html,application/xhtml+xml',
			'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
		},
		timeout: 30000
	})
	const data = extractNextData(resp.data)
	if (!data) throw new Error('Could not extract __NEXT_DATA__ from search page')
	const is = data.props && data.props.pageProps && data.props.pageProps.initialState
	if (!is || !is.search) throw new Error('Unexpected page structure (no initialState.search)')
	const location = is.search.location || {}
	const route = is.route || {}
	const businessContext = route.businessContext || 'SALE'
	let center = location.latLng ? { lat: location.latLng.lat, lng: location.latLng.lng } : null
	// SSR `bounds` is usually `{}` — the browser computes it client-side from
	// center+zoom. Derive a viewport from zoomLevel using a Mercator-degrees
	// approximation (1 tile spans 360°/2^zoom of longitude; latitude span shrinks
	// modestly with cos(lat)). zoomLevel 12 ≈ a metro area, 14 ≈ a neighborhood.
	let viewport = null
	if (location.bounds && location.bounds.northeast && location.bounds.southwest) {
		viewport = {
			north: location.bounds.northeast.lat,
			south: location.bounds.southwest.lat,
			east: location.bounds.northeast.lng,
			west: location.bounds.southwest.lng
		}
	} else if (center) {
		const z = Number(location.zoomLevel) || 12
		const lngSpan = 360 / Math.pow(2, z) * 5 // ~5 tiles wide
		const latSpan = lngSpan * Math.cos(center.lat * Math.PI / 180)
		viewport = {
			north: center.lat + latSpan / 2,
			south: center.lat - latSpan / 2,
			east: center.lng + lngSpan / 2,
			west: center.lng - lngSpan / 2
		}
	}
	const override = parseBboxOverride(pageUrl)
	if (override) {
		viewport = override.viewport
		center = override.center
	}
	// Parse filters directly from URL path segments. The SSR pastChoices bag is
	// unreliable (often missing amenities, ranges shaped inconsistently), and
	// the path is the canonical encoding QA itself uses for permalinkable filters.
	const pathFilters = parsePathFilters(pageUrl)
	return {
		slug: extractSlug(pageUrl),
		businessContext,
		viewport,
		center,
		pathFilters,
		// SSR pre-renders the first ~12 fully-enriched listings (with photos);
		// surface them so we don't need an extra photo fetch for those.
		ssrHouses: is.houses || {}
	}
}

// Extract filters from the URL path: /2-quartos /0-1-2-3-vagas /de-55-a-1000-m2
// /de-150000-a-560000-venda /rua-silenciosa /vista-livre /varanda /apartamento ...
function parsePathFilters(pageUrl) {
	const filters = { amenities: [], houseTypes: [] }
	try {
		const u = new URL(pageUrl)
		const m = u.pathname.match(/\/(comprar|alugar)\/imovel\/[^/]+((?:\/[^/]+)*)/)
		if (!m) return filters
		const typeSet = new Set(['apartamento','apartamentos','casa','casas','studio','studios','kitnet','kitnets','cobertura','coberturas','sobrado','sobrados'])
		const segs = (m[2] || '').split('/').filter(Boolean)
		for (const raw of segs) {
			const s = decodeURIComponent(raw)
			let mm
			if ((mm = s.match(/^((?:\d+-)*\d+)-quartos$/))) {
				filters.bedroomsMin = Math.min(...mm[1].split('-').map(Number))
			} else if ((mm = s.match(/^((?:\d+-)*\d+)-banheiros$/))) {
				filters.bathroomsMin = Math.min(...mm[1].split('-').map(Number))
			} else if ((mm = s.match(/^((?:\d+-)*\d+)-vagas$/))) {
				filters.parkingMin = Math.min(...mm[1].split('-').map(Number))
			} else if ((mm = s.match(/^de-(\d+)-a-(\d+)-m2$/))) {
				filters.areaMin = Number(mm[1]); filters.areaMax = Number(mm[2])
			} else if ((mm = s.match(/^ate-(\d+)-m2$/))) {
				filters.areaMax = Number(mm[1])
			} else if ((mm = s.match(/^a-partir-de-(\d+)-m2$/))) {
				filters.areaMin = Number(mm[1])
			} else if ((mm = s.match(/^de-(\d+)-a-(\d+)-(venda|aluguel)$/))) {
				filters.priceMin = Number(mm[1]); filters.priceMax = Number(mm[2])
				filters.costType = mm[3] === 'aluguel' ? 'RENT_PRICE' : 'SALE_PRICE'
			} else if ((mm = s.match(/^ate-(\d+)-(venda|aluguel)$/))) {
				filters.priceMax = Number(mm[1])
				filters.costType = mm[2] === 'aluguel' ? 'RENT_PRICE' : 'SALE_PRICE'
			} else if ((mm = s.match(/^a-partir-de-(\d+)-(venda|aluguel)$/))) {
				filters.priceMin = Number(mm[1])
				filters.costType = mm[2] === 'aluguel' ? 'RENT_PRICE' : 'SALE_PRICE'
			} else if (typeSet.has(s)) {
				filters.houseTypes.push(s.toUpperCase().replace(/S$/, '')) // apartamentos → APARTAMENTO
			} else {
				// Free-form tag → SCREAMING_SNAKE amenity code (rua-silenciosa → RUA_SILENCIOSA)
				filters.amenities.push(s.toUpperCase().replace(/-/g, '_'))
			}
		}
	} catch(e) {}
	return filters
}

// Map URL-derived filters → /search/list body. Schema verified against an
// actual QA browser request (priceRange[].costType, houseSpecs.*.range.{min,max},
// houseSpecs.amenities[] with SCREAMING_SNAKE codes — NOT the flatter shape we
// were sending before, which QA silently ignored).
function buildApiFilters(ctx) {
	const f = {
		// Disable flexible search: with it on, QA returns "Outra localização"
		// PARTIAL fallback hits from outside the viewport when no exact match
		// exists. We only want exact in-bbox matches.
		enableFlexibleSearch: false,
		businessContext: ctx.businessContext || 'SALE',
		location: { countryCode: 'BR' },
		availability: 'ANY',
		occupancy: 'ANY'
	}
	if (ctx.center) f.location.coordinate = { lat: ctx.center.lat, lng: ctx.center.lng }
	if (ctx.viewport) f.location.viewport = ctx.viewport

	const pf = ctx.pathFilters || {}
	if (pf.priceMin != null || pf.priceMax != null) {
		const range = {}
		if (pf.priceMin != null) range.min = pf.priceMin
		if (pf.priceMax != null) range.max = pf.priceMax
		f.priceRange = [{ costType: pf.costType || (ctx.businessContext === 'RENT' ? 'RENT_PRICE' : 'SALE_PRICE'), range }]
	}

	const houseSpecs = {}
	if (pf.areaMin != null || pf.areaMax != null) {
		const range = {}
		if (pf.areaMin != null) range.min = pf.areaMin
		if (pf.areaMax != null) range.max = pf.areaMax
		houseSpecs.area = { range }
	}
	if (pf.bedroomsMin != null) houseSpecs.bedrooms = { range: { min: pf.bedroomsMin } }
	if (pf.bathroomsMin != null) houseSpecs.bathrooms = { range: { min: pf.bathroomsMin } }
	if (pf.parkingMin != null) houseSpecs.parkingSpace = { range: { min: pf.parkingMin } }
	if (pf.amenities && pf.amenities.length) houseSpecs.amenities = pf.amenities
	if (pf.houseTypes && pf.houseTypes.length) houseSpecs.houseTypes = pf.houseTypes
	if (Object.keys(houseSpecs).length) f.houseSpecs = houseSpecs

	return f
}

const LIST_FIELDS = [
	'id', 'salePrice', 'totalCost', 'area', 'bedrooms', 'bathrooms', 'parkingSpots',
	'forSale', 'forRent', 'address', 'regionName', 'neighbourhood', 'type',
	'amenities', 'installations', 'shortSaleDescription', 'location',
	'isFurnished', 'yield', 'condoIptu', 'listingTags', 'categories'
]

async function fetchSearchList(ctx, offset, opts = {}) {
	const viewport = opts.viewport || ctx.viewport
	const pageSize = opts.pageSize != null ? opts.pageSize : PAGE_SIZE
	const filters = buildApiFilters(ctx)
	if (viewport) {
		filters.location.viewport = viewport
		filters.location.coordinate = { lat: (viewport.north + viewport.south) / 2, lng: (viewport.east + viewport.west) / 2 }
	}
	const body = {
		slug: ctx.slug,
		fields: LIST_FIELDS,
		pagination: { pageSize, offset },
		context: { listShowing: true, mapShowing: true, numPhotos: 12, isSSR: false },
		filters
	}
	try {
		const resp = await axios.post(SEARCH_LIST_URL, body, {
			headers: {
				'User-Agent': UA,
				'Origin': 'https://www.quintoandar.com.br',
				'Referer': 'https://www.quintoandar.com.br/',
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			timeout: 30000
		})
		return resp.data
	} catch(e) {
		// Attach the body we sent so debugging 400/422 doesn't require digging into network logs.
		if (e.response && e.response.status >= 400 && e.response.status < 500) {
			e.sentBody = body
		}
		throw e
	}
}

async function fetchPhotos(id) {
	const headers = {
		'User-Agent': UA,
		'Accept': 'application/json',
		'Referer': `https://www.quintoandar.com.br/imovel/${id}/comprar`
	}
	// Primary endpoint: rich categorized photos. Sometimes returns 400 with
	// "match rate is 0.0, didn't match basic categories" for listings whose
	// photos QA's categorizer can't classify. Fall back to the simpler
	// /property/{id}/photos endpoint in that case — same images, no categories.
	try {
		const resp = await axios.get(PHOTOS_URL(id), { headers, timeout: 20000 })
		if (Array.isArray(resp.data) && resp.data.length) {
			const urls = []
			const categories = {}
			for (const p of resp.data) {
				if (!p || !p.path) continue
				const url = IMG_BASE + IMG_SIZE + '/' + p.path
				urls.push(url)
				const cat = sanitizeCategoryKey((p.metadata && (p.metadata.subtitle || p.metadata.category)) || '')
				if (cat) {
					if (!categories[cat]) categories[cat] = []
					categories[cat].push(url)
				}
			}
			if (urls.length) return { urls, categories }
		}
	} catch(e) {
		// fall through to fallback
	}
	try {
		const resp = await axios.get(`https://www.quintoandar.com.br/property/${id}/photos`, { headers, timeout: 20000 })
		if (!Array.isArray(resp.data)) return null
		const urls = []
		const categories = {}
		for (const p of resp.data) {
			const key = p && (p.path || p.url)
			if (!key) continue
			const url = IMG_BASE + IMG_SIZE + '/' + key
			urls.push(url)
			const cat = sanitizeCategoryKey(p.subtitle || '')
			if (cat) {
				if (!categories[cat]) categories[cat] = []
				categories[cat].push(url)
			}
		}
		return urls.length ? { urls, categories } : null
	} catch(e) {
		return null
	}
}

function normalizeApiHit(hit) {
	const s = hit._source || {}
	const id = String(s.id || hit._id)
	const lat = (s.location && s.location.lat) || 0
	const lon = (s.location && (s.location.lon != null ? s.location.lon : s.location.lng)) || 0
	const amenities = [...(s.amenities || []), ...(s.installations || [])].map(humanizeCode).filter(Boolean)
	const amenityIdMap = {}
	;[...(s.amenities || []), ...(s.installations || [])].forEach(code => { amenityIdMap[humanizeCode(code)] = code })
	const addrParts = [s.address, s.neighbourhood, s.regionName].filter(Boolean)
	const title = `${s.type || 'Imóvel'} em ${s.neighbourhood || s.regionName || 'localização'} — ${addrParts[0] || ''}`.trim()
	return {
		id,
		title,
		type: s.type || '',
		lat: Number(lat) || 0,
		lon: Number(lon) || 0,
		price: Number(s.salePrice) || 0,
		picture_url: '',
		picture_urls: [],
		photo_categories: null,
		bedrooms: Number(s.bedrooms) || 0,
		bathrooms: Number(s.bathrooms) || 0,
		beds: 0,
		area: Number(s.area) || 0,
		parkingSpaces: Number(s.parkingSpots) || 0,
		amenities,
		amenityIdMap,
		description: s.shortSaleDescription || ''
	}
}

// SSR initial state has fully-enriched houses (12-14 with embedded photos) —
// merge them into the API results to avoid an extra photo round-trip for
// the first page.
function mergeSsrPhotos(listing, ssrHouse) {
	if (!ssrHouse || !Array.isArray(ssrHouse.photos) || !ssrHouse.photos.length) return listing
	const urls = []
	const categories = {}
	for (const p of ssrHouse.photos) {
		if (!p || !p.url) continue
		const url = IMG_BASE + IMG_SIZE + '/' + p.url
		urls.push(url)
		const cat = sanitizeCategoryKey(p.subtitle || '')
		if (cat) {
			if (!categories[cat]) categories[cat] = []
			categories[cat].push(url)
		}
	}
	if (!urls.length) return listing
	return Object.assign({}, listing, {
		picture_url: urls[0],
		picture_urls: urls,
		photo_categories: Object.keys(categories).length ? categories : null
	})
}

module.exports = {
	processPage: async function (params, callback = null) {
		Helpers.logger.log({print: 'Processing QuintoAndar listings for: '+params.jobName, channels: params.jobId+'jobUpdate'})
		if (!params.pageUrl) return
		params.startTime = Date.now()
		params.totalListingsFound = 0
		const resuming = !!params.fingerprint
		if (!resuming)
			params.fingerprint = Math.floor(Math.random() * 99999999999999) + 1
		await params.db.get('users').update({"jobs.id": params.jobId}, {"$set": {"jobs.$.fingerprint": params.fingerprint}}).catch(() => {})

		let ctx
		// Retry the SSR fetch with the same throttle backoff used for the page loop.
		// Without this, a 429 at the very first request aborts the whole job.
		let ctxAttempts = 0
		while (true) {
			try {
				ctx = await fetchSearchContext(params.pageUrl)
				break
			} catch(e) {
				const status = e.response && e.response.status
				const isThrottle = status === 429 || status === 503
				ctxAttempts++
				if (!isThrottle || ctxAttempts > 6) {
					Helpers.logger.log({print: `Failed to fetch search context (attempt ${ctxAttempts}): ${status ? 'HTTP '+status : e.message}. Giving up.`, channels: params.jobId+'jobWarning'})
					return 0
				}
				const ra = e.response.headers && (e.response.headers['retry-after'] || e.response.headers['Retry-After'])
				let retryAfterMs = 0
				if (ra) {
					const n = Number(ra)
					if (!isNaN(n)) retryAfterMs = n * 1000
					else { const t = Date.parse(ra); if (!isNaN(t)) retryAfterMs = Math.max(0, t - Date.now()) }
				}
				const base = Math.min(5 * 60 * 1000 * Math.pow(2, ctxAttempts - 1), 30 * 60 * 1000)
				const expBackoff = Math.round(base * (0.8 + Math.random() * 0.4))
				const backoff = Math.max(retryAfterMs, expBackoff)
				Helpers.logger.log({print: `SSR fetch rate-limited (HTTP ${status}, attempt ${ctxAttempts}/6). Backing off ${Math.round(backoff/1000)}s.`, channels: params.jobId+'jobWarning'})
				// Check if user cancelled job during the wait
				await Helpers.common.sleep(backoff)
				const user = await params.db.get('users').findOne({'jobs.id': params.jobId})
				const job = user && user.jobs.find(j => j.id == params.jobId)
				if (!user || !job || !job.statusCode || job.statusCode < 2) {
					Helpers.logger.log({print: `Job ${params.jobId} stopped during backoff`, channels: params.jobId+'jobUpdate'})
					return 0
				}
			}
		}
		if (!ctx.slug) {
			Helpers.logger.log({print: `URL does not match /comprar/imovel/{slug} pattern`, channels: params.jobId+'jobWarning'})
			return 0
		}
		Helpers.logger.log({print: `Slug: ${ctx.slug}, businessContext: ${ctx.businessContext}`, channels: params.jobId+'jobUpdate'})
		const hasBboxHash = /(^|[#&])bbox=/.test((params.pageUrl || '').split('#')[1] || '')
		const vp = ctx.viewport
		Helpers.logger.log({print: `Viewport source: ${hasBboxHash ? '#bbox= override (drawn shape)' : 'derived from URL slug'}; viewport=${vp ? `N${vp.north.toFixed(4)} S${vp.south.toFixed(4)} E${vp.east.toFixed(4)} W${vp.west.toFixed(4)}` : 'none'}`, channels: params.jobId+'jobUpdate'})

		// QA caps /search/list at offset 1000 (page 21 with pageSize 50). To get
		// past it we recursively subdivide the bbox into quadrants until each cell
		// has ≤1000 hits, then paginate each cell normally.
		const PER_CELL_LIMIT = 1000
		const MAX_SUBDIVISION_DEPTH = 5  // 4^5 = 1024 cells worst case
		let throttleStreak = 0  // shared across plan + scrape phases

		// Cache of filters we already learned QA rejects (e.g. unknown amenity codes
		// my URL parser invented). Used to drop them on retry across all subsequent calls.
		const droppedFilters = { amenities: false, houseTypes: false }

		function applyDroppedFilters(c) {
			if (!droppedFilters.amenities && !droppedFilters.houseTypes) return c
			const pf = Object.assign({}, c.pathFilters || {})
			if (droppedFilters.amenities) pf.amenities = []
			if (droppedFilters.houseTypes) pf.houseTypes = []
			return Object.assign({}, c, { pathFilters: pf })
		}

		// Throttle-aware fetch: catches 429/503 and waits before retrying. On a 400
		// "Invalid parameter type" (typically caused by URL-derived amenities/houseTypes
		// that aren't valid QA codes), drop those filters and retry. Other errors propagate.
		async function callList(offset, viewport, pageSize) {
			while (true) {
				try {
					const data = await fetchSearchList(applyDroppedFilters(ctx), offset, { viewport, pageSize })
					if (throttleStreak > 0) throttleStreak = Math.max(0, throttleStreak - 1)
					return data
				} catch(e) {
					const status = e.response && e.response.status
					const isThrottle = status === 429 || status === 503
					if (status === 400 && !(droppedFilters.amenities && droppedFilters.houseTypes)) {
						// Try dropping the most likely culprits one at a time
						if (!droppedFilters.amenities) {
							droppedFilters.amenities = true
							Helpers.logger.log({print: `QA rejected request (HTTP 400). Retrying without URL-derived amenities filter.`, channels: params.jobId+'jobWarning'})
						} else {
							droppedFilters.houseTypes = true
							Helpers.logger.log({print: `QA still rejecting. Retrying without URL-derived houseTypes filter.`, channels: params.jobId+'jobWarning'})
						}
						continue
					}
					if (!isThrottle) throw e
					throttleStreak++
					const ra = e.response.headers && (e.response.headers['retry-after'] || e.response.headers['Retry-After'])
					let retryAfterMs = 0
					if (ra) {
						const n = Number(ra)
						if (!isNaN(n)) retryAfterMs = n * 1000
						else { const t = Date.parse(ra); if (!isNaN(t)) retryAfterMs = Math.max(0, t - Date.now()) }
					}
					const base = Math.min(5 * 60 * 1000 * Math.pow(2, throttleStreak - 1), 30 * 60 * 1000)
					const expBackoff = Math.round(base * (0.8 + Math.random() * 0.4))
					const backoff = Math.max(retryAfterMs, expBackoff)
					Helpers.logger.log({print: `Rate-limited (HTTP ${status}, streak=${throttleStreak}). Backing off ${Math.round(backoff/1000)}s${retryAfterMs ? ` (Retry-After: ${Math.round(retryAfterMs/1000)}s)` : ''}.`, channels: params.jobId+'jobWarning'})
					await Helpers.common.sleep(backoff)
					if (await isAborted()) throw new Error('aborted')
				}
			}
		}

		async function isAborted() {
			const user = await params.db.get('users').findOne({'jobs.id': params.jobId})
			const job = user && user.jobs.find(j => j.id == params.jobId)
			return !user || !job || !job.statusCode || job.statusCode < 2
		}

		// Phase 1: plan cells via recursive bbox subdivision (BFS).
		Helpers.logger.log({print: `Planning cells via bbox subdivision...`, channels: params.jobId+'jobUpdate'})
		const cells = []
		const queue = [{ vp: ctx.viewport, depth: 0 }]
		let probeCount = 0
		while (queue.length) {
			if (await isAborted()) {
				Helpers.logger.log({print: `Job ${params.jobId} stopped during cell planning`, channels: params.jobId+'jobUpdate'})
				break
			}
			const { vp, depth } = queue.shift()
			if (!vp) continue
			Helpers.logger.log({print: `Probing cell depth=${depth} (${vp.south.toFixed(3)},${vp.west.toFixed(3)})→(${vp.north.toFixed(3)},${vp.east.toFixed(3)}) — planned=${cells.length}, queued=${queue.length}, probes=${probeCount}`, channels: params.jobId+'jobUpdate'})
			let total = 0
			try {
				// pageSize=1 has been seen to trip QA's validator on some shards; use a
				// safer minimum. We only need .hits.total, so the hit count doesn't matter.
				const probe = await callList(0, vp, 10)
				probeCount++
				total = (probe.hits && probe.hits.total && (probe.hits.total.value ?? probe.hits.total)) || 0
			} catch(e) {
				const detail = e.response ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message
				const sent = e.sentBody ? ` | sent filters: ${JSON.stringify(e.sentBody.filters).slice(0, 500)}` : ''
				Helpers.logger.log({print: `Probe failed: ${detail}.${sent} Skipping.`, channels: params.jobId+'jobWarning'})
				continue
			}
			Helpers.logger.log({print: `  → ${total} listings`, channels: params.jobId+'jobUpdate'})
			if (total === 0) continue
			if (total <= PER_CELL_LIMIT || depth >= MAX_SUBDIVISION_DEPTH) {
				if (total > PER_CELL_LIMIT) {
					Helpers.logger.log({print: `Cell at max depth still has ${total} listings — will fetch first ${PER_CELL_LIMIT} and lose the rest`, channels: params.jobId+'jobWarning'})
				}
				cells.push({ viewport: vp, total })
			} else {
				const midLat = (vp.north + vp.south) / 2
				const midLng = (vp.east + vp.west) / 2
				queue.push(
					{ vp: { north: vp.north, south: midLat, east: midLng, west: vp.west }, depth: depth + 1 },
					{ vp: { north: vp.north, south: midLat, east: vp.east, west: midLng }, depth: depth + 1 },
					{ vp: { north: midLat, south: vp.south, east: midLng, west: vp.west }, depth: depth + 1 },
					{ vp: { north: midLat, south: vp.south, east: vp.east, west: midLng }, depth: depth + 1 }
				)
			}
			await Helpers.common.sleep(Math.round(humanDelay() * 0.5))
		}
		const grandTotal = cells.reduce((a, c) => a + Math.min(c.total, PER_CELL_LIMIT), 0)
		Helpers.logger.log({print: `Plan complete: ${cells.length} cells, ~${grandTotal} listings (used ${probeCount} probe requests)`, channels: params.jobId+'jobUpdate'})

		// Phase 2: paginate each cell.
		let totalFound = 0
		let aborted = false
		let pageNum = 0
		for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
			if (await isAborted()) { aborted = true; break }
			const cell = cells[cellIdx]
			Helpers.logger.log({print: `--- Cell ${cellIdx + 1}/${cells.length} (${cell.total} listings) ---`, channels: params.jobId+'jobUpdate'})
			let offset = 0
			const cellCap = Math.min(cell.total, PER_CELL_LIMIT)
			while (offset < cellCap) {
				if (await isAborted()) { aborted = true; break }
				pageNum++
				params.pageNumber = pageNum
				let data
				try {
					data = await callList(offset, cell.viewport)
				} catch(e) {
					if (e.message === 'aborted') { aborted = true; break }
					const msg = e.response ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message
					Helpers.logger.log({print: `Cell ${cellIdx + 1} offset ${offset} failed: ${msg}. Skipping rest of cell.`, channels: params.jobId+'jobWarning'})
					break
				}
				const rawHits = (data && data.hits && data.hits.hits) || []
				if (!rawHits.length) break

				const partialCount = rawHits.filter(h => h.filtersMatchTag && h.filtersMatchTag.type === 'PARTIAL').length
				if (partialCount) {
					const sample = rawHits.find(h => h.filtersMatchTag && h.filtersMatchTag.type === 'PARTIAL')
					const meta = (sample && sample.filtersMatchTag && sample.filtersMatchTag.meta) || {}
					Helpers.logger.log({print: `${partialCount}/${rawHits.length} hits matched ${meta.matchedFilters || '?'}/${meta.totalFilters || '?'} filters (1 relaxed by QA)`, channels: params.jobId+'jobUpdate'})
				}

				const listings = rawHits.map(normalizeApiHit)
					.map(l => mergeSsrPhotos(l, ctx.ssrHouses[l.id]))
					.filter(l => l.lat && l.lon)
				if (!listings.length) break

				totalFound += listings.length
				Helpers.logger.log({print: `Cell ${cellIdx + 1}/${cells.length} offset ${offset}: ${listings.length} listings (${totalFound} cumulative)`, channels: params.jobId+'jobUpdate'})
				await module.exports.processPageListings(params, listings)

				offset += rawHits.length
				if (offset < cellCap) {
					const delay = humanDelay()
					await Helpers.common.sleep(delay)
				}
			}
		}

		if (!aborted && totalFound > 0) {
			try {
				const favoritedIds = await Helpers.common.getFavoritedAdIds(params.db)
				const result = await params.db.get('ads').remove({$and: [
					{["jobs."+params.jobId]: {$exists: true}},
					{['jobs.'+params.jobId+'.fingerprint']: {$ne: params.fingerprint}},
					{_id: {$nin: favoritedIds}}
				]})
				Helpers.logger.log({print: `Removed ${result.result.n} expired ads (preserved ${favoritedIds.length} favorited)`, channels: params.jobId+'jobUpdate'})
			} catch(err) { Helpers.logger.log({print: err, channels: params.jobId+'jobWarning'}) }
		} else if (!totalFound) {
			Helpers.logger.log({print: `Skipping expired-ads cleanup: 0 listings found this run`, channels: params.jobId+'jobWarning'})
		}

		try {
			await params.db.get('users').update({"jobs": {$elemMatch: {id: params.jobId, statusCode: 2}}}, {"$set": {"jobs.$.statusCode": 1}})
		} catch(err) { Helpers.logger.log({print: err, channels: params.jobId+'jobWarning'}) }

		Helpers.logger.log({command: 'doneProc', print: pageNum, params: {startTime: params.startTime, totalListingsFound: params.totalListingsFound}, channels: params.jobId+'command'})
		if (callback) callback(null, pageNum)
		return pageNum
	},

	processPageListings: async function (params, listings, callback = null) {
		if (params.totalListingsFound !== undefined) params.totalListingsFound += listings.length
		Helpers.logger.log({command: 'procPageNumber', print: params.pageNumber, params: {startTime: params.startTime, totalListingsFound: params.totalListingsFound}, channels: params.jobId+'command'})
		params.newAdsFound = false
		for (const listing of listings)
			await module.exports.processSingleListing(params, listing)
		Helpers.logger.log({command: 'donePageNumber', params: {refresh: params.newAdsFound, startTime: params.startTime, totalListingsFound: params.totalListingsFound}, print: params.pageNumber, channels: params.jobId+'command'})
		if (callback) callback(null, true)
		return params.newAdsFound
	},

	processSingleListing: async function (params, listing) {
		const url = `https://www.quintoandar.com.br/imovel/${listing.id}/comprar`
		try {
			const cacheHitSet = {['jobs.'+params.jobId]: {fingerprint: params.fingerprint, price: listing.price}, url}
			if (listing.price) cacheHitSet.price = listing.price
			if (listing.type) cacheHitSet.type = listing.type
			const doc = await params.db.get('ads').findOneAndUpdate({quintoandarId: listing.id}, {$set: cacheHitSet})
			if (doc) {
				const needsPhotos = params.fetchDetails && (!doc.picture_urls || doc.picture_urls.length <= 1)
				if (needsPhotos) {
					try {
						const photos = await fetchPhotos(listing.id)
						if (photos && photos.urls.length) {
							const upd = {
								picture_url: photos.urls[0],
								picture_urls: photos.urls,
								photo_categories: Object.keys(photos.categories).length ? photos.categories : null
							}
							await params.db.get('ads').update({quintoandarId: listing.id}, {$set: upd})
							Helpers.logger.log({print: `Updated photos for cached listing: ${listing.id}`, channels: params.jobId+'jobUpdate'})
						}
					} catch(e) {
						Helpers.logger.log({print: `Could not refresh photos for ${listing.id}: ${e.message}`, channels: params.jobId+'jobWarning'})
					}
				}
				Helpers.logger.log({print: 'Loading listing from cache: '+url, channels: params.jobId+'jobUpdate'})
				return
			}
		} catch(e) { console.log(e) }

		try {
			let full = listing
			if (params.fetchDetails && (!listing.picture_urls || !listing.picture_urls.length)) {
				try {
					const photos = await fetchPhotos(listing.id)
					if (photos && photos.urls.length) {
						full = Object.assign({}, listing, {
							picture_url: photos.urls[0],
							picture_urls: photos.urls,
							photo_categories: Object.keys(photos.categories).length ? photos.categories : null
						})
					}
				} catch(e) {
					Helpers.logger.log({print: `Could not fetch photos for ${listing.id}: ${e.message}`, channels: params.jobId+'jobWarning'})
				}
			}

			params.newAdsFound = true
			const title = (full.title || '').replace(/"/g, '').replace(/\\/g, '').replace(/(\r\n|\n|\r)/gm, '')
			Helpers.logger.log({print: title, channels: params.jobId+'jobUpdate'})

			params.db.get('ads').insert({
				quintoandarId: listing.id,
				price: full.price,
				lat: full.lat,
				lon: full.lon,
				url,
				title,
				type: full.type || '',
				categories: [],
				description: full.description || '',
				picture_url: full.picture_url || '',
				picture_urls: full.picture_urls || [],
				photo_categories: full.photo_categories || null,
				bedrooms: full.bedrooms || 0,
				bathrooms: full.bathrooms || 0,
				beds: 0,
				person_capacity: 0,
				area: full.area || 0,
				parkingSpaces: full.parkingSpaces || 0,
				amenities: full.amenities || [],
				amenityIdMap: full.amenityIdMap || {},
				datetime: new Date(),
				pageUrl: params.pageUrl,
				platform: 'quintoandar',
				jobs: {[params.jobId]: {fingerprint: params.fingerprint, price: full.price}}
			}, function (err, doc) {
				if (err) { Helpers.logger.log({print: `Error adding listing to DB: ${err}`, channels: params.jobId+'jobWarning'}); return }
				if (doc && Helpers.io) Helpers.io.emit('newListing', {jobId: params.jobId, listing: doc})
			})
		} catch(e) {
			Helpers.logger.log({print: `Error processing ${listing.id}: ${e}`, channels: params.jobId+'jobWarning'})
		}
	},

	// Refetch photos for cached QA ads with no/few pictures. Runs CONCURRENT
	// fetches with a small per-task delay — the photo endpoint isn't rate-
	// limited the same as /search/list, and the original scraper happily fires
	// these back-to-back inside a single page (50 listings in quick succession),
	// so we mirror that. Concurrency tunable via env var, short jitter to avoid
	// a perfectly synchronized burst.
	refetchMissingPhotos: async function (params, callback = null) {
		const jobId = params.jobId
		Helpers.logger.log({print: `Refetching photos for QA ads in job ${jobId} with no pictures...`, channels: jobId+'jobUpdate'})
		const query = {
			['jobs.'+jobId]: { $exists: true },
			platform: 'quintoandar',
			$or: [
				{ picture_urls: { $exists: false } },
				{ picture_urls: { $size: 0 } },
				{ picture_urls: { $size: 1 } }
			]
		}
		const ads = await params.db.get('ads').find(query)
		if (!ads.length) {
			Helpers.logger.log({print: `No QA ads need photo refetch.`, channels: jobId+'jobUpdate'})
			if (callback) callback(null, 0)
			return 0
		}
		const concurrency = Math.max(1, Number(process.env.QUINTOANDAR_PHOTO_CONCURRENCY) || 5)
		const perTaskDelay = Math.max(0, Number(process.env.QUINTOANDAR_PHOTO_DELAY_MS) || 200)
		Helpers.logger.log({print: `Found ${ads.length} QA ads needing photos. Refetching (concurrency=${concurrency})...`, channels: jobId+'jobUpdate'})

		let updated = 0, missing = 0, processed = 0, throttled = false
		let cursor = 0
		async function worker() {
			while (!throttled) {
				const i = cursor++
				if (i >= ads.length) return
				const ad = ads[i]
				const id = ad.quintoandarId
				if (!id) { processed++; continue }
				try {
					const photos = await fetchPhotos(id)
					if (photos && photos.urls.length > 1) {
						await params.db.get('ads').update({_id: ad._id}, {$set: {
							picture_url: photos.urls[0],
							picture_urls: photos.urls,
							photo_categories: Object.keys(photos.categories).length ? photos.categories : null
						}})
						updated++
					} else {
						missing++
					}
				} catch(e) {
					Helpers.logger.log({print: `Refetch failed for ${id}: ${e.message}`, channels: jobId+'jobWarning'})
					if (e.response && (e.response.status === 429 || e.response.status === 503)) {
						throttled = true
						Helpers.logger.log({print: `Rate-limited. Stopping refetch — partial progress preserved.`, channels: jobId+'jobWarning'})
					}
				}
				processed++
				if (processed % 25 === 0) {
					Helpers.logger.log({print: `Progress: ${processed}/${ads.length} (${updated} updated, ${missing} still missing)`, channels: jobId+'jobUpdate'})
				}
				if (perTaskDelay) await Helpers.common.sleep(Math.round(perTaskDelay * (0.7 + Math.random() * 0.6)))
			}
		}
		await Promise.all(Array.from({length: concurrency}, () => worker()))
		Helpers.logger.log({print: `Photo refetch done: ${updated} updated, ${missing} still missing, ${processed}/${ads.length} scanned.`, channels: jobId+'jobUpdate'})
		if (callback) callback(null, updated)
		return updated
	}
}
