// Kick out stale bloated JWTs left over from the pre-fix era (when the whole
// user doc was signed into the token). Oversized tokens inflate every
// Authorization header and trigger HTTP 431. Force a fresh login so the
// server can issue a slim token.
try {
	var _rawUser = localStorage.getItem('user')
	if(_rawUser) {
		var _parsed = JSON.parse(_rawUser)
		if(_parsed && _parsed.token && _parsed.token.length > 4000)
			localStorage.removeItem('user')
	}
} catch(e) { localStorage.removeItem('user') }

// Parses a stored amenity list. New format is a JSON-encoded array; legacy
// format is a comma-separated string. The JSON path preserves strings byte-
// exact because some upstream amenity titles carry meaningful leading/trailing
// whitespace that must round-trip to match the bubble label. The comma-split
// fallback trims, since comma-joined legacy values have " " after each comma.
function parseAmenityList(raw){
	if(raw == null) return []
	if(Array.isArray(raw)) return raw.map(function(a){return String(a)}).filter(Boolean)
	var s = String(raw)
	var t = s.trim()
	if(t.charAt(0) === '['){
		try { var arr = JSON.parse(t); if(Array.isArray(arr)) return arr.map(function(x){return String(x)}).filter(Boolean) } catch(e) {}
	}
	return s.split(',').map(function(x){return x.trim()}).filter(Boolean)
}

var urlParams
var jobs
var jobId
var jobName
var userId
var map
var _markers =[]
var lastUpdated ="unknown"
var visitedUrls
var mapJobId
var _favoriteIds = new Set()
var _favoritesOnly = false
var _dislikeIds = new Set()
var _hideDisliked = true
var _focusListingId = null

// --- Lazy image loading with preload offset ---
var _lazyImageObserver = null
var _scrollContainerObservers = new WeakMap()

function _createLazyObserver(root, margin) {
	return new IntersectionObserver(function(entries) {
		entries.forEach(function(entry) {
			if(entry.isIntersecting) {
				var img = entry.target
				if(img.dataset.src) {
					img.src = img.dataset.src
					img.removeAttribute('data-src')
				}
				entry.target._lazyObs.unobserve(img)
			}
		})
	}, { root: root || null, rootMargin: margin + 'px' })
}

function initLazyImageObserver() {
	if(_lazyImageObserver) return
	var offset = (window.APP_CONFIG && APP_CONFIG.LAZY_LOAD_OFFSET_PX) || 500
	_lazyImageObserver = _createLazyObserver(null, offset)
	_lazyImageObserver._margin = offset
}

function observeLazyImages(container) {
	initLazyImageObserver()
	var offset = _lazyImageObserver._margin || 500
	var imgs = (container || document).querySelectorAll('img[data-src]')
	for(var i = 0; i < imgs.length; i++) {
		var img = imgs[i]
		// Find if this image is inside a horizontal scroll container
		var scrollParent = img.closest('.grid-row-images')
		if(scrollParent) {
			// Use a per-container observer so rootMargin works for horizontal scroll
			if(!_scrollContainerObservers.has(scrollParent)) {
				var obs = _createLazyObserver(scrollParent, offset)
				_scrollContainerObservers.set(scrollParent, obs)
			}
			var obs = _scrollContainerObservers.get(scrollParent)
			img._lazyObs = obs
			obs.observe(img)
		} else {
			img._lazyObs = _lazyImageObserver
			_lazyImageObserver.observe(img)
		}
	}
}

$(document).ready(function($) {
	$( "#loginButton" ).click(function() {
	switchRegister()
	});
	
	$(".clickable-row").click(function() {
		window.location = $(this).data("href")
	});
});

$('#loginForm').on('submit', function(event) {
	event.preventDefault();
	if($('#loginTitle').text() == 'Login')
		APIlogin($("#loginForm").serializeObject(), function(params){
			$("#loginModal").off("hide.bs.modal");
			//$('#loginModal').modal('hide')
			renderpage()
		})
	else if($('#loginTitle').text() == 'Register')
		APIregister($('#loginForm').serializeObject(), function(params){
			$("#loginModal").off("hide.bs.modal");
			//$('#loginModal').modal('hide')
			renderpage()
		})
	else//forgot password
		resetPassReq($("#loginForm").serializeObject())
});

$('#profileForm').on('submit', function(event) {
	event.preventDefault();
	var data = JSON.parse($('#profileForm').serializeObject())
	// Always include fbEmail so it can be cleared
	if(data.fbEmail === undefined) data.fbEmail = ''
	APIupdateProfile(JSON.stringify(data), ()=>{
		$('#profileModal').modal('hide');
		setTimeout(()=>{renderpage()},100)
	})
});

