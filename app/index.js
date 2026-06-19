require('dotenv').config()
const express = require('express'),
	app     = express(),
	http = require('http').Server(app),
	socketio = require('socket.io'),
	SocketServer = socketio.Server || socketio,
	io = new SocketServer(http, { cors: { origin: '*' } }),
	Helpers = require('./helpers/includes.js').initialize(io),
	validator = require('validator'),
	{ check, validationResult } = require('express-validator'),
	//Models = require('./models/includes'),
	Controllers = require('./controllers/includes'),
	//MongoDB
	monk = require('monk'),
	db = monk('mongo:27017/kijiji_maps',{
		username : process.env.MONGODB_USERNAME,
		password : process.env.MONGODB_PASSWORD
	})

// Shared state for manual response flow (soft-block bypass)
Helpers.pendingManualResponses = new Map() // requestId -> {resolve, reject}

// Active CAPTCHA sessions — requestId -> { page }
Helpers.captchaSessions = new Map()

// Active live page-view streams — jobId -> stop()
Helpers.scrapeStreams = new Map()

io.on('connection', (socket) => {
	socket.on('manualResponse', (data) => {
		const pending = Helpers.pendingManualResponses.get(data.requestId)
		if (pending) {
			Helpers.pendingManualResponses.delete(data.requestId)
			pending.resolve(data.json)
		}
	})
	socket.on('manualResponseError', (data) => {
		const pending = Helpers.pendingManualResponses.get(data.requestId)
		if (pending) {
			Helpers.pendingManualResponses.delete(data.requestId)
			pending.reject(new Error(data.error || 'Manual response error'))
		}
	})
	socket.on('captchaClick', async (data) => {
		const session = Helpers.captchaSessions.get(data.requestId)
		if (session && session.page) {
			try { await session.page.mouse.click(data.x, data.y) } catch(e) {}
		}
	})
	socket.on('captchaKey', async (data) => {
		const session = Helpers.captchaSessions.get(data.requestId)
		if (session && session.page) {
			try {
				// Printable characters are inserted verbatim; named keys (Enter,
				// Backspace, Tab, arrows…) are pressed so the sign-in form that
				// Facebook shows after the CAPTCHA can be typed into remotely.
				if (data.text) await session.page.keyboard.sendCharacter(data.text)
				else if (data.key) await session.page.keyboard.press(data.key)
			} catch(e) {}
		}
	})
	// User closed the live page-view panel — stop streaming frames for that job.
	socket.on('stopScrapeStream', (data) => {
		const stop = Helpers.scrapeStreams.get(data && data.jobId)
		if (stop) stop()
	})
})

db.then(() => {
	Helpers.logger.log('Connected to database')
})

app.get('/config.js', (req, res) => {
	res.type('application/javascript');
	res.send(`var APP_CONFIG = { GOOGLE_MAPS_KEY: "${process.env.GOOGLE_MAPS_KEY || ''}", LAZY_LOAD_OFFSET_PX: ${parseInt(process.env.LAZY_LOAD_OFFSET_PX) || 500} };`);
});

app.use(express.static('views'));
// support parsing of application/json type post data
app.use(express.json({ limit: '100mb' }))
//support parsing of application/x-www-form-urlencoded post data
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.get('*', (req, res, next) => {
	if(req.query)
		req.body = Object.assign(req.body, req.query);
	next();
});

app.all('*', (req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	if (req.method === 'OPTIONS') {
		logger.log('OPTIONS SUCCESS');
		return res.end();
	}
	req.body.db = db;
	Helpers.router.authorize(req, res, next);//next is called inside
});


app.use(express.static(__dirname + 'views/dashboard'))


// //////router CODE Start/////////////
app.get('/markers', function(req, res, next){
	check('jobId').trim().escape().isLength({ min: 2 })
	Helpers.router.finish(req, res, Controllers.map.getMarkers);
});

app.get('/jobAmenities', function(req, res, next){
	check('jobId').trim().escape().isLength({ min: 2 })
	Helpers.router.finish(req, res, Controllers.map.getJobAmenities);
});


app.post('/favorite', [
		check('adId').exists().trim().escape()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.favorites.addFavorite);
});

app.post('/unfavorite', [
		check('adId').exists().trim().escape()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.favorites.removeFavorite);
});

app.get('/favorites', function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.favorites.getFavorites);
});

app.post('/dislike', [
		check('adId').exists().trim().escape()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.dislikes.addDislike);
});

app.post('/undislike', [
		check('adId').exists().trim().escape()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.dislikes.removeDislike);
});

