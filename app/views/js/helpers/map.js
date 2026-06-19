function centerMapLocation(lat, lng){
  const center = new google.maps.LatLng(lat, lng)
  // using global variable:
  map.panTo(center)
}

function MongoDateFromId(objectId) {
  return new Date(parseInt(objectId.substring(0, 8), 16) * 1000)
}

var _allAmenities = new Set()
var _amenityIdMap = {}
var _savedHideAmenities = []

var _favoriteMarkerIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">' +
  '<path d="M16 0C7.2 0 0 7.2 0 16c0 10.4 16 26 16 26s16-15.6 16-26C32 7.2 24.8 0 16 0z" fill="#e74c3c" stroke="#8e1e17" stroke-width="1"/>' +
  '<path d="M16 24.5c-0.8 0-7.5-4-7.5-9.5 0-2.3 1.9-4.2 4.2-4.2 1.4 0 2.6.7 3.3 1.7.7-1 1.9-1.7 3.3-1.7 2.3 0 4.2 1.9 4.2 4.2 0 5.5-6.7 9.5-7.5 9.5z" fill="#ffffff"/>' +
  '</svg>'
)

function getMarkerIconForListing(listing) {
  if(typeof isFavorite === 'function' && isFavorite(listing._id))
    return {
      url: _favoriteMarkerIconUrl,
      scaledSize: new google.maps.Size(28, 37),
      anchor: new google.maps.Point(14, 37)
    }
  if(visitedUrls.includes(listing.url))
    return { url: "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png" }
  return { url: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png" }
}

function updateMarkerIconForListing(listingId) {
  var marker = _markers.find(function(m){ return m.listingData && m.listingData._id === listingId })
  if(!marker) return
  marker.setIcon(getMarkerIconForListing(marker.listingData))
  if(typeof isFavorite === 'function' && isFavorite(listingId) && !marker.getMap())
    marker.setMap(map)
}

function buildPopupHtml(listing) {
  var isAirbnb = listing.platform === 'airbnb'
  var isFacebook = listing.platform === 'facebook'
  var isQuintoAndar = listing.platform === 'quintoandar'
  var visitLabel = isAirbnb ? 'Airbnb'
    : isFacebook ? 'Facebook'
    : isQuintoAndar ? 'Quinto Andar'
    : 'Kijiji'
  var visitUrl = isFacebook ? 'https://www.facebook.com/marketplace/item/' + listing.facebookId + '/' : listing.url
  var html = '<div style="max-width:220px">'

  if(listing.picture_url)
    html += '<img src="'+listing.picture_url+'" style="max-width:200px;max-height:150px;border-radius:4px;margin-bottom:5px" referrerpolicy="no-referrer">'

  html += '<h4>'+listing.title+'</h4><h4>$'+getDisplayPrice(listing)+'</h4>'

  if(isAirbnb || isFacebook || isQuintoAndar) {
    var parts = []
    if(listing.bedrooms) parts.push(listing.bedrooms + ' bd')
    if(listing.beds) parts.push(listing.beds + ' beds')
    if(listing.bathrooms) parts.push(listing.bathrooms + ' ba')
    if(listing.area) parts.push(listing.area + ' m²')
    if(listing.parkingSpaces) parts.push(listing.parkingSpaces + ' parking')
    if(parts.length) html += '<p style="margin:2px 0;font-size:12px">'+parts.join(' &middot; ')+'</p>'

    if(listing.categories && listing.categories.length)
      html += '<p style="margin:2px 0;font-size:11px;color:#666">'+listing.categories.join(', ')+'</p>'

    if(listing.amenities && listing.amenities.length) {
      var hideList = getHideAmenities()
      var amenitiesForPopup = hideList.length ? listing.amenities.filter(function(a){ return hideList.indexOf(a) === -1 }) : listing.amenities
      if(amenitiesForPopup.length) {
        html += '<div style="margin:4px 0;display:flex;flex-wrap:wrap;gap:3px">'
        amenitiesForPopup.forEach(function(a){ html += '<span class="amenity-bubble">'+a+'</span>' })
        html += '</div>'
      }
      listing.amenities.forEach(function(a){ _allAmenities.add(a) })
      if(listing.amenityIdMap) Object.assign(_amenityIdMap, listing.amenityIdMap)
    }

    // Photo gallery — use facebookId / airbnbId / quintoandarId as lookup key
    var listingLookupId = listing.airbnbId || listing.facebookId || listing.quintoandarId
    var pics = listing.picture_urls || []
    if(pics.length > 1 && listingLookupId)
      html += '<button class="btn btn-xs btn-info" style="margin:4px 0;width:100%" onclick="openPhotoGallery(getListingPhotosData(\''+listingLookupId+'\'))">Photos ('+pics.length+')</button>'

    if(isAirbnb) {
      if(listing.availability)
        html += '<button class="btn btn-xs btn-warning" style="margin:4px 0;width:100%" onclick="openAvailabilityCalendar(\''+listing._id+'\')"><i class="fa fa-calendar"></i> Availability (12m)</button>'
      else
        html += '<button class="btn btn-xs btn-default" style="margin:4px 0;width:100%;opacity:0.6" disabled title="Availability data not yet fetched. Refresh listing to update."><i class="fa fa-calendar-o"></i> Availability</button>'
    }

    if(listing.seller)
      html += '<p style="margin:2px 0;font-size:11px;color:#888">Seller: '+listing.seller+'</p>'
  }

  var favColor = isFavorite(listing._id) ? '#e74c3c' : '#ccc'
  var disColor = isDisliked(listing._id) ? '#34495e' : '#ccc'
  html += '<div style="margin:4px 0;display:flex;gap:6px;align-items:center">'
  html += '<button class="btn btn-xs" data-listingid="'+listing._id+'" onclick="toggleFavoriteBtn(this)" title="Toggle favorite"><i class="fa fa-heart" style="color:'+favColor+'"></i></button>'
  html += '<button class="btn btn-xs" data-listingid="'+listing._id+'" onclick="toggleDislikeBtn(this)" title="Toggle dislike"><i class="fa fa-thumbs-down" style="color:'+disColor+'"></i></button>'
  html += '<a class="btn btn-xs btn-success" onclick="markAsViewed(null, \''+listing.url+'\')" href="'+visitUrl+'" target="_blank"><i class="fa fa-external-link"></i> '+visitLabel+'</a>'
  var seenColor = visitedUrls && visitedUrls.includes(listing.url) ? '#27ae60' : '#ccc'
  html += '<button class="btn btn-xs" data-url="'+listing.url.replace(/"/g,'&quot;')+'" onclick="toggleSeenBtn(this)" title="Toggle seen/unseen"><i class="fa fa-eye" style="color:'+seenColor+'"></i></button>'
  if(listing.lat && listing.lon)
    html += '<a class="btn btn-xs btn-default" href="https://www.google.com/maps/search/?api=1&query='+listing.lat+','+listing.lon+'" target="_blank" title="Open in Google Maps"><i class="fa fa-external-link"></i> GMaps</a>'
  html += '</div>'
  html += '<button class="btn btn-xs btn-default" style="margin:2px 0;width:100%" onclick="viewInList(\''+listing._id+'\')"><i class="fa fa-list"></i> View in list</button>'
  html += '</div>'
  return html
}

function viewInList(listingId) {
  _focusListingId = listingId
  if(typeof switchToGridMode === 'function') {
    switchToGridMode('rows')
  }
}

function scrollToFocusedListing() {
  if(!_focusListingId) return
  var listingId = _focusListingId
  _focusListingId = null
  // Ensure the listing's batch is rendered (it may be beyond the current batch)
  var idx = _gridListings.findIndex(function(a){ return a._id === listingId })
  if(idx === -1) return
  while(_gridRenderedCount <= idx) {
    renderGridBatch()
  }
  var $el = $('[data-listingid="'+listingId+'"]')
  if(!$el.length) return
  // Uncollapse if it's a row item that's collapsed
  if($el.hasClass('collapsed')) $el.removeClass('collapsed')
  var $cw = $('.content-wrapper')
  var targetScroll = $cw.scrollTop() + ($el.offset().top - $cw.offset().top) - 4
  $cw.animate({ scrollTop: targetScroll }, 300)
  // Brief highlight
  $el.css('outline', '2px solid #2196F3')
  setTimeout(function(){ $el.css('outline', '') }, 2000)
}

function getListingById(id) {
  var m = _markers.find(function(mk){ return mk.listingData && (mk.listingData.airbnbId === id || mk.listingData.facebookId === id || mk.listingData.quintoandarId === id) })
  return m ? m.listingData : null
}

function getListingPhotosData(id) {
  var listing = getListingById(id)
  if(!listing) return {urls: [], categories: null}
  var urls = (listing.picture_urls && listing.picture_urls.length) ? listing.picture_urls : (listing.picture_url ? [listing.picture_url] : [])
  return {urls: urls, categories: typeof groupPhotoCategories === 'function' ? groupPhotoCategories(listing.photo_categories) : listing.photo_categories}
}

function setMarkersByListings(map, listings, centerLocation = false) {
  if(!listings || !listings.length)
    return
  if(centerLocation)
    centerMapLocation(listings[0].lat, listings[0].lon)
  listings.forEach(listing=> {
    // Honor the active shape filter on creation — otherwise listings added
    // after the shape was drawn slip through visible until the next refresh.
    var insideShape = !hasActiveShapeFilter() || isInsideShapeFilter(listing.lat, listing.lon)
    var marker = new google.maps.Marker({
      position: new google.maps.LatLng(listing.lat, listing.lon),
      icon: getMarkerIconForListing(listing), map: insideShape ? map : null, title: listing.address, url: listing.url
    });
    marker.listingData = listing
    _markers.push(marker)
    if(!insideShape) _markersHiddenByShape.push(marker)

    if(listing.amenities) listing.amenities.forEach(function(a){ _allAmenities.add(a) })
    if(listing.amenityIdMap) Object.assign(_amenityIdMap, listing.amenityIdMap)

    bindInfoWindow(marker, map, infowindow, listing)
  })
  updateAmenityBubbles()
}

var bindInfoWindow = function(marker, map, infowindow, listing) {
  google.maps.event.addListener(marker, 'click', function() {
    infowindow.setContent(buildPopupHtml(listing))
    infowindow.open(map, marker)
    markAsViewed(marker, marker.url)
  })
  google.maps.event.addListener(marker, 'dblclick', function() {
    markAsViewed(marker, this.url)
    window.open(this.url, '_blank')
    infowindow.close()
  })
}

function markAsViewed(marker, url)
{
  if(visitedUrls.includes(url))
    return
  visitedUrls.push(url)
  localStorage.setItem('visitedUrls'+jobId, JSON.stringify(visitedUrls))
  if(!marker)
    marker = _markers.find(marker => {return marker.url === url})
  if(!marker) return true
  var listingIsFavorite = typeof isFavorite === 'function' && marker.listingData && isFavorite(marker.listingData._id)
  if(localStorage.getItem('hideMarkers')=='true' && !listingIsFavorite)
    marker.setMap(null);
  marker.setIcon(getMarkerIconForListing(marker.listingData))
  return true
}

function markAsUnviewed(marker, url)
{
  var idx = visitedUrls.indexOf(url)
  if(idx === -1) return false
  visitedUrls.splice(idx, 1)
  localStorage.setItem('visitedUrls'+jobId, JSON.stringify(visitedUrls))
  if(!marker)
    marker = _markers.find(marker => {return marker.url === url})
  if(!marker) return true
  // Re-show the marker if it had been hidden by the "hide viewed" toggle
  if(!marker.getMap() && map) marker.setMap(map)
  marker.setIcon(getMarkerIconForListing(marker.listingData))
  return true
}

function toggleSeenBtn(btn)
{
  var url = $(btn).data('url')
  if(visitedUrls.includes(url)) markAsUnviewed(null, url)
  else markAsViewed(null, url)
  // Update the icon color in place
  var seen = visitedUrls.includes(url)
  $(btn).find('i').css('color', seen ? '#27ae60' : '#ccc')
}

function getViewedMarkers(markers=null)
{
  markers = markers || _markers
  var visitedSet = new Set(visitedUrls)
  return markers.filter(function(marker){
    if(!visitedSet.has(marker.url)) return false
    if(typeof isFavorite === 'function' && marker.listingData && isFavorite(marker.listingData._id)) return false
    return true
  })
}

/*function mapCheckNewListings()
{
  let retVal = confirm("This does not remove old listings, it just listings newest one. To reset all results, click the 'Reset All Listings From Kijiji' button.")
  if(!retVal)
    return false
  $('#informationModal').modal('show')
  APIcheckLatestListings('{"jobId":"Denise"}')
  return true
}*/

function getMarkersFromListings(listings)
{
  if(!listings || (Array.isArray(listings) && listings.length==0))
    return
  if(!Array.isArray(listings))
    listings=[listings]
  if(typeof listings[0] === 'string' || listings[0] instanceof String)
    listings.forEach((l,index)=>listings[index]={url:l})
  var listingUrls = new Set(listings.map(function(l){ return l.url }))
  return _markers.filter(function(marker){ return listingUrls.has(marker.url) })
}

function isTouchScreen(){
  return 'ontouchstart' in window || navigator.maxTouchPoints || (window.DocumentTouch && document instanceof DocumentTouch)
}

function updateAmenityBubbles(){
  var andContainer = $('#amenityBubblesAnd')
  var orContainer = $('#amenityBubblesOr')
  if(!andContainer.length && !orContainer.length) return
  var andSelected = parseAmenityList($('#amenities').val())
  var orSelected = parseAmenityList($('#orAmenities').val())
  var allSorted = Array.from(_allAmenities).sort()
  var hideList = getHideAmenities()
  var sorted = hideList.length ? allSorted.filter(function(a){ return hideList.indexOf(a) === -1 }) : allSorted
  var searchTerm = ($('#amenitySearch').val() || '').toLowerCase()
  if(searchTerm) sorted = sorted.filter(function(a){ return a.toLowerCase().indexOf(searchTerm) !== -1 })
  var andHtml = '', orHtml = ''
  sorted.forEach(function(a){
    var idTooltip = _amenityIdMap[a] ? ' title="Airbnb ID: '+_amenityIdMap[a]+'"' : ''
    var isAnd = andSelected.indexOf(a) !== -1
    var isOr = orSelected.indexOf(a) !== -1
    if(isAnd)
      andHtml += '<span class="amenity-filter-bubble active"'+idTooltip+' onclick="toggleAmenityFilter(this,\'and\')" oncontextmenu="moveAmenityFilter(event,this,\'and\')">'+a+'</span>'
    else if(isOr)
      orHtml += '<span class="amenity-filter-bubble active amenity-or"'+idTooltip+' onclick="toggleAmenityFilter(this,\'or\')" oncontextmenu="moveAmenityFilter(event,this,\'or\')">'+a+'</span>'
    else
      andHtml += '<span class="amenity-filter-bubble"'+idTooltip+' onclick="toggleAmenityFilter(this,\'and\')" oncontextmenu="moveAmenityFilter(event,this,\'and\')">'+a+'</span>'
  })
  andContainer.html(andHtml)
  orContainer.html(orHtml)
}

function toggleAmenityFilter(el, group){
  var $el = $(el)
  if($el.hasClass('active')){
    $el.removeClass('active')
    syncAmenityInputs()
    updateAmenityBubbles()
  } else {
    $el.addClass('active')
    syncAmenityInputs()
    updateAmenityBubbles()
  }
}

function moveAmenityFilter(event, el, fromGroup){
  event.preventDefault()
  var name = $(el).text()
  var toGroup = fromGroup === 'and' ? 'or' : 'and'
  var fromInput = toGroup === 'or' ? '#amenities' : '#orAmenities'
  var toInput = toGroup === 'or' ? '#orAmenities' : '#amenities'
  // Remove from current group
  var fromList = parseAmenityList($(fromInput).val()).filter(function(a){ return a !== name })
  $(fromInput).val(fromList.length ? JSON.stringify(fromList) : '')
  // Add to target group
  var toList = parseAmenityList($(toInput).val())
  if(toList.indexOf(name) === -1) toList.push(name)
  $(toInput).val(toList.length ? JSON.stringify(toList) : '')
  updateAmenityBubbles()
}

function syncAmenityInputs(){
  var andSelected = [], orSelected = []
  $('#amenityBubblesAnd .amenity-filter-bubble.active').each(function(){ andSelected.push($(this).text()) })
  $('#amenityBubblesOr .amenity-filter-bubble.active').each(function(){ orSelected.push($(this).text()) })
  $('#amenities').val(andSelected.length ? JSON.stringify(andSelected) : '')
  $('#orAmenities').val(orSelected.length ? JSON.stringify(orSelected) : '')
}

function getHideAmenities(){
  return _savedHideAmenities
}

// --- Drawing tools for geographic filtering ---
var _drawnShape = null
var _shapeFilterGeo = null
var _markersHiddenByShape = []

function _extractShapeGeo(shape) {
  if(!shape) return null
  // Circle has getRadius; Rectangle has getBounds but no getRadius; Polygon has getPath.
  if(shape.getRadius) {
    var c = shape.getCenter()
    return { type: 'circle', lat: c.lat(), lng: c.lng(), radius: shape.getRadius() }
  } else if(shape.getBounds) {
    var b = shape.getBounds(), ne = b.getNorthEast(), sw = b.getSouthWest()
    return { type: 'rectangle', north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() }
  } else {
    var paths = []
    shape.getPath().forEach(function(p){ paths.push({ lat: p.lat(), lng: p.lng() }) })
    return { type: 'polygon', paths: paths }
  }
}

function hasActiveShapeFilter() {
  return !!(_drawnShape || _shapeFilterGeo)
}

function isInsideShapeFilter(lat, lon) {
  var geo = _shapeFilterGeo
  if(!geo && _drawnShape) geo = _extractShapeGeo(_drawnShape)
  if(!geo) return true
  if(geo.type === 'circle') {
    var center = new google.maps.LatLng(geo.lat, geo.lng)
    var pos = new google.maps.LatLng(lat, lon)
    return google.maps.geometry.spherical.computeDistanceBetween(pos, center) <= geo.radius
  } else if(geo.type === 'rectangle') {
    return lat <= geo.north && lat >= geo.south && lon <= geo.east && lon >= geo.west
  } else {
    var poly = new google.maps.Polygon({ paths: geo.paths })
    var pos = new google.maps.LatLng(lat, lon)
    return google.maps.geometry.poly.containsLocation(pos, poly)
  }
}

var _shapeFilterDebounceTimer = null
function _debouncedApplyShapeFilter() {
  if(_shapeFilterDebounceTimer) clearTimeout(_shapeFilterDebounceTimer)
  _shapeFilterDebounceTimer = setTimeout(applyShapeFilter, 80)
}

function _bindShapeEditListeners(shape) {
  if(shape.getRadius) {
    google.maps.event.addListener(shape, 'radius_changed', _debouncedApplyShapeFilter)
    google.maps.event.addListener(shape, 'center_changed', _debouncedApplyShapeFilter)
  } else if(shape.getBounds) {
    google.maps.event.addListener(shape, 'bounds_changed', _debouncedApplyShapeFilter)
  } else {
    google.maps.event.addListener(shape.getPath(), 'set_at', _debouncedApplyShapeFilter)
    google.maps.event.addListener(shape.getPath(), 'insert_at', _debouncedApplyShapeFilter)
  }
}

function startDrawing(){
  if(!map) { showAlertModal('Map Not Open', 'Open the map view first to draw an area.'); return }
  if(_drawnShape) clearDrawnShape()
  showDrawShapeModal(function(mode) {
    // Tell the user how the (now click-based) drawing works, since there's no
    // longer a drag-to-draw DrawingManager.
    var hint = mode === DRAW_MODE.POLYGON
      ? 'Click each corner on the map, then double-click to finish the area.'
      : 'Click two opposite points on the map to set the area.'
    $('.resultscount').html(hint)
    startCustomDraw(map, mode, { editable: true }, function(overlay){
      _drawnShape = overlay
      _shapeFilterGeo = _extractShapeGeo(_drawnShape)
      applyShapeFilter()
      _bindShapeEditListeners(_drawnShape)
      $('#drawAreaBtn').addClass('btn-primary').removeClass('btn-default')
      $('#clearShapeBtn').show()
    })
  })
}

function restoreShapeOnMap() {
  if(!_shapeFilterGeo || !map) return
  if(_drawnShape) {
    // Re-attach existing shape object
    _drawnShape.setMap(map)
    _bindShapeEditListeners(_drawnShape)
  } else {
    // Recreate from saved geometry
    var opts = { fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 2, editable: true, map: map }
    if(_shapeFilterGeo.type === 'circle') {
      _drawnShape = new google.maps.Circle(Object.assign(opts, { center: { lat: _shapeFilterGeo.lat, lng: _shapeFilterGeo.lng }, radius: _shapeFilterGeo.radius }))
    } else if(_shapeFilterGeo.type === 'rectangle') {
      _drawnShape = new google.maps.Rectangle(Object.assign(opts, { bounds: { north: _shapeFilterGeo.north, south: _shapeFilterGeo.south, east: _shapeFilterGeo.east, west: _shapeFilterGeo.west } }))
    } else {
      _drawnShape = new google.maps.Polygon(Object.assign(opts, { paths: _shapeFilterGeo.paths }))
    }
    _bindShapeEditListeners(_drawnShape)
  }
  applyShapeFilter()
  $('#drawAreaBtn').addClass('btn-primary').removeClass('btn-default')
  $('#clearShapeBtn').show()
}

function applyShapeFilter(){
  _markersHiddenByShape.forEach(function(m){ m.setMap(map) })
  _markersHiddenByShape = []
  if(!_drawnShape) return
  _shapeFilterGeo = _extractShapeGeo(_drawnShape)
  saveShapeGeo()
  _markers.forEach(function(marker){
    var pos = marker.getPosition()
    var inside = false
    if(_drawnShape.getRadius) {
      inside = google.maps.geometry.spherical.computeDistanceBetween(pos, _drawnShape.getCenter()) <= _drawnShape.getRadius()
    } else if(_drawnShape.getBounds) {
      inside = _drawnShape.getBounds().contains(pos)
    } else {
      inside = google.maps.geometry.poly.containsLocation(pos, _drawnShape)
    }
    if(!inside && marker.getMap()) {
      marker.setMap(null)
      _markersHiddenByShape.push(marker)
    }
  })
  var visibleCount = _markers.length - _markersHiddenByShape.length
  $(".resultscount").html('Last Updated: '+lastUpdated+', Number of results: '+ visibleCount + ' (area filtered)')
}

function clearDrawnShape(silent){
  if(_drawnShape) {
    _drawnShape.setMap(null)
    _drawnShape = null
  }
  _shapeFilterGeo = null
  saveShapeGeo()
  cancelCustomDraw()
  _markersHiddenByShape.forEach(function(m){ if(map) m.setMap(map) })
  _markersHiddenByShape = []
  $('#drawAreaBtn').removeClass('btn-primary').addClass('btn-default')
  $('#clearShapeBtn').hide()
  if(silent) return
  // If on grid view, reload listings without shape filter
  if(window.currentState === 'grid' && typeof loadGridListings === 'function') {
    loadGridListings($('#filtersForm').serialize())
  } else {
    $(".resultscount").html('Last Updated: '+lastUpdated+', Number of results: '+ _markers.length)
  }
}