$('#profileModal').on('show.bs.modal', function(){
	var bubblesDiv = $('#profileHideAmenityBubbles')
	bubblesDiv.html('<small style="color:#999">Loading amenities...</small>')
	APIgetProfile(null, function(user){
		$('#profileFbEmail').val(user.fbEmail || '')
		$('#profileFbPassword').val('')
		var savedHA = parseAmenityList(user.hideAmenities)
		// Normalize legacy comma-joined values to JSON so unedited saves
		// round-trip without shattering names that contain commas.
		$('#profileHideAmenities').val(savedHA.length ? JSON.stringify(savedHA) : '')
		if(!user.jobs || !user.jobs.length) {
			bubblesDiv.html('<small style="color:#999">No searches found</small>')
			return
		}
		// Fetch amenities from all jobs
		var allAmenities = new Set()
		var allIdMap = {}
		var pending = user.jobs.length
		user.jobs.forEach(function(job){
			APIgetJobAmenities(job.id, function(data){
				if(data && data.amenities) data.amenities.forEach(function(a){ allAmenities.add(a) })
				if(data && data.amenityIdMap) Object.assign(allIdMap, data.amenityIdMap)
				pending--
				if(pending <= 0) {
					var sorted = Array.from(allAmenities).sort()
					if(!sorted.length) {
						bubblesDiv.html('<small style="color:#999">No amenities found across searches</small>')
						return
					}
					var html = ''
					sorted.forEach(function(a){
						var idTooltip = allIdMap[a] ? ' title="Airbnb ID: '+allIdMap[a]+'"' : ''
						var active = savedHA.indexOf(a) !== -1
						html += '<span class="amenity-filter-bubble amenity-hide'+(active?' active':'')+'"'+idTooltip+' onclick="toggleProfileHideAmenity(this)">'+a+'</span>'
					})
					bubblesDiv.html(html)
				}
			})
		})
	})
});

function toggleProfileHideAmenity(el){
	$(el).toggleClass('active')
	var selected = []
	$('#profileHideAmenityBubbles .amenity-filter-bubble.active').each(function(){ selected.push($(this).text()) })
	$('#profileHideAmenities').val(selected.length ? JSON.stringify(selected) : '')
	updateProfileAmenityBulkLabel()
}

function filterProfileAmenityBubbles(){
	var term = ($('#profileAmenitySearch').val() || '').toLowerCase()
	$('#profileHideAmenityBubbles .amenity-filter-bubble').each(function(){
		var match = !term || $(this).text().toLowerCase().indexOf(term) !== -1
		$(this).toggle(match)
	})
	updateProfileAmenityBulkLabel()
}

// Shows the bulk-select button when a search term is active and there are
// visible bubbles. Label flips to "Deselect all matching" once every visible
// bubble is already active, so the same button also clears the current match.
function updateProfileAmenityBulkLabel(){
	var term = ($('#profileAmenitySearch').val() || '').trim()
	var $visible = $('#profileHideAmenityBubbles .amenity-filter-bubble:visible')
	if(!term || !$visible.length) { $('#profileAmenityBulkActions').hide(); return }
	var activeCount = $visible.filter('.active').length
	var allActive = activeCount === $visible.length
	$('#profileAmenityBulkLabel').text(allActive ? 'Deselect all matching' : 'Select all matching')
	$('#profileAmenityBulkActions').show()
}

function toggleSelectAllVisibleHideAmenities(){
	var $visible = $('#profileHideAmenityBubbles .amenity-filter-bubble:visible')
	if(!$visible.length) return
	var allActive = $visible.filter('.active').length === $visible.length
	$visible.toggleClass('active', !allActive)
	var selected = []
	$('#profileHideAmenityBubbles .amenity-filter-bubble.active').each(function(){ selected.push($(this).text()) })
	$('#profileHideAmenities').val(selected.length ? JSON.stringify(selected) : '')
	updateProfileAmenityBulkLabel()
}

// Shows a spinner + "Loading…" in the results count element while a fetch
// is in flight. Callers overwrite .resultscount on success, so this only
// needs to paint once before the AJAX starts.
function showResultsLoading(label) {
	$('.resultscount').html('<i class="fa fa-spinner fa-spin" style="margin-right:6px"></i>' + (label || 'Loading results...'))
}

// Renders shimmer skeleton placeholders into the grid container. Mode is
// 'cards' or 'rows'; defaults to _gridMode. Cleared automatically when the
// grid re-renders (renderGrid empties #gridContainer).
function showGridSkeleton(mode, count) {
	var container = document.getElementById('gridContainer')
	if(!container) return
	mode = mode || (typeof _gridMode !== 'undefined' ? _gridMode : 'cards')
	count = count || 8
	var html = ''
	if(mode === 'cards') {
		html = '<div class="grid-cards">'
		for(var i = 0; i < count; i++) {
			html += '<div class="skel-card">' +
				'<div class="skel-card-img skeleton"></div>' +
				'<div class="skel-card-body">' +
					'<div class="skel-line skeleton w-80"></div>' +
					'<div class="skel-line skeleton w-60"></div>' +
					'<div class="skel-line skeleton w-40"></div>' +
				'</div>' +
			'</div>'
		}
		html += '</div>'
	} else {
		html = '<div class="grid-rows">'
		for(var j = 0; j < count; j++) {
			html += '<div class="skel-row">' +
				'<div class="skel-row-thumb skeleton"></div>' +
				'<div class="skel-row-body">' +
					'<div class="skel-line skeleton w-60"></div>' +
					'<div class="skel-line skeleton w-80"></div>' +
					'<div class="skel-line skeleton w-40"></div>' +
				'</div>' +
			'</div>'
		}
		html += '</div>'
	}
	container.innerHTML = html
}