app.get('/dislikes', function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.dislikes.getDislikes);
});

app.get('/dislikedListings', function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.dislikes.getDislikedAds);
});

app.post('/user', [
  		check('firstName').trim().escape().isLength({ min: 2 }),
  		check('lastName').trim().escape().isLength({ min: 2 }),
  		check('email').isEmail().normalizeEmail(),
  		check('password').exists().isLength({ min: 8 })
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.users.newUser);
})

app.patch('/user', [
		check('firstName').optional().trim().escape(),
		check('lastName').optional().trim().escape(),
  		check('email').optional().isEmail().normalizeEmail(),
  		check('password').optional().isLength({ min: 8 }),
  		check('hideAmenities').optional()
	],function(req, res, next){
	Helpers.router.finish(req, res, Controllers.users.updateUser);
});

app.get('/user', function(req, res, next){
	Helpers.router.finish(req, res, Controllers.users.getUser);
});

app.post('/login',[
  		check('email').isEmail().normalizeEmail(),
  		check('password').exists().isLength({ min: 8 })
	], function(req, res, next){
	Helpers.router.finish(req, res, Controllers.users.login);
});

app.get('/emitTest', function(req, res, next){
	Helpers.router.finish(req, res, Controllers.socket.emitTest);
});

app.put('/job', [
  		check('name').trim().escape().isLength({ min: 1 }),
  		check('url').exists().isLength({ min: 20 }).custom(v => validator.isURL(v, {protocols: ['https'],require_protocol:true, host_whitelist:['www.kijiji.ca','kijiji.ca','www.airbnb.ca','airbnb.ca','www.airbnb.com','airbnb.com','www.facebook.com','facebook.com','www.quintoandar.com.br','quintoandar.com.br']})),
  		check('platform').optional().trim().escape().isIn(['kijiji', 'airbnb', 'facebook', 'quintoandar']),
  		check('description').trim().escape(),
  		check('fetchDetails').optional().toBoolean(),
  		check('fetchAvailability').optional().toBoolean(),
  		check('gridDepth').optional().isInt({min:1, max:4}).toInt()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.newJob);
})

app.patch('/job', [
		check('id').exists(),
		check('name').optional().trim().escape(),
  		check('url').optional().isLength({ min: 20 }).custom(v => validator.isURL(v, {protocols: ['https'],require_protocol:true, host_whitelist:['www.kijiji.ca','kijiji.ca','www.airbnb.ca','airbnb.ca','www.airbnb.com','airbnb.com','www.facebook.com','facebook.com','www.quintoandar.com.br','quintoandar.com.br']})),
  		check('description').optional().trim().escape(),
  		check('groupId').optional({nullable:true, checkFalsy:false}).trim().escape()
	],function(req, res, next){
	Helpers.router.finish(req, res, Controllers.jobs.updateJob);
});

app.patch('/searchGroups', function(req, res, next){
	Helpers.router.finish(req, res, Controllers.users.updateSearchGroups);
});

app.post('/resetJob', [
  		check('jobId').exists(),
  		check('fetchDetails').optional().toBoolean(),
  		check('fetchAvailability').optional().toBoolean(),
  		check('gridDepth').optional().isInt({min:1, max:4}).toInt()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.resetJob);
});

app.post('/refetchMissingPhotos', [
		check('jobId').exists()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.refetchMissingPhotos);
});

app.post('/deleteJob', [
  		check('id').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.deleteJob);
});

app.post('/stopJob', [
  		check('jobId').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.stopJob);
});

app.post('/queueJobs', [
		check('jobIds').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.queueJobs);
});

/*app.post('/rebuildJob', [
  		check('jobId').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.rebuildJob);
});*/

app.post('/clearJobListings', [
  		check('jobId').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.clearJobAds);
});

app.post('/exportSearches', [
		check('jobIds').exists()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.exportSearches);
});

app.post('/importSearches', [
		check('payload').exists()
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.importSearches);
});

app.post('/checkLatestListings', [
  		check('jobId').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.checkLatestAds);
});

app.post('/validateJobListings', [
  		check('jobId').exists(),
	], function(req, res, next) {
	Helpers.router.finish(req, res, Controllers.jobs.validateJobAds);
});


Helpers.logger.log('Magic happens on port '+process.env.LISTENER_PORT);
http.listen(process.env.LISTENER_PORT);

Controllers.jobs.processPendingJobs({db},{},()=>{})
Controllers.jobs.resumeQueues({db})