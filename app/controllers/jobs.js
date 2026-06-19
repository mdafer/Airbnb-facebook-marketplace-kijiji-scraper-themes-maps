const Helpers = require('../helpers/includes'),
ApiStatus = Helpers.ApiStatus,
parallel = require('async/parallel'),
pick = require('lodash.pick'),
uuid = require('uuid-random')

function jobPlatform(job) { return job.platform || 'kijiji' }

function scraperFor(platform) {
	if (platform === 'airbnb') return Helpers.airbnbScraper
	if (platform === 'facebook') return Helpers.fbScraper
	if (platform === 'quintoandar') return Helpers.quintoandarScraper
	return Helpers.scraper
}

// Parses a stored amenity list. Accepts an array, a JSON-encoded array, or a
// legacy comma-separated string. Comma-fallback keeps old DB values readable.
function parseAmenityList(raw) {
	if(raw == null) return []
	if(Array.isArray(raw)) return raw.map(a => String(a)).filter(Boolean)
	let s = String(raw)
	let t = s.trim()
	if(t.charAt(0) === '[') {
		try { let arr = JSON.parse(t); if(Array.isArray(arr)) return arr.map(a => String(a)).filter(Boolean) } catch(e) {}
	}
	return s.split(',').map(a => a.trim()).filter(Boolean)
}

// Picks the oldest-queued job for a (user, platform) and runs it, but only if
// no other job is currently running for that same platform. Chains to itself
// after the job completes so queued searches on the same platform process one
// after another. Different platforms run in parallel.
async function processUserQueue(db, userId, platform) {
	try {
		const user = await db.get('users').findOne({_id: userId})
		if(!user || !user.jobs || !user.jobs.length) return
		const platJobs = user.jobs.filter(j => jobPlatform(j) === platform)
		if(platJobs.some(j => j.statusCode === 2)) return
		const queued = platJobs.filter(j => j.queuedAt).sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt))
		if(!queued.length) return
		const job = queued[0]
		await db.get('users').update(
			{_id: userId, jobs: {$elemMatch: {id: job.id, queuedAt: {$exists: true}}}},
			{"$set": {"jobs.$.statusCode": 2, "jobs.$.lastUpdated": new Date()}, "$unset": {"jobs.$.queuedAt": ""}}
		)
		const myparams = {
			db,
			jobId: job.id,
			jobUrl: job.url,
			pageUrl: job.url,
			pageNumber: 0,
			jobName: job.name,
			userId
		}
		if(job.fetchDetails !== undefined) myparams.fetchDetails = job.fetchDetails
		if(job.fetchAvailability !== undefined) myparams.fetchAvailability = job.fetchAvailability
		if(job.gridDepth) myparams.gridDepth = job.gridDepth
		const scraper = scraperFor(platform)
		;(async () => {
			let processedPages = 0
			try {
				processedPages = await scraper.processPage(myparams)
			} catch(err) {
				Helpers.logger.log({print: err, channels: job.id+'jobWarning'})
			}
			Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: job.id, pages: processedPages}, channels: userId+'command'})
			Helpers.logger.log({ command:'doneProcAndValid', print: processedPages, channels: job.id+'command'})
			processUserQueue(db, userId, platform)
		})()
	} catch(err) {
		Helpers.logger.log(err)
	}
}