// Overlays a translucent "Loading pins…" pill on the map. The map div must
// have position:relative for absolute-positioned children to anchor to it.
function showMapLoadingOverlay(label) {
	var mapEl = document.getElementById('map')
	if(!mapEl) return
	if($(mapEl).css('position') === 'static') $(mapEl).css('position', 'relative')
	$('#mapLoadingOverlay').remove()
	var html = '<div id="mapLoadingOverlay" class="map-loading-overlay">' +
		'<div class="map-loading-pill"><i class="fa fa-spinner fa-spin"></i>' + (label || 'Loading pins...') + '</div>' +
	'</div>'
	$(mapEl).append(html)
}

function hideMapLoadingOverlay() {
	$('#mapLoadingOverlay').remove()
}

// --- Favorites helpers ---
function loadFavoriteIds() {
	APIgetProfile(null, function(user){
		_favoriteIds = new Set(user.favorites || [])
	})
}

function isFavorite(listingId) {
	return _favoriteIds.has(listingId)
}

function toggleFavorite(listingId, callback) {
	if(isFavorite(listingId)) {
		_favoriteIds.delete(listingId)
		APIremoveFavorite(listingId, function(){ if(callback) callback(false) })
	} else {
		_favoriteIds.add(listingId)
		APIaddFavorite(listingId, function(){ if(callback) callback(true) })
	}
}

function toggleFavoriteBtn(el) {
	var listingId = $(el).data('listingid')
	toggleFavorite(listingId, function(isFav) {
		$(el).find('i').css('color', isFav ? '#e74c3c' : '#ccc')
		if(typeof updateMarkerIconForListing === 'function')
			updateMarkerIconForListing(listingId)
	})
}

// --- Dislikes helpers ---
function loadDislikeIds() {
	APIgetDislikes(function(ids){
		_dislikeIds = new Set(ids || [])
	})
}

function isDisliked(listingId) {
	return _dislikeIds.has(listingId)
}

function toggleDislike(listingId, callback) {
	if(isDisliked(listingId)) {
		_dislikeIds.delete(listingId)
		APIremoveDislike(listingId, function(){ if(callback) callback(false) })
	} else {
		_dislikeIds.add(listingId)
		APIaddDislike(listingId, function(){ if(callback) callback(true) })
	}
}

function toggleDislikeBtn(el) {
	var $el = $(el)
	var listingId = $el.data('listingid')
	toggleDislike(listingId, function(isDis) {
		$el.find('i').css('color', isDis ? '#34495e' : '#ccc')
		// Remove from view when: dislike-hide filter is active and user just disliked,
		// OR user just un-disliked while viewing the dislikes page.
		var onDislikesPage = window.currentState === 'dislikes'
		if((_hideDisliked && isDis) || (onDislikesPage && !isDis)) {
			if(typeof _markers !== 'undefined' && _markers.length) {
				var m = _markers.find(function(mk){ return mk.listingData && mk.listingData._id === listingId })
				if(m) {
					m.setMap(null)
					if(typeof infowindow !== 'undefined' && infowindow) infowindow.close()
				}
			}
			var $row = $('.grid-card[data-listingid="'+listingId+'"], .grid-row-item[data-listingid="'+listingId+'"]')
			$row.remove()
			if(typeof _gridListings !== 'undefined') {
				var idx = _gridListings.findIndex(function(a){ return a._id === listingId })
				if(idx !== -1) {
					_gridListings.splice(idx, 1)
					if(typeof _gridRenderedCount !== 'undefined' && _gridRenderedCount > idx) _gridRenderedCount--
				}
			}
		}
	})
}

function logout()
{
	try{
	    var auth2 = gapi.auth2.getAuthInstance()
	    auth2.signOut().then(function () {
	      console.log('Google User signed out.')
	    });
	}
	catch{}
	clearLocalStorage()
	clearGlobalVars()
	renderpage()
}

function clearGlobalVars()
{
	_markers = []
	jobs= null
	jobId =null
	jobName = null
	userId = null
	map = null
	lastUpdated ="unknown"
	visitedUrls = null
	mapJobId = null
	_favoriteIds = new Set()
	_favoritesOnly = false
	_dislikeIds = new Set()
	_hideDisliked = true
	_focusListingId = null
	_favJobIds = []
	_shapeFilterGeo = null
	_drawnShape = null
	_currentSort = { field: 'price', dir: 'asc' }
}
function clearLocalStorage()
{
	localStorage.removeItem('user')
	localStorage.removeItem('jobId')
	localStorage.removeItem('jobName')
	clearSavedSettings()
}

//Fix bug with validator and submission in modals
$(document).on('show.bs.modal', '.modal', function (e) {
	let mymodal = e.currentTarget;
	$(mymodal).find('form[data-toggle=validator]').validator('destroy')
	$(mymodal).find('form[data-toggle=validator]').validator()
	$('form').on('submit', function() {
		return false
	})
	toggleModal(this.id)
})

$(document).on('hide.bs.modal', '.modal', function (e) {
	toggleModal(this.id, true)
	$('form').on('submit', function() {
	return false;
	})
})

$.fn.serializeObject = function()
{
	let viewArr = this.serializeArray()
	let view={}
	for (var i in viewArr) {
		if(viewArr[i].value)
			view[viewArr[i].name] = viewArr[i].value
	}
	return JSON.stringify(view);
}

function switchRegister()
{
	$('.registration-group').show()
	$('.registration-group input').attr('required', true)
	$('.login-group').hide()
	$('#loginTitle').text('Register')
	$('#loginButton').text('Login')
	$('#loginButton').off()
	$('.passwordBox').show()
	$( "#loginButton" ).click(function() {
	switchLogin()
	});
}

function switchLogin()
{
	$('.registration-group').hide()
	$('.registration-group input').removeAttr('required')
	$('.login-group').show()
	$('#loginTitle').text('Login')
	$('#loginButton').text('Register')
	$('#loginButton').off()
	$('.passwordBox').show()
	$( "#loginButton" ).click(function() {
	switchRegister();
	});
}

function switchPassReset()
{
	$('.registration-group').hide()
	$('.login-group').hide()
	$('.passwordBox').hide()
	$('#loginTitle').text('Reset Password')
	$('#loginButton').text('Login')
	$('#loginButton').off()
	$( "#loginButton" ).click(function() {
		switchLogin()
	});
}

//Server Side Validation
/*for (var key in errors) {
	$('input[name="' + key + '"]').closest('.form-group')
	.addClass('has-error')
	.find('.help-block.with-errors')
		.text(errors[key])
}*/

//Facebook login start
(function(d, s, id) {
	var js, fjs = d.getElementsByTagName(s)[0]
	if (d.getElementById(id)) return
	js = d.createElement(s)
	js.id = id
	js.src = 'https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v3.1&appId=Facebook-App-Id-Here&autoLogAppEvents=1'
	fjs.parentNode.insertBefore(js, fjs)
}(document, 'script', 'facebook-jssdk'))

function FBStatusChangeCallback(response) {
	// The response object is returned with a status field that lets the
	// app know the current login status of the person.
	// Full docs on the response object can be found in the documentation
	// for FB.getLoginStatus().
	if (response.status === 'connected') {
		// Logged into your app and Facebook.
		FBLogin(response.authResponse)
	} else {
		// The person is not logged into your app or we are unable to tell.
		alert('Sorry, we were unable to log you in.')
	}
}

function checkFBLoginState() {
	if(!window.isNative)
	{
	FB.getLoginStatus(function(response) {
		FBStatusChangeCallback(response)
	});
	}
}

window.addEventListener('message', message => {
	if(window.isNative && message.data.indexOf('login_button_dialog_open')!=-1)
	{
	window.postMessage(JSON.stringify({action:"facebookLoginClicked", meta:null}),'*')
	}
});

//Facebook Login end

//Google Login Start

function GoogleLoginClicked()
{
	if(window.isNative)
	{
	window.postMessage(JSON.stringify({action:"googleLoginClicked", meta:null}),'*')
	}
}


function checkGoogleLoginState(googleUser) {
	if(!window.isNative)
	{ 
	if(googleUser.Zi && googleUser.Zi.access_token)
		GoogleLogin({accessToken: googleUser.Zi.access_token})
	else
		alert('Sorry, we were unable to log you in.')
	}
}

function parseQueryParams(query) {
	var vars = query.split("&")
	var query_string = {}
	for (var i = 0; i < vars.length; i++) {
	var pair = vars[i].split("=")
	var key = decodeURIComponent(pair[0].replace(/\+/g, ' '))
	var value = decodeURIComponent(pair[1].replace(/\+/g, ' '))
	// If first entry with this name
	if (typeof query_string[key] === "undefined") {
		query_string[key] = decodeURIComponent(value.replace(/\+/g, ' '))
		// If second entry with this name
	} else if (typeof query_string[key] === "string") {
		var arr = [query_string[key], decodeURIComponent(value.replace(/\+/g, ' '))]
		query_string[key] = arr;
		// If third or later entry with this name
	} else
		query_string[key].push(decodeURIComponent(value.replace(/\+/g, ' ')))
	}
	return query_string
}