module.exports = {
	processUserQueue,
	newJob: async function(params, authUser, callback){
		const platform = params.platform || 'kijiji'
		const job = {id:uuid(), statusCode:2, name:params.name, url: params.url, description: params.description, platform, lastUpdated: new Date()}
		if(params.fetchDetails !== undefined) job.fetchDetails = params.fetchDetails
		if(params.fetchAvailability !== undefined) job.fetchAvailability = params.fetchAvailability
		if(params.gridDepth) job.gridDepth = params.gridDepth
		await params.db.get('users').update({"email":authUser.email},{"$push": {"jobs":job}})
			.catch((err) => {Helpers.logger.log({print:err, channels:params.jobId+'jobWarning'});return callback({ status: Helpers.ApiStatus.DB_ERROR, meta: err})})//.then(() => db.close())
		params.jobUrl = job.url
		params.jobId = job.id
		params.pageUrl = job.url
		params.pageNumber = 0
		params.jobName = job.name
		params.userId = authUser._id
		if(job.fetchDetails !== undefined) params.fetchDetails = job.fetchDetails
		if(job.fetchAvailability !== undefined) params.fetchAvailability = job.fetchAvailability
		if(job.gridDepth) params.gridDepth = job.gridDepth
		callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'In Progress', jobUrl:job.url, jobId: job.id}})
		const scraper = scraperFor(platform)
		const pagesProcessed = await scraper.processPage(params)
		Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: job.id, pages:pagesProcessed}, channels:authUser._id+'command'})
		Helpers.logger.log({ command:'doneProcAndValid', print: pagesProcessed, channels:job.id+'command'})
		params.db.get('users').update({"jobs.id":job.id},{"$set": {"jobs.$.statusCode":1, "jobs.$.lastUpdated": new Date()}})
			.catch((err) => {Helpers.logger.log({print:err, channels:job.id+'jobWarning'})})
		processUserQueue(params.db, authUser._id, platform)
	},
	updateJob: async function(params, authUser, callback){
		try{
			let user = await params.db.get('users').findOne({"jobs.id":params.id})
			if (!user)
				return callback({ status: ApiStatus.NOT_FOUND, meta: null })
			let job = user.jobs.find(job => { return job.id == params.id})
			Object.assign(job, pick(params, ['name', 'url', 'description']))
			if(params.gridDepth !== undefined) job.gridDepth = Number(params.gridDepth) || 1
			if(params.groupId !== undefined) {
				if(params.groupId === '' || params.groupId === null) delete job.groupId
				else job.groupId = String(params.groupId)
			}
			job = await params.db.get('users').findOneAndUpdate({"jobs.id":params.id},{$set: {"jobs.$":job}})
			callback({status: ApiStatus.SUCCESS, meta: job})
		}
		catch(err) {
			Helpers.logger.log(err);return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}//.then(() => db.close())
	},
	deleteJob: async function(params, authUser, callback){
		try{
			let result = await params.db.get('ads').update({["jobs."+params.id]:{ $exists: true}},{$unset: { ["jobs."+params.id]: ""}}, {multi:true})
			/*if(result.n <1)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Ads for Job '"+params.id+"' not found"}})*/

			result = await params.db.get('users').update({"jobs.id":params.id},{$pull: {"jobs":{id:params.id}}})
			if(result.n <1)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.id+"' not found"}})
			params.db.get('ads').remove({jobs:{}},{multi:true})
			params.db.get('listingCache').remove({jobId: String(params.id)}).catch(() => {})
			return callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'Deleted', jobId: params.id}})
		}
		catch(err) {
			Helpers.logger.log(err);return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}//.then(() => db.close())
	},
	stopJob: async function(params, authUser, callback){
		try{
			const user = await params.db.get('users').findOne({"jobs.id":params.jobId})
			if(!user)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"' not found"}})
			const job = user.jobs.find(job => { return job.id == params.jobId})
			if(!job)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job not found"}})
			// Dequeue a queued job without touching its statusCode
			if(job.queuedAt && job.statusCode !== 2) {
				await params.db.get('users').update({"jobs.id":params.jobId},{"$unset": {"jobs.$.queuedAt": ""}})
				Helpers.logger.log({print:`Job ${params.jobId} dequeued`, channels:params.jobId+'jobUpdate'})
				Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: params.jobId, dequeued:true}, channels:authUser._id+'command'})
				return callback({status: Helpers.ApiStatus.SUCCESS, meta: {status:'Dequeued', jobId: params.jobId}})
			}
			if(job.statusCode !== 2)
				return callback({ status: Helpers.ApiStatus.NO_CHANGES_MADE, meta: {message:"Job is not running", jobId: params.jobId}})
			await params.db.get('users').update({"jobs.id":params.jobId},{"$set": {"jobs.$.statusCode":0, "jobs.$.lastUpdated": new Date()}})
			Helpers.logger.log({print:`Job ${params.jobId} stop requested`, channels:params.jobId+'jobUpdate'})
			Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: params.jobId, stopped:true}, channels:authUser._id+'command'})
			Helpers.logger.log({ command:'doneProcAndValid', print: 0, channels:params.jobId+'command'})
			processUserQueue(params.db, authUser._id, jobPlatform(job))
			return callback({status: Helpers.ApiStatus.SUCCESS, meta: {status:'Stopped', jobId: params.jobId}})
		}
		catch(err) {
			Helpers.logger.log(err);return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}
	},
	queueJobs: async function(params, authUser, callback){
		try{
			let jobIds = params.jobIds
			if(typeof jobIds === 'string') {
				try { jobIds = JSON.parse(jobIds) } catch(e) { jobIds = [jobIds] }
			}
			if(!Array.isArray(jobIds)) jobIds = [jobIds].filter(Boolean)
			if(!jobIds.length)
				return callback({ status: Helpers.ApiStatus.VALIDATION_ERRORS || Helpers.ApiStatus.DB_ERROR, meta: {message:"No jobIds provided"}})
			const user = await params.db.get('users').findOne({_id: authUser._id})
			if(!user)
				return callback({ status: Helpers.ApiStatus.USER_NO_LONGER_EXISTS, meta: null })
			const queued = []
			const skipped = []
			const now = new Date()
			for(const jobId of jobIds) {
				const job = (user.jobs || []).find(j => j.id == jobId)
				if(!job) { skipped.push({jobId, reason: 'not found'}); continue }
				if(job.statusCode === 2) { skipped.push({jobId, reason: 'running'}); continue }
				if(job.queuedAt) { skipped.push({jobId, reason: 'already queued'}); continue }
				await params.db.get('users').update(
					{_id: authUser._id, "jobs.id": jobId},
					{"$set": {"jobs.$.queuedAt": now}}
				)
				queued.push(jobId)
			}
			callback({status: Helpers.ApiStatus.SUCCESS, meta: {queued, skipped}})
			const platforms = new Set()
			for(const id of queued) {
				const j = user.jobs.find(j => j.id == id)
				if(j) platforms.add(jobPlatform(j))
			}
			platforms.forEach(p => processUserQueue(params.db, authUser._id, p))
		}
		catch(err) {
			Helpers.logger.log(err); return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}
	},
	resetJob: async function(params, authUser, callback){
		try {
			const user = await params.db.get('users').findOne({"jobs.id":params.jobId})
			if(!user)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"'' not found"}})
			const job = user.jobs.find(job => { return job.id == params.jobId})
			if(!job || job =="")
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job not found"}})
			if(job.statusCode==2)
				return callback({ status: Helpers.ApiStatus.JOB_ALREADY_BEING_PROCESSED, meta: {message:"Job already being processed. Please try again once it's done."}})
			const updateSet = {"jobs.$.statusCode":2, "jobs.$.lastUpdated": new Date()}
			if(params.fetchDetails !== undefined) updateSet["jobs.$.fetchDetails"] = params.fetchDetails
			if(params.fetchAvailability !== undefined) updateSet["jobs.$.fetchAvailability"] = params.fetchAvailability
			if(params.gridDepth) updateSet["jobs.$.gridDepth"] = params.gridDepth
			await params.db.get('users').update({"jobs.id":params.jobId},{"$set": updateSet, "$unset": {"jobs.$.queuedAt": ""}})
			params.jobUrl = job.url
			params.jobId = job.id
			params.pageNumber = 0
			params.pageUrl = job.url
			params.jobName = job.name
			params.userId = authUser._id
			params.fetchDetails = params.fetchDetails !== undefined ? params.fetchDetails : job.fetchDetails
			params.fetchAvailability = params.fetchAvailability !== undefined ? params.fetchAvailability : job.fetchAvailability
			params.gridDepth = params.gridDepth || job.gridDepth || null
			callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'In Progress', jobUrl:job.url, jobId: params.jobId}})
			const scraper = scraperFor(jobPlatform(job))
			await scraper.processPage(params)
			Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: params.jobId, pages:params.pageNumber}, channels:authUser._id+'command'})
				Helpers.logger.log({ command:'doneProcAndValid', print: params.pageNumber, channels:params.jobId+'command'})
			processUserQueue(params.db, authUser._id, jobPlatform(job))
		} catch(err) { Helpers.logger.log({print:err, channels:params.jobId+'jobWarning'}) }
	},
	refetchMissingPhotos: async function(params, authUser, callback){
		try {
			const user = await params.db.get('users').findOne({"jobs.id":params.jobId})
			if(!user)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"' not found"}})
			const job = user.jobs.find(j => j.id == params.jobId)
			if(!job)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job not found"}})
			const scraper = scraperFor(jobPlatform(job))
			if(!scraper.refetchMissingPhotos)
				return callback({ status: Helpers.ApiStatus.INVALID_REQUEST, meta: {message:"Photo refetch not supported for this platform"}})
			callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'Started', jobId: params.jobId}})
			// Run async; progress is logged to the job channel
			scraper.refetchMissingPhotos({ db: params.db, jobId: params.jobId, jobName: job.name })
				.catch(err => Helpers.logger.log({print: err, channels: params.jobId+'jobWarning'}))
		} catch(err) { Helpers.logger.log({print:err, channels:params.jobId+'jobWarning'}) }
	},
	clearJobAds: async function(params, authUser, callback){
		try{
			let user = await params.db.get('users').findOne({"jobs.id":params.jobId})
			if(!user)
				return callback({ status: ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"' not found"}})
			// Delete this job's cached ads so the next run scrapes from scratch — but
			// keep favorited ads (deleting them would orphan the favorite, since a
			// re-scrape recreates the ad with a new _id). Favorited listings stay
			// cached; everything else is re-fetched fresh.
			const favoritedIds = await Helpers.common.getFavoritedAdIds(params.db)
			let result = await params.db.get('ads').remove({
				$and: [
					{["jobs."+params.jobId]:{ $exists: true}},
					{ _id: { $nin: favoritedIds } }
				]
			}, {multi:true})
			// Drop any saved scroll/listing cache so the next run starts fresh.
			await params.db.get('listingCache').remove({jobId: String(params.jobId)}).catch(() => {})
			return callback({status:ApiStatus.SUCCESS, meta:{status:'Cleared', jobId: params.jobId, removed: result.result.n}})
		}
		catch(err) {
			Helpers.logger.log(err);return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}
	},
	exportSearches: async function(params, authUser, callback){
		try{
			let jobIds = params.jobIds
			if(typeof jobIds === 'string') jobIds = jobIds.split(',').map(s => s.trim()).filter(Boolean)
			if(!Array.isArray(jobIds) || !jobIds.length)
				return callback({ status: ApiStatus.INVALID_REQUEST, meta: {message:"jobIds required"}})
			const idSet = new Set(jobIds.map(String))
			const user = await params.db.get('users').findOne({_id: authUser._id})
			if(!user) return callback({ status: ApiStatus.USER_NO_LONGER_EXISTS, meta: null })
			const exportJobs = (user.jobs || [])
				.filter(j => idSet.has(String(j.id)))
				.map(j => pick(j, ['id', 'name', 'url', 'description', 'platform', 'groupId', 'gridDepth', 'fetchDetails', 'fetchAvailability', 'lastUpdated']))
			const groupIds = new Set(exportJobs.map(j => j.groupId).filter(Boolean).map(String))
			const exportGroups = (user.searchGroups || []).filter(g => groupIds.has(String(g.id)))
			const result = { version: 1, exportedAt: new Date(), jobs: exportJobs, searchGroups: exportGroups }
			const isTruthy = v => v === true || v === 'true'
			if(isTruthy(params.includeAds)) {
				const adQuery = { $or: exportJobs.map(j => ({[`jobs.${j.id}`]: {$exists: true}})) }
				const ads = adQuery.$or.length ? await params.db.get('ads').find(adQuery) : []
				ads.forEach(ad => {
					if(!ad.jobs) return
					const filtered = {}
					for(const jid of Object.keys(ad.jobs)) if(idSet.has(jid)) filtered[jid] = ad.jobs[jid]
					ad.jobs = filtered
				})
				result.ads = ads
			}
			if(isTruthy(params.includeFavorites))
				result.favorites = Array.isArray(user.favorites) ? user.favorites.slice() : []
			if(isTruthy(params.includeDislikes))
				result.dislikes = Array.isArray(user.dislikes) ? user.dislikes.slice() : []
			if(isTruthy(params.includeHideAmenities))
				result.hideAmenities = user.hideAmenities || ''
			return callback({status: ApiStatus.SUCCESS, meta: result})
		}
		catch(err) {
			Helpers.logger.log(err); return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}
	},
	importSearches: async function(params, authUser, callback){
		try{
			let payload = params.payload
			if(typeof payload === 'string') {
				try { payload = JSON.parse(payload) } catch(e) { return callback({ status: ApiStatus.INVALID_REQUEST, meta: {message:"payload is not valid JSON"}}) }
			}
			if(!payload || typeof payload !== 'object')
				return callback({ status: ApiStatus.INVALID_REQUEST, meta: {message:"payload required"}})
			const override = params.override === true || params.override === 'true'
			const incomingJobs = Array.isArray(payload.jobs) ? payload.jobs : []
			const incomingGroups = Array.isArray(payload.searchGroups) ? payload.searchGroups : []
			const incomingAds = Array.isArray(payload.ads) ? payload.ads : []
			const incomingFavorites = Array.isArray(payload.favorites) ? payload.favorites : null
			const incomingDislikes = Array.isArray(payload.dislikes) ? payload.dislikes : null
			const incomingHideAmenities = (typeof payload.hideAmenities === 'string' || Array.isArray(payload.hideAmenities)) ? payload.hideAmenities : null

			const user = await params.db.get('users').findOne({_id: authUser._id})
			if(!user) return callback({ status: ApiStatus.USER_NO_LONGER_EXISTS, meta: null })

			const stats = {
				groups: {added:0, updated:0, skipped:0},
				jobs: {added:0, updated:0, skipped:0},
				ads: {added:0, updated:0, skipped:0},
				favorites: {added:0, skipped:0},
				dislikes: {added:0, skipped:0},
				hideAmenities: {added:0, skipped:0}
			}

			const groupsById = new Map((user.searchGroups || []).map(g => [String(g.id), g]))
			for(const g of incomingGroups) {
				if(!g || !g.id) continue
				const id = String(g.id)
				const clean = { id, name: (g.name || 'Untitled').toString().slice(0, 80) }
				if(groupsById.has(id)) {
					if(override) { groupsById.set(id, clean); stats.groups.updated++ }
					else stats.groups.skipped++
				} else {
					groupsById.set(id, clean); stats.groups.added++
				}
			}

			const jobsById = new Map((user.jobs || []).map(j => [String(j.id), j]))
			for(const j of incomingJobs) {
				if(!j || !j.id) continue
				const id = String(j.id)
				const clean = pick(j, ['id', 'name', 'url', 'description', 'platform', 'groupId', 'gridDepth', 'fetchDetails', 'fetchAvailability', 'lastUpdated'])
				clean.id = id
				if(jobsById.has(id)) {
					if(override) { jobsById.set(id, clean); stats.jobs.updated++ }
					else stats.jobs.skipped++
				} else {
					jobsById.set(id, clean); stats.jobs.added++
				}
			}

			await params.db.get('users').update(
				{_id: authUser._id},
				{$set: {jobs: Array.from(jobsById.values()), searchGroups: Array.from(groupsById.values())}}
			)

			for(const ad of incomingAds) {
				if(!ad || !ad._id) { stats.ads.skipped++; continue }
				let adId
				try { adId = params.db.id(ad._id) } catch(e) { stats.ads.skipped++; continue }
				const existing = await params.db.get('ads').findOne({_id: adId})
				if(existing) {
					if(override) {
						const mergedJobs = Object.assign({}, existing.jobs || {}, ad.jobs || {})
						const { _id, ...rest } = ad
						await params.db.get('ads').update({_id: adId}, {$set: Object.assign({}, rest, {jobs: mergedJobs})})
						stats.ads.updated++
					} else {
						const updates = {}
						for(const jid of Object.keys(ad.jobs || {})) {
							if(!existing.jobs || !existing.jobs[jid]) updates['jobs.'+jid] = ad.jobs[jid]
						}
						if(Object.keys(updates).length) {
							await params.db.get('ads').update({_id: adId}, {$set: updates})
							stats.ads.updated++
						} else {
							stats.ads.skipped++
						}
					}
				} else {
					const { _id, ...rest } = ad
					await params.db.get('ads').insert(Object.assign({_id: adId}, rest))
					stats.ads.added++
				}
			}

			if(incomingFavorites) {
				const cleaned = incomingFavorites.filter(f => f != null).map(String)
				const existingSet = new Set((user.favorites || []).map(String))
				cleaned.forEach(id => {
					if(existingSet.has(id)) stats.favorites.skipped++
					else stats.favorites.added++
				})
				const finalList = override ? Array.from(new Set(cleaned)) : Array.from(new Set([...existingSet, ...cleaned]))
				await params.db.get('users').update({_id: authUser._id}, {$set: {favorites: finalList}})
			}

			if(incomingDislikes) {
				const cleaned = incomingDislikes.filter(f => f != null).map(String)
				const existingSet = new Set((user.dislikes || []).map(String))
				cleaned.forEach(id => {
					if(existingSet.has(id)) stats.dislikes.skipped++
					else stats.dislikes.added++
				})
				const finalList = override ? Array.from(new Set(cleaned)) : Array.from(new Set([...existingSet, ...cleaned]))
				await params.db.get('users').update({_id: authUser._id}, {$set: {dislikes: finalList}})
			}

			if(incomingHideAmenities !== null) {
				const incomingList = parseAmenityList(incomingHideAmenities)
				const existingList = parseAmenityList(user.hideAmenities)
				const existingSet = new Set(existingList)
				incomingList.forEach(a => {
					if(existingSet.has(a)) stats.hideAmenities.skipped++
					else stats.hideAmenities.added++
				})
				const finalList = override ? Array.from(new Set(incomingList)) : Array.from(new Set([...existingList, ...incomingList]))
				await params.db.get('users').update({_id: authUser._id}, {$set: {hideAmenities: JSON.stringify(finalList)}})
			}

			return callback({status: ApiStatus.SUCCESS, meta: stats})
		}
		catch(err) {
			Helpers.logger.log(err); return callback({ status: ApiStatus.DB_ERROR, meta: err})
		}
	},
	processPendingJobs: function(params, authUser, callback){
		Helpers.logger.log("Checking for stale pending jobs...")
		params.db.get('users').aggregate([{$unwind : "$jobs"},{$match : {"jobs.statusCode":2}},{$project : {id : "$jobs.id", url:"$jobs.url", name:'$jobs.name', platform:'$jobs.platform', resumePageUrl:'$jobs.resumePageUrl', fingerprint:'$jobs.fingerprint', resumeOffset:'$jobs.resumeOffset', fetchDetails:'$jobs.fetchDetails', fetchAvailability:'$jobs.fetchAvailability', gridDepth:'$jobs.gridDepth'}}]).then((jobs) => {
			if(!jobs || jobs.length==0)
			{
				callback({ status: Helpers.ApiStatus.NO_PENDING_JOBS, meta:{status:'In Progress', jobs}})
				Helpers.logger.log("There are no pending jobs")
				return
			}
			Helpers.logger.log(jobs.length+" pending jobs started.")
			callback({ status: Helpers.ApiStatus.SUCCESS, meta:{status:'In Progress', jobs}})
			jobs.forEach(async job=>{
				let myparams = {}
				myparams.db = params.db
				myparams.jobId = job.id
				myparams.jobUrl = job.url
				myparams.jobName = job.name
				myparams.pageNumber = 0
				myparams.pageUrl = job.resumePageUrl || job.url
				myparams.userId = job._id
				if (job.fingerprint) myparams.fingerprint = job.fingerprint
				if (job.resumeOffset) myparams.resumeOffset = job.resumeOffset
				if (job.fetchDetails !== undefined) myparams.fetchDetails = job.fetchDetails
				if (job.fetchAvailability !== undefined) myparams.fetchAvailability = job.fetchAvailability
				if (job.gridDepth) myparams.gridDepth = job.gridDepth
				if (job.resumePageUrl || job.resumeOffset)
					Helpers.logger.log(`Resuming job ${job.name} (${job.id}) from offset: ${job.resumeOffset || 0}`)
				const scraper = scraperFor(jobPlatform(job))
				const processedPages = await scraper.processPage(myparams)
				Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: job.id, pages:processedPages}, channels:authUser._id+'command'})
				Helpers.logger.log({ command:'doneProcAndValid', print: processedPages, channels:job.id+'command'})
				processUserQueue(params.db, job._id, jobPlatform(job))
			})
		}).catch((err) => {Helpers.logger.log(err)})
	},
	resumeQueues: async function(params){
		try {
			const users = await params.db.get('users').find({"jobs.queuedAt": {$exists: true}})
			if(!users || !users.length) return
			Helpers.logger.log(users.length+" user(s) with queued jobs — resuming queues.")
			users.forEach(u => {
				const platforms = new Set((u.jobs || []).filter(j => j.queuedAt).map(jobPlatform))
				platforms.forEach(p => processUserQueue(params.db, u._id, p))
			})
		} catch(err) { Helpers.logger.log(err) }
	},
	/*rebuildJob: function(params, authUser, callback){
		params.db.get('users').findOneAndUpdate({"jobs.id":params.jobId},{"$set": {"jobs.$.statusCode":2}}, {returnOriginal:true}).then((user) => {
			if(!user)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"'' not found"}})
			const job = user.jobs.find(job => { return job.id == params.jobId})
			if(!job || job =="")
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job not found"}})
			if(job.statusCode==2)
				return callback({ status: Helpers.ApiStatus.JOB_ALREADY_BEING_PROCESSED, meta: {message:"Job already being processed. Please try again once it's done."}})
			params.db.get('ads').remove({jobId:params.jobId}, {multi:true}).then(async ()=>{
				params.jobUrl = job.url
				params.jobId = job.id
				params.pageUrl = job.url
				params.jobName = job.name
				params.pageNumber = 0
				callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'In Progress', jobUrl:job.url, jobId: params.jobId}})
				await Helpers.scraper.processPage(params)
				Helpers.logger.log({ command:'doneProcAndValid', print: {jobId: params.jobId, pages:params.pageNumber}, channels:authUser._id+'command'})
				Helpers.logger.log({ command:'doneProcAndValid', print: params.pageNumber, channels:params.jobId+'command'})
			})
		}).catch((err) => {Helpers.logger.log({print:err, channels:params.jobId+'jobWarning'});return callback({ status: Helpers.ApiStatus.DB_ERROR, meta: err})})//.then(() => db.close())
	},
	checkLatestAds: function(params, authUser, callback){
		params.db.get('users').findOneAndUpdate({"jobs.id":params.jobId},{"$set": {"jobs.$.statusCode":2}}, {returnOriginal:true}).then((user) => {
			if(!user)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"'' not found"}})
			const job = user.jobs.find(job => { return job.id == params.jobId})
			if(!job || job =="")
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"' not found or is complete"}})
			if(job.statusCode==2)
				return callback({ status: Helpers.ApiStatus.JOB_ALREADY_BEING_PROCESSED, meta: {message:"Job already being processed. Please try again once it's done."}})
			params.jobId = job.id
			params.jobUrl = job.url
			params.pageNumber = 0
			params.pageUrl = job.url
			params.jobName = job.name
			Helpers.scraper.processPage(params)
			return callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'In Progress', jobUrl:job.url, jobId: params.jobId}})
		}).catch((err) => {Helpers.logger.log({print:err, channels:params.jobId+'jobWarning'});return callback({ status: Helpers.ApiStatus.DB_ERROR, meta: err})})//.then(() => db.close())
	},*/
	/*validateJobAds: function(params, authUser, callback){
		params.db.get('users').findOneAndUpdate({"jobs.id":params.jobId},{"$set": {"jobs.$.statusCode":2}}, {returnOriginal:true}).then((user) => {
			if(!user)
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job '"+params.jobId+"'' not found"}})
			const job = user.jobs.find(job => { return job.id == params.jobId})
			if(!job || job =="")
				return callback({ status: Helpers.ApiStatus.NOT_FOUND, meta: {message:"Job not found"}})
			if(job.statusCode==2)
				return callback({ status: Helpers.ApiStatus.JOB_ALREADY_BEING_PROCESSED, meta: {message:"Job already being processed. Please try again once it's done."}})
			params.jobId = job.id
			params.jobUrl = job.url
			params.jobName = job.name
			Helpers.scraper.validateJobAds({db, jobId:params.jobId})
			return callback({status:Helpers.ApiStatus.SUCCESS, meta:{status:'In Progress', jobUrl:job.url, jobId: params.jobId}})
		}).catch((err) => {Helpers.logger.log({print:err, channels:params.jobId+'jobWarning'});return callback({ status: Helpers.ApiStatus.DB_ERROR, meta: err})})//.then(() => db.close())
	},*/
}