// --- Persistent settings (localStorage) ---
var _persistKeys = ['fromPrice','toPrice','fromDate','availableFrom','availableTo','searchText','searchTitleOnly','minBedrooms','minBathrooms','minBeds','minSqMeters','minParking','propertyType','categorySearch','minPhotos','amenities','orAmenities']

function saveFilters() {
	var filters = {}
	_persistKeys.forEach(function(key) {
		var el = document.getElementById(key)
		if(!el) return
		if(el.type === 'checkbox') filters[key] = el.checked ? el.value : ''
		else filters[key] = el.value || ''
	})
	localStorage.setItem('savedFilters', JSON.stringify(filters))
}

function restoreFilters() {
	var raw = localStorage.getItem('savedFilters')
	if(!raw) return
	try { var filters = JSON.parse(raw) } catch(e) { return }
	_persistKeys.forEach(function(key) {
		var val = filters[key]
		if(val === undefined) return
		var el = document.getElementById(key)
		if(!el) return
		if(el.type === 'checkbox') el.checked = !!val
		else el.value = val
	})
	// Sync minPhotos checkbox with hidden input
	if(filters.minPhotos) {
		$('#minPhotos').val(filters.minPhotos)
		$('#minPhotosCheck').prop('checked', true)
	}
	// QA image-size setting is stored separately (not a filter) — sync the dropdown
	var qaSize = localStorage.getItem('qaImageSize')
	if(qaSize) $('#qaImageSize').val(qaSize)
}

function saveShapeGeo() {
	if(_shapeFilterGeo) localStorage.setItem('savedShapeGeo', JSON.stringify(_shapeFilterGeo))
	else localStorage.removeItem('savedShapeGeo')
}

function restoreShapeGeo() {
	var raw = localStorage.getItem('savedShapeGeo')
	if(!raw) return
	try { _shapeFilterGeo = JSON.parse(raw) } catch(e) { _shapeFilterGeo = null }
}

function saveGridMode() {
	localStorage.setItem('savedGridMode', _gridMode)
}

function restoreGridMode() {
	var saved = localStorage.getItem('savedGridMode')
	if(saved) _gridMode = saved
}

function saveSort() {
	if(_currentSort) localStorage.setItem('savedSort', JSON.stringify(_currentSort))
	else localStorage.removeItem('savedSort')
}

function restoreSort() {
	var raw = localStorage.getItem('savedSort')
	if(!raw) return
	try { _currentSort = JSON.parse(raw) } catch(e) { _currentSort = { field: 'price', dir: 'asc' } }
}

function saveFavoritesOnly() {
	localStorage.setItem('savedFavoritesOnly', _favoritesOnly ? '1' : '')
}

function restoreFavoritesOnly() {
	_favoritesOnly = !!localStorage.getItem('savedFavoritesOnly')
}

function saveHideDisliked() {
	localStorage.setItem('savedHideDisliked', _hideDisliked ? '1' : '0')
}

function restoreHideDisliked() {
	var raw = localStorage.getItem('savedHideDisliked')
	if(raw === null) _hideDisliked = true
	else _hideDisliked = raw === '1'
}

function clearSavedSettings() {
	localStorage.removeItem('savedFilters')
	localStorage.removeItem('savedShapeGeo')
	localStorage.removeItem('savedGridMode')
	localStorage.removeItem('savedSort')
	localStorage.removeItem('savedFavoritesOnly')
	localStorage.removeItem('savedHideDisliked')
}

// Returns the numeric price to display for a listing in the current view.
// Airbnb prices vary by search (date range), so each search records its own
// price under listing.jobs[jobId].price. When multiple searches are in view,
// show the cheapest. Falls back to the top-level listing.price.
function getDisplayPrice(listing) {
	if(!listing) return 0
	var jobs = listing.jobs
	var fallback = listing.price || 0
	if(!jobs || typeof jobs !== 'object') return fallback

	var ids = null
	if(typeof _favoritesOnly !== 'undefined' && _favoritesOnly && typeof _favJobIds !== 'undefined' && _favJobIds && _favJobIds.length)
		ids = _favJobIds
	else if(jobId === 'multi')
		ids = getMultiJobIds()
	else if(jobId === 'all')
		ids = Object.keys(jobs)
	else if(jobId)
		ids = [jobId]

	if(!ids || !ids.length) return fallback

	var prices = []
	for(var i=0;i<ids.length;i++) {
		var j = jobs[ids[i]]
		if(j && typeof j.price === 'number' && j.price > 0) prices.push(j.price)
	}
	if(!prices.length) return fallback
	return Math.min.apply(null, prices)
}

// Reads multi-job IDs from URL params first (for sharable links), falls back
// to localStorage for state set by viewSelectedSearches before a reload.
function getMultiJobIds() {
	try {
		if(typeof urlParams === 'object' && urlParams && urlParams.jobIds) {
			var raw = String(urlParams.jobIds)
			var fromUrl = raw.split(',').map(function(s){return s.trim()}).filter(Boolean)
			if(fromUrl.length) return fromUrl
		}
	} catch(e) {}
	try {
		var cached = JSON.parse(localStorage.getItem('multiJobIds') || '[]')
		return Array.isArray(cached) ? cached : []
	} catch(e) { return [] }
}

// Applies URL params onto the filters form / sort / flags so that opening a
// share link reproduces the sender's view. Call AFTER restoreFilters/restoreSort
// so URL params take precedence over the viewer's saved state. If the URL
// carries any share-specific params, the viewer's own filter state is cleared
// first so the link is authoritative instead of merging with local state.
function applyUrlParamsToFilters() {
	if(typeof urlParams !== 'object' || !urlParams) return
	var shareKeys = _persistKeys.concat(['sort','favoritesOnly','hideDisliked','jobIds'])
	var isShareLink = shareKeys.some(function(k){ return urlParams[k] != null })
	if(isShareLink) {
		_persistKeys.forEach(function(key) {
			var el = document.getElementById(key)
			if(!el) return
			if(el.type === 'checkbox') el.checked = false
			else el.value = ''
		})
		$('#minPhotosCheck').prop('checked', false)
		_currentSort = { field: 'price', dir: 'asc' }
		_favoritesOnly = false
	}
	_persistKeys.forEach(function(key) {
		var val = urlParams[key]
		if(val == null) return
		var el = document.getElementById(key)
		if(!el) return
		if(el.type === 'checkbox') el.checked = !!val
		else el.value = val
	})
	if(urlParams.minPhotos) {
		$('#minPhotos').val(urlParams.minPhotos)
		$('#minPhotosCheck').prop('checked', true)
	}
	if(urlParams.sort) {
		var parts = String(urlParams.sort).split(':')
		if(parts.length === 2 && parts[0] && (parts[1] === 'asc' || parts[1] === 'desc'))
			_currentSort = { field: parts[0], dir: parts[1] }
	}
	if(urlParams.favoritesOnly === '1' || urlParams.favoritesOnly === 'true') _favoritesOnly = true
	if(urlParams.hideDisliked === '0' || urlParams.hideDisliked === 'false') _hideDisliked = false
	else if(urlParams.hideDisliked === '1' || urlParams.hideDisliked === 'true') _hideDisliked = true
}

// Serializes the current filter form + sort + flags into a shareable URL for
// the given page. Includes jobIds for multi-search views.
function buildShareUrl(page) {
	var base = location.href.split('#')[0]
	var params = {}
	if(jobId) params.jobId = jobId
	if(jobName) params.jobName = jobName
	if(jobId === 'multi') {
		var ids = getMultiJobIds()
		if(ids.length) params.jobIds = ids.join(',')
	}
	_persistKeys.forEach(function(key) {
		var el = document.getElementById(key)
		if(!el) return
		var val = el.type === 'checkbox' ? (el.checked ? el.value : '') : (el.value || '')
		if(val !== '' && val != null) params[key] = val
	})
	if(typeof _currentSort !== 'undefined' && _currentSort && _currentSort.field && _currentSort.dir)
		params.sort = _currentSort.field + ':' + _currentSort.dir
	if(_favoritesOnly) params.favoritesOnly = '1'
	if(typeof _hideDisliked !== 'undefined' && _hideDisliked === false) params.hideDisliked = '0'
	var qs = Object.keys(params).map(function(k){
		return encodeURIComponent(k) + '=' + encodeURIComponent(params[k])
	}).join('&')
	return base + '#' + (page || 'grid') + (qs ? '?' + qs : '')
}

function copyTextToClipboard(text) {
	if(navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(text).catch(function(){ return _legacyCopyText(text) })
	}
	return Promise.resolve(_legacyCopyText(text))
}

function _legacyCopyText(text) {
	var ta = document.createElement('textarea')
	ta.value = text
	ta.style.position = 'fixed'
	ta.style.top = '-1000px'
	document.body.appendChild(ta)
	ta.select()
	try { document.execCommand('copy') } catch(e) {}
	document.body.removeChild(ta)
}

function shareCurrentView() {
	var state = window.currentState
	var page = (state === 'map' || state === 'grid') ? state : 'grid'
	var url = buildShareUrl(page)
	copyTextToClipboard(url).then(function(){
		var $btn = $('#shareViewBtn')
		var orig = $btn.html()
		$btn.html('<i class="fa fa-check"></i> Copied!').addClass('btn-success').removeClass('btn-default')
		setTimeout(function(){ $btn.html(orig).removeClass('btn-success').addClass('btn-default') }, 1800)
	})
}

function hasActiveFilters() {
	var raw = localStorage.getItem('savedFilters')
	if(raw) {
		try {
			var filters = JSON.parse(raw)
			for(var i = 0; i < _persistKeys.length; i++) {
				if(filters[_persistKeys[i]]) return true
			}
		} catch(e) {}
	}
	if(typeof hasActiveShapeFilter === 'function' && hasActiveShapeFilter()) return true
	if(_favoritesOnly) return true
	return false
}

function updateFilterIndicator() {
	var active = hasActiveFilters()
	$('#filtersBtn').toggleClass('btn-primary', !active).toggleClass('filters-active', active)
	$('#clearFiltersBtn').toggle(active)
}

function clearAllFilters() {
	_persistKeys.forEach(function(key) {
		var el = document.getElementById(key)
		if(!el) return
		if(el.type === 'checkbox') el.checked = false
		else el.value = ''
	})
	$('#minPhotosCheck').prop('checked', false)
	if(typeof clearDrawnShape === 'function') clearDrawnShape(true)
	_favoritesOnly = false
	$('#favFilterBtn').removeClass('btn-primary').addClass('btn-default')
	_hideDisliked = true
	saveHideDisliked()
	$('#dislikeFilterBtn').removeClass('btn-default').addClass('btn-primary')
	localStorage.removeItem('savedFilters')
	localStorage.removeItem('savedShapeGeo')
	localStorage.removeItem('savedFavoritesOnly')
	$('.amenity-filter-bubble.active').not('.amenity-hide').removeClass('active')
	if(typeof syncAmenityInputs === 'function') syncAmenityInputs()
	updateFilterIndicator()
	if(window.currentState === 'map' && typeof getListingsAsync === 'function')
		getListingsAsync($('#filtersForm').serialize(), true)
	else if(window.currentState === 'grid' && typeof loadGridListings === 'function')
		loadGridListings($('#filtersForm').serialize())
	else if(typeof getListingsAsync === 'function')
		getListingsAsync($('#filtersForm').serialize())
}

// --- Shared modal helpers ---

/**
 * Show a reusable confirm modal.
 * @param {string} title
 * @param {string} message  (HTML allowed)
 * @param {function} onConfirm  called when user confirms
 * @param {object} [opts]   { confirmLabel, confirmClass, cancelLabel }
 */
function showConfirmModal(title, message, onConfirm, opts) {
	opts = opts || {}
	var confirmLabel = opts.confirmLabel || 'Confirm'
	var confirmClass = opts.confirmClass || 'btn-primary'
	var cancelLabel = opts.cancelLabel || 'Cancel'
	$('#sharedConfirmModalTitle').text(title)
	$('#sharedConfirmModalBody').html(message)
	$('#sharedConfirmModalBtn')
		.attr('class', 'btn ' + confirmClass)
		.text(confirmLabel)
		.off('click')
		.on('click', function() {
			$('#sharedConfirmModal').modal('hide')
			if(typeof onConfirm === 'function') onConfirm()
		})
	$('#sharedConfirmModal').modal('show')
}

/**
 * Show a simple alert/info modal.
 * @param {string} title
 * @param {string} message  (HTML allowed)
 */
function showAlertModal(title, message) {
	$('#sharedAlertModalTitle').text(title)
	$('#sharedAlertModalBody').html(message)
	$('#sharedAlertModal').modal('show')
}

// --- Library-free drawing engine -------------------------------------------
// Google removed google.maps.drawing (DrawingManager + OverlayType) in Maps JS
// v3.65 (~May 2026). We reimplement the interactive drawing it provided using
// native map click/mousemove events, producing the SAME core overlays
// (google.maps.Rectangle/Circle/Polygon — still part of core Maps) that the
// rest of the app already consumes. So _extractShapeGeo / getQuintoBbox / the
// shape filter all keep working unchanged. See the project memory note
// "google-maps-drawing-library-removed".
//
// Interaction (the map fires click/mousemove/dblclick but NOT mousedown/mouseup,
// so drag-to-draw isn't possible — we use clicks instead):
//   rectangle: click one corner, click the opposite corner
//   circle:    click the center, click a point on the edge
//   polygon:   click each vertex, double-click to finish
var DRAW_MODE = { CIRCLE: 'circle', POLYGON: 'polygon', RECTANGLE: 'rectangle' }
var _activeDraw = null

function _drawBoundsLiteral(a, b) {
	return {
		north: Math.max(a.lat(), b.lat()), south: Math.min(a.lat(), b.lat()),
		east: Math.max(a.lng(), b.lng()), west: Math.min(a.lng(), b.lng())
	}
}

// Cancel any in-progress draw, discarding its (unfinished) preview overlay.
function cancelCustomDraw() {
	if(_activeDraw) { _activeDraw.cleanup(); _activeDraw = null }
}

// Begin drawing `mode` on `map`. On completion, calls onComplete(overlay) with a
// finished, editable+draggable google.maps.{Rectangle|Circle|Polygon}.
function startCustomDraw(map, mode, opts, onComplete) {
	cancelCustomDraw()
	if(!map || !window.google || !google.maps) return null
	// clickable:false is essential while drawing: once the preview shape grows
	// under the cursor, a clickable overlay would swallow the map's click/mousemove
	// events (so the second click never reaches the map to finish, and the preview
	// updates in choppy jumps). finish() restores clickability on the final shape.
	var style = Object.assign({ fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 2, clickable: false }, opts || {})
	var listeners = []
	var preview = null, anchor = null, polyPath = null
	var prevCursor = map.get('draggableCursor')
	var prevDblZoom = map.get('disableDoubleClickZoom')
	map.setOptions({ draggableCursor: 'crosshair', disableDoubleClickZoom: true })

	function on(target, ev, fn) { listeners.push(google.maps.event.addListener(target, ev, fn)) }
	function cleanup() {
		listeners.forEach(function(l){ google.maps.event.removeListener(l) })
		listeners = []
		if(preview) { preview.setMap(null); preview = null }
		map.setOptions({ draggableCursor: prevCursor || null, disableDoubleClickZoom: !!prevDblZoom })
	}
	function finish(shape) {
		preview = null            // keep the final shape — cleanup() must not remove it
		cleanup()
		_activeDraw = null
		shape.setOptions({ editable: true, draggable: true, clickable: true })
		shape.setMap(map)
		if(typeof onComplete === 'function') onComplete(shape)
	}

	if(mode === DRAW_MODE.RECTANGLE) {
		on(map, 'click', function(e){
			if(!anchor) {
				anchor = e.latLng
				preview = new google.maps.Rectangle(Object.assign({}, style, { map: map, bounds: _drawBoundsLiteral(anchor, anchor) }))
			} else {
				preview.setBounds(_drawBoundsLiteral(anchor, e.latLng))
				finish(preview)
			}
		})
		on(map, 'mousemove', function(e){ if(anchor && preview) preview.setBounds(_drawBoundsLiteral(anchor, e.latLng)) })
	} else if(mode === DRAW_MODE.CIRCLE) {
		on(map, 'click', function(e){
			if(!anchor) {
				anchor = e.latLng
				preview = new google.maps.Circle(Object.assign({}, style, { map: map, center: anchor, radius: 1 }))
			} else {
				preview.setRadius(google.maps.geometry.spherical.computeDistanceBetween(anchor, e.latLng))
				finish(preview)
			}
		})
		on(map, 'mousemove', function(e){
			if(anchor && preview) preview.setRadius(Math.max(1, google.maps.geometry.spherical.computeDistanceBetween(anchor, e.latLng)))
		})
	} else { // POLYGON
		polyPath = new google.maps.MVCArray()
		preview = new google.maps.Polygon(Object.assign({}, style, { map: map, paths: polyPath }))
		// Commit each click as a vertex immediately. A finishing double-click fires
		// two click events at the same spot (so two near-identical trailing
		// vertices) followed by dblclick — we drop one duplicate and close.
		on(map, 'click', function(e){ polyPath.push(e.latLng) })
		on(map, 'dblclick', function(){
			var n = polyPath.getLength()
			if(n >= 2) polyPath.removeAt(n - 1)
			if(polyPath.getLength() >= 3) finish(preview)
		})
	}
	_activeDraw = { cleanup: cleanup }
	return { cancel: cancelCustomDraw }
}

/**
 * Show the draw-shape selection modal.
 * @param {function} onSelect  called with the chosen DRAW_MODE value
 */
function showDrawShapeModal(onSelect) {
	// If another modal is already open, stack on top of it (Bootstrap doesn't
	// auto-handle nested modals — both modal and its backdrop need a higher
	// z-index than the underlying modal+backdrop, or the second one renders behind).
	var $existing = $('.modal.in, .modal.show').not('#drawShapeModal')
	if ($existing.length) {
		var baseZ = Math.max.apply(null, $existing.map(function(){ return parseInt($(this).css('z-index'), 10) || 1050 }).get())
		$('#drawShapeModal').css('z-index', baseZ + 20)
		$('#drawShapeModal').one('shown.bs.modal', function() {
			$('.modal-backdrop').not('.stacked-backdrop').last().addClass('stacked-backdrop').css('z-index', baseZ + 10)
		})
		$('#drawShapeModal').one('hidden.bs.modal', function() {
			$('.modal-backdrop.stacked-backdrop').removeClass('stacked-backdrop')
			$('#drawShapeModal').css('z-index', '')
		})
	}
	$('#drawShapeModal').modal('show')
	$('#drawShapeCircleBtn').off('click').on('click', function() {
		$('#drawShapeModal').modal('hide')
		if(typeof onSelect === 'function') onSelect(DRAW_MODE.CIRCLE)
	})
	$('#drawShapePolygonBtn').off('click').on('click', function() {
		$('#drawShapeModal').modal('hide')
		if(typeof onSelect === 'function') onSelect(DRAW_MODE.POLYGON)
	})
	$('#drawShapeRectangleBtn').off('click').on('click', function() {
		$('#drawShapeModal').modal('hide')
		if(typeof onSelect === 'function') onSelect(DRAW_MODE.RECTANGLE)
	})
}