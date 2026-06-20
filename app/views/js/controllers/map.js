function initMap(params) {
  if(!map || !mapJobId || mapJobId != jobId)
  {

    mapJobId = jobId
    map = new google.maps.Map(document.getElementById('map'), {
      center: new google.maps.LatLng(43.5890, -79.6441),
      zoom: 8,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    })
    infowindow =  new google.maps.InfoWindow({
      disableAutoPan: true,
      content: ''
    })
    // Close infowindow when clicking on the map background
    map.addListener('click', function() {
      infowindow.close()
    })
    /*Search box*/
    var input = document.getElementById("pac-input")
    var searchBox = new google.maps.places.SearchBox(input)
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(input)

    // Bias the SearchBox results towards current map's viewport.
    map.addListener("bounds_changed", function() {
      searchBox.setBounds(map.getBounds())
    });
    searchBox.addListener("places_changed", function() {
    var places = searchBox.getPlaces()

    if (places.length == 0) {
      return;
    }

    // For each place, get the icon, name and location.
    var bounds = new google.maps.LatLngBounds()
    places.forEach(function(place) {
      if (!place.geometry) {
        console.log("Returned place contains no geometry")
        return;
      }

      if (place.geometry.viewport)
          // Only geocodes have viewport.
          bounds.union(place.geometry.viewport)
      else
          bounds.extend(place.geometry.location)
      });
      map.fitBounds(bounds)
    });

    $('#map').height(function(index, height) {
      var cw = $('.content-wrapper')
      return cw.innerHeight() - ($(this).offset().top - cw.offset().top + cw.scrollTop())
    })
  }
  else
  {
    $('#pac-input').remove()
    $('#map').replaceWith(map.getDiv())
    $('#map').height(function(index, height) {
      var cw = $('.content-wrapper')
      return cw.innerHeight() - ($(this).offset().top - cw.offset().top + cw.scrollTop())
    })
  }
  //params.forceAllMarkers = true
  showResultsLoading('Loading pins...')
  getListingsAsync(params, true)

  localStorage.setItem('hideMarkers', false)

  // Restore shape filter if it was active before switching views
  if(hasActiveShapeFilter()) {
    restoreShapeOnMap()
  }
}

function getListingsAsync(params, centerMapLocation=false)
{
  showResultsLoading('Loading pins...')
  showMapLoadingOverlay('Loading pins...')
  //async
  APIgetListings(params, function(listingsResult){
    if(listingsResult.length)
      lastUpdated = moment(MongoDateFromId(listingsResult[listingsResult.length-1]._id)).tz("America/Toronto").format("YYYY-MM-DD hh:mm a z")
    else
      lastUpdated = "Unknown"
    var resultUrls = new Set(listingsResult.map(function(l){ return l.url }))
    var markerUrls = new Set(_markers.map(function(m){ return m.url }))
    var expiredMarkers = _markers.filter(function(m){ return !resultUrls.has(m.url) })
    if(expiredMarkers.length)
      clearMapMarkers(expiredMarkers)
    var newListings = listingsResult.filter(function(l){ return !markerUrls.has(l.url) })
    if(newListings.length)
      setMarkersByListings(map, newListings, centerMapLocation)
    // Re-apply the area filter now that the markers exist. On view restore the shape
    // is drawn (and applyShapeFilter runs) before listings finish loading async, so
    // that first pass filtered an empty set — without this, restored markers show
    // unfiltered. applyShapeFilter sets its own "(area filtered)" results count.
    if(typeof hasActiveShapeFilter === 'function' && hasActiveShapeFilter() && typeof applyShapeFilter === 'function') {
      applyShapeFilter()
    } else {
      $(".resultscount").html('Last Updated: '+lastUpdated+', Number of results: '+ _markers.length || 0)
    }
    hideMapLoadingOverlay()
  });
}

function hideViewedMarkers()
{
  //event.preventDefault()
  localStorage.setItem('hideMarkers', true)
  $("#hideViewedbtn").attr("onclick","showViewedMarkers()")
  $("#hideViewedbtn").attr('data-original-title', "Click to show viewed listings").tooltip('show')
  $("#hideViewedicon").removeClass('fa-eye')
  $("#hideViewedicon").addClass('fa-eye-slash')
  if(!visitedUrls || !visitedUrls.length)
    return
  const viewedMarkers = getViewedMarkers()
  clearMapMarkers(getViewedMarkers(), false)
  $(".resultscount").html('Last Updated: '+lastUpdated+', Number of results: '+ (_markers.length - viewedMarkers.length))
}

function showViewedMarkers()
{
  //event.preventDefault()
  localStorage.setItem('hideMarkers', false)
  getViewedMarkers().forEach(marker => marker.setMap(map));
  $("#hideViewedbtn").attr("onclick","hideViewedMarkers()")
  $("#hideViewedbtn").attr('data-original-title', "Click to hide viewed listings").tooltip('show')
  $("#hideViewedicon").removeClass('fa-eye-slash')
  $("#hideViewedicon").addClass('fa-eye')
  $(".resultscount").html('Last Updated: '+lastUpdated+', Number of results: '+ _markers.length || 0)
}

function clearMapMarkers(markers='all', removeFromGlobalMarkers=true)
{
  if(!markers)
    return
  if(markers == 'all')
    markers = _markers
  for(let i=0;i<markers.length;i++)
    markers[i].setMap(null)
  if(removeFromGlobalMarkers) {
    var removeUrls = new Set(markers.map(function(m){ return m.url }))
    _markers = _markers.filter(function(el){ return !removeUrls.has(el.url) })
    if(!_markers.length) { _allAmenities = new Set(); _amenityIdMap = {} }
  }
  $(".resultscount").html('Last Updated: '+lastUpdated+', Number of results: '+ _markers.length)
}

function download(content, fileName, contentType) {
    var a = document.createElement("a")
    var file = new Blob([content], {type: contentType})
    a.href = URL.createObjectURL(file)
    a.download = fileName
    a.click()
}
function saveViewed()
{
  download(localStorage.getItem('visitedUrls'+jobId), 'Viewed Listings List for '+jobName+'.txt', 'text/plain')
}

function updateViewedList(e) {
  let loadedList = JSON.parse(e.target.result);
  if(!loadedList || !loadedList.length)
    return

  if(!visitedUrls || !visitedUrls.length)
  {
    localStorage.setItem('visitedUrls'+jobId, JSON.stringify(loadedList))
    visitedUrls = loadedList
  }
  else
  {
    let concatinated = loadedList.concat(visitedUrls)
    let uniqueList = concatinated.filter((item, pos) => {return concatinated.indexOf(item) === pos})
    localStorage.setItem('visitedUrls'+jobId, JSON.stringify(uniqueList))
    visitedUrls = uniqueList
  }
  _markers.forEach(marker=> {
    if(visitedUrls.includes(marker.url))
      marker.icon.url = "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png"
  })
  hideViewedMarkers()
  showViewedMarkers()
}

function rebuildViewedList()
{
  showConfirmModal(
    'Re-index Viewed Listings',
    'Are you sure you want to re-index the viewed listings list for this search?',
    function() {
      if(!visitedUrls || !visitedUrls.length) return
      let uniqueList = visitedUrls.filter(LocalUrl => {return _markers.some(marker => marker.url == LocalUrl)})
      localStorage.setItem('visitedUrls'+jobId, JSON.stringify(uniqueList))
    },
    { confirmLabel: 'Re-index', confirmClass: 'btn-warning' }
  )
}

function resetJob()
{
  refreshUrlParams()
  var detectedPlatform = urlParams.platform
    || localStorage.getItem('platform')
    || (_markers.length && _markers[0].listingData && _markers[0].listingData.platform)
    || null
  var platformName = (detectedPlatform === 'airbnb') ? 'Airbnb' : (detectedPlatform === 'facebook') ? 'Facebook' : 'Kijiji'
  var isAirbnb = detectedPlatform === 'airbnb'
  $('#refreshListingsModal').remove()
  var airbnbExtrasHtml = isAirbnb ? `
    <div style="margin-top:14px">
      <div class="form-group">
        <label style="font-weight:600">Grid Splits <i class="fa fa-question-circle BStooltip" style="cursor:help" data-placement="top" title="Splits the map area into smaller cells to find more listings. Depth 1 = 4 cells, 2 = 16 cells, 3 = 64 cells, 4 = 256 cells. Dense areas auto-split further if results are capped."></i></label>
        <input id="refreshGridDepth" type="number" min="1" max="4" class="form-control" placeholder="1 (default)" value="1">
      </div>
      <div class="checkbox"><label><input type="checkbox" id="refreshFetchDetails" value="1"> Fetch full photos &amp; amenities <small class="text-muted">(slower — visits each listing page)</small></label></div>
      <div class="checkbox"><label><input type="checkbox" id="refreshFetchAvailability" value="1"> Fetch availability calendar</label></div>
      <div class="checkbox"><label><input type="checkbox" id="refreshAutoConfirmEmpty" value="1"> Auto confirm no listings <small class="text-muted">(skip soft-block prompts)</small></label></div>
    </div>` : ''
  var modalHtml = `
  <div id="refreshListingsModal" class="modal fade" role="dialog" style="display:none">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <button type="button" class="close" data-dismiss="modal">&times;</button>
          <h4 class="modal-title"><i class="fa fa-refresh" style="color:#5cb85c;margin-right:7px"></i>Refresh Listings</h4>
        </div>
        <div class="modal-body">
          <p>Update listings for this search from <strong>${platformName}</strong>?</p>
          ${airbnbExtrasHtml}
        </div>
        <div class="modal-footer">
          <div class="pull-left"><button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button></div>
          <div class="pull-right"><button type="button" id="refreshListingsConfirmBtn" class="btn btn-success"><i class="fa fa-refresh"></i> Refresh</button></div>
        </div>
      </div>
    </div>
  </div>`
  $('body').append(modalHtml)
  $('#refreshListingsModal .BStooltip').tooltip({ trigger: 'hover', container: 'body' })
  if(isAirbnb && window._airbnbAutoConfirmEmpty) $('#refreshAutoConfirmEmpty').prop('checked', true)
  $('#refreshListingsConfirmBtn').on('click', function() {
    var params = {jobId}
    if(isAirbnb) {
      params.fetchDetails = $('#refreshFetchDetails').is(':checked')
      params.fetchAvailability = $('#refreshFetchAvailability').is(':checked')
      params.gridDepth = Number($('#refreshGridDepth').val()) || 1
      if(typeof setAutoConfirmEmpty === 'function')
        setAutoConfirmEmpty($('#refreshAutoConfirmEmpty').is(':checked'))
    }
    $('#refreshListingsModal').modal('hide')
    $('#informationModal').modal('show')
    APIresetJob(JSON.stringify(params))
  })
  $('#refreshListingsModal').on('hidden.bs.modal', function(){ $(this).remove() })
  $('#refreshListingsModal').modal('show')
}

function mapClearInformationWindow()
{
  // Explicit user clear (trash button): wipe the persistent buffer too.
  if (window._infoMessages) window._infoMessages.length = 0
  $('#informationStatus').text('')
  $('#informationStatus2').text('')
  if (typeof renderInfoMessages === 'function') { renderInfoMessages(); return }
  $("#messages").html(
    `<div class="row" style="max-width:100%">
      <div class="col-xs-3 text-center" style="padding:0">
        Time
      </div>
      <div class="col-xs-9 text-center">
        Message
      </div>
    </div>`
)}

/*function mapCheckNewListings()
{
  let retVal = confirm("This does not remove old listings, it just listings newest one. To reset all results, click the 'Reset All Listings From Kijiji' button.")
  if(!retVal)
    return false
  $('#informationModal').modal('show')
  APIcheckLatestListings('{"jobId":"Denise"}')
  return true
}*/

function openPhotoGallery(data)
{
  var html = ''
  // Support both flat array (legacy) and {urls, categories} object
  var urls, cats
  if(Array.isArray(data)) {
    urls = data; cats = null
  } else {
    urls = data.urls || []; cats = data.categories
  }

  if(cats && Object.keys(cats).length) {
    // Separate multi-pic categories from single-pic categories
    var multiCats = {}, singleCats = {}
    Object.keys(cats).forEach(function(cat) {
      if(cats[cat].length > 1) multiCats[cat] = cats[cat]
      else singleCats[cat] = cats[cat]
    })

    // Render multi-pic categories normally
    Object.keys(multiCats).forEach(function(cat) {
      html += '<div class="gallery-category">'
      html += '<h3 class="gallery-cat-title">'+cat+'</h3>'
      html += '<div class="gallery-cat-grid">'
      multiCats[cat].forEach(function(url) {
        html += '<img class="gallery-thumb" src="'+upgradeQaImageUrl(url, 'auto')+'" referrerpolicy="no-referrer" onclick="openPhotoZoom(this)">'
      })
      html += '</div></div>'
    })

    // Combine single-pic categories into one row with overlaid labels
    var singleKeys = Object.keys(singleCats)
    if(singleKeys.length) {
      html += '<div class="gallery-category">'
      html += '<h3 class="gallery-cat-title">Other Photos</h3>'
      html += '<div class="gallery-cat-grid">'
      singleKeys.forEach(function(cat) {
        var url = singleCats[cat][0]
        html += '<div class="gallery-thumb-labeled">'
        html += '<img class="gallery-thumb" src="'+upgradeQaImageUrl(url, 'auto')+'" referrerpolicy="no-referrer" onclick="openPhotoZoom(this)">'
        html += '<span class="gallery-thumb-label">'+cat+'</span>'
        html += '</div>'
      })
      html += '</div></div>'
    }
  } else {
    urls.forEach(function(url){
      html += '<img class="gallery-thumb" src="'+upgradeQaImageUrl(url, 'auto')+'" referrerpolicy="no-referrer" onclick="openPhotoZoom(this)">'
    })
  }
  $('#photoGalleryContent').html(html)
  // Reset scroll AFTER making the element displayable — scrollTop is a no-op
  // on display:none elements, so fadeIn alone would let the previous scroll
  // position persist.
  $('#photoGalleryOverlay').css({display:'block', opacity:0}).scrollTop(0).animate({opacity:1}, 200)
  $('body').css('overflow','hidden')
  _applyGalleryThumbScale()
}

// --- Gallery thumbnail zoom (grid view, separate from single-image zoom) ---
var _galleryThumbScale = (function() {
  var s = parseFloat(localStorage.getItem('galleryThumbScale'))
  return isFinite(s) && s > 0 ? s : 1
})()
var GALLERY_THUMB_BASE = 200  // matches CSS grid-template-columns minmax base
var GALLERY_THUMB_MIN = 0.5
var GALLERY_THUMB_MAX = 4
var GALLERY_THUMB_STEP = 0.25

function _applyGalleryThumbScale()
{
  var size = Math.round(GALLERY_THUMB_BASE * _galleryThumbScale)
  var height = Math.round(200 * _galleryThumbScale)
  $('#photoGalleryContent, .gallery-cat-grid').css('grid-template-columns', 'repeat(auto-fill, minmax(' + size + 'px, 1fr))')
  $('#photoGalleryOverlay img.gallery-thumb').css('height', height + 'px')
  $('#galleryThumbZoomLevel').text(Math.round(_galleryThumbScale * 100) + '%')
  localStorage.setItem('galleryThumbScale', String(_galleryThumbScale))
}

function galleryThumbZoomIn()
{
  _galleryThumbScale = Math.min(GALLERY_THUMB_MAX, +(_galleryThumbScale + GALLERY_THUMB_STEP).toFixed(2))
  _applyGalleryThumbScale()
}

function galleryThumbZoomOut()
{
  _galleryThumbScale = Math.max(GALLERY_THUMB_MIN, +(_galleryThumbScale - GALLERY_THUMB_STEP).toFixed(2))
  _applyGalleryThumbScale()
}

function galleryThumbZoomReset()
{
  _galleryThumbScale = 1
  _applyGalleryThumbScale()
}

function closePhotoGallery()
{
  closePhotoZoom()
  $('#photoGalleryOverlay').fadeOut(200)
  $('body').css('overflow','')
}

// QA's CDN encodes size as a path segment: /img/{size}/{file}. We rewrite
// scraped URLs to whatever quality the user has chosen in settings (default
// 'xxl'). The single-image zoom forces 'original' for max resolution.
function getQaImageSize() {
  return localStorage.getItem('qaImageSize') || 'xxl'
}

function setQaImageSize(size) {
  if(!size) return
  localStorage.setItem('qaImageSize', size)
  // Refresh any currently-rendered images so the change takes effect immediately.
  $('img').each(function() {
    var src = this.src || this.getAttribute('data-src') || ''
    if(src.indexOf('quintoandar.com.br/img/') === -1) return
    var newSrc = upgradeQaImageUrl(src, size)
    if(newSrc !== src) {
      if(this.src) this.src = newSrc
      if(this.getAttribute('data-src')) this.setAttribute('data-src', newSrc)
    }
  })
}

function upgradeQaImageUrl(url, target) {
  if(typeof url !== 'string' || url.indexOf('quintoandar.com.br/img/') === -1) return url
  // 'auto' (or omitted) → user's preferred size from settings
  if(!target || target === 'auto') target = getQaImageSize()
  if(target === 'original') return url.replace(/\/img\/[a-z0-9]+\//i, '/img/')
  return url.replace(/\/img\/[a-z0-9]+\//i, '/img/' + target + '/')
}

var _photoZoomUrls = []
var _photoZoomIndex = 0
var _photoZoomScale = 1
var PHOTO_ZOOM_MIN = 0.25
var PHOTO_ZOOM_MAX = 6
var PHOTO_ZOOM_STEP = 0.25

function openPhotoZoom(srcOrEl, listEl)
{
  var el = null
  if(srcOrEl && srcOrEl.nodeType === 1) el = srcOrEl
  else if(typeof event !== 'undefined' && event && event.target && event.target.tagName === 'IMG') el = event.target

  var urls = [], idx = 0
  if(el) {
    var scope = null
    if(listEl && listEl.nodeType === 1) scope = listEl
    else if(el.closest) scope = el.closest('.grid-row-item') || (el.closest('#photoGalleryOverlay') ? document.getElementById('photoGalleryContent') : null)
    var selector = 'img.gallery-thumb, img.grid-row-img'
    var imgs = scope ? scope.querySelectorAll(selector) : [el]
    imgs = Array.prototype.slice.call(imgs)
    urls = imgs.map(function(i){ return i.src || i.getAttribute('data-src') || '' }).filter(function(u){ return u })
    var elSrc = el.src || el.getAttribute('data-src') || ''
    idx = urls.indexOf(elSrc)
    if(idx < 0) { urls.unshift(elSrc); idx = 0 }
  } else {
    urls = [String(srcOrEl)]
    idx = 0
  }

  _photoZoomUrls = urls
  _photoZoomIndex = idx
  _photoZoomScale = 1
  _showPhotoZoom()
  $('#photoGalleryZoom').addClass('active')
  $(document).off('keydown.photoZoom').on('keydown.photoZoom', _photoZoomKey)
}

function _showPhotoZoom()
{
  // Upgrade to the original (no-size) variant for QA URLs — the gallery uses xxl
  // for fast scrolling but here we want max resolution.
  var src = upgradeQaImageUrl(_photoZoomUrls[_photoZoomIndex] || '', 'original')
  $('#photoGalleryZoomImg').attr('src', src)
  _applyPhotoZoomScale()
  var total = _photoZoomUrls.length
  $('#photoZoomCounter').text(total > 1 ? (_photoZoomIndex + 1) + ' / ' + total : '')
  $('#photoGalleryZoom .zoom-prev, #photoGalleryZoom .zoom-next').toggle(total > 1)
  $('#photoGalleryZoom .zoom-prev').prop('disabled', _photoZoomIndex <= 0)
  $('#photoGalleryZoom .zoom-next').prop('disabled', _photoZoomIndex >= total - 1)
}

function _applyPhotoZoomScale()
{
  var pct = Math.round(_photoZoomScale * 100)
  // Use width/height (not max-*) so the IMG box grows past the source's
  // intrinsic size. object-fit:contain (set in CSS) keeps aspect ratio.
  $('#photoGalleryZoomImg').css({
    'width': (95 * _photoZoomScale) + 'vw',
    'height': (95 * _photoZoomScale) + 'vh',
    'max-width': 'none',
    'max-height': 'none'
  })
  $('#photoZoomLevel').text(pct + '%')
}

function photoZoomNext()
{
  if(_photoZoomIndex < _photoZoomUrls.length - 1) {
    _photoZoomIndex++
    _photoZoomScale = 1
    _showPhotoZoom()
  }
}

function photoZoomPrev()
{
  if(_photoZoomIndex > 0) {
    _photoZoomIndex--
    _photoZoomScale = 1
    _showPhotoZoom()
  }
}

function photoZoomIn()
{
  _photoZoomScale = Math.min(PHOTO_ZOOM_MAX, +(_photoZoomScale + PHOTO_ZOOM_STEP).toFixed(2))
  _applyPhotoZoomScale()
}

function photoZoomOut()
{
  _photoZoomScale = Math.max(PHOTO_ZOOM_MIN, +(_photoZoomScale - PHOTO_ZOOM_STEP).toFixed(2))
  _applyPhotoZoomScale()
}

function photoZoomReset()
{
  _photoZoomScale = 1
  _applyPhotoZoomScale()
  $('#photoGalleryZoom').scrollTop(0).scrollLeft(0)
}

function _photoZoomKey(e)
{
  if(!$('#photoGalleryZoom').hasClass('active')) return
  switch(e.which) {
    case 37: photoZoomPrev(); e.preventDefault(); break
    case 39: photoZoomNext(); e.preventDefault(); break
    case 38: case 107: case 187: photoZoomIn(); e.preventDefault(); break
    case 40: case 109: case 189: photoZoomOut(); e.preventDefault(); break
    case 48: case 96: photoZoomReset(); e.preventDefault(); break
    case 27: closePhotoZoom(); e.preventDefault(); break
  }
}

function closePhotoZoom()
{
  $('#photoGalleryZoom').removeClass('active')
  $('#photoGalleryZoomImg').attr('src', '').css({'max-width':'', 'max-height':''})
  _photoZoomUrls = []
  _photoZoomIndex = 0
  _photoZoomScale = 1
  $(document).off('keydown.photoZoom')
}

function openAvailabilityCalendar(listingId) {
  var listing = typeof _gridListings !== 'undefined' ? _gridListings.find(function(a){ return a._id === listingId }) : null
  if(!listing && typeof _markers !== 'undefined') {
    var m = _markers.find(function(mk){ return mk.listingData && mk.listingData._id === listingId })
    if(m) listing = m.listingData
  }
  if(!listing || !listing.availability) {
    showAlertModal('Availability Not Found', 'Availability data is not available for this listing. If it\'s an Airbnb listing, try refreshing it to fetch the 12-month calendar.')
    return
  }

  $('#availabilityTitle').text('12-Month Availability: ' + listing.title)
  var grid = $('#availabilityCalendarGrid')
  grid.empty()

  // Group by month
  var months = {}
  Object.keys(listing.availability).sort().forEach(function(date) {
    var monthKey = date.substring(0, 7) // YYYY-MM
    if(!months[monthKey]) months[monthKey] = []
    months[monthKey].push(Object.assign({date: date}, listing.availability[date]))
  })
  
  Object.keys(months).forEach(function(mKey) {
    var mName = moment(mKey + '-01').format('MMMM YYYY')
    var html = '<div class="calendar-month-box" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;background:#f9f9f9">'
    html += '<div style="background:#f0f0f0;padding:6px 10px;font-weight:600;text-align:center;border-bottom:1px solid #ddd">'+mName+'</div>'
    html += '<div style="display:grid;grid-template-columns:repeat(7, 1fr);font-size:10px;text-align:center;background:#fff">'
    
    // Header days
    var shortDays = ['Su','Mo','Tu','We','Th','Fr','Sa']
    shortDays.forEach(function(d){ html += '<div style="padding:4px 0;background:#fafafa;font-weight:600;border-bottom:1px solid #eee;color:#777">'+d+'</div>' })
    
    // Fill empty days before 1st
    var firstDate = moment(mKey + '-01')
    for(var i=0; i<firstDate.day(); i++) { html += '<div style="padding:8px 0;border-bottom:1px solid #f9f9f9;border-right:1px solid #f9f9f9"></div>' }
    
    months[mKey].forEach(function(day) {
      var color = day.available ? '#e8f5e9' : '#ffebee'
      var textColor = day.available ? '#2e7d32' : '#c62828'
      var dateNum = day.date.substring(8)
      var priceHtml = day.price ? '<div style="font-size:8px;margin-top:2px;font-weight:400">'+day.price+'</div>' : ''
      html += '<div style="padding:6px 2px;background:'+color+';color:'+textColor+';border-bottom:1px solid #fff;border-right:1px solid #fff;display:flex;flex-direction:column;align-items:center;min-height:38px">'
      html += '<strong>'+parseInt(dateNum)+'</strong>'
      html += priceHtml
      html += '</div>'
    })
    
    html += '</div></div>'
    grid.append(html)
  })
  
  $('#availabilityOverlay').fadeIn(200)
  $('body').css('overflow','hidden')
}

function closeAvailabilityCalendar() {
  $('#availabilityOverlay').fadeOut(200)
  $('body').css('overflow','')
}

function clearJobCache()
{
  showConfirmModal(
    'Clear Cached Listings',
    'Are you sure you want to clear all cached listings for this search? This will remove them from the database.',
    function() {
      APIclearJobListings(JSON.stringify({jobId}), function(result){
        clearMapMarkers('all')
        _markers = []
        $(".resultscount").html('Last Updated: N/A, Number of results: 0')
        showAlertModal('Listings Cleared', 'Cleared <strong>' + (result.removed || 0) + '</strong> cached listings.')
      })
    },
    { confirmLabel: 'Clear Cache', confirmClass: 'btn-danger' }
  )
}

var _listingPopupMap = null
var _listingPopupMarker = null

function openListingMapPopup(lat, lon, title) {
  $('#listingMapModalTitle').text(title || 'Location')
  $('#listingMapModal').modal('show')
  $('#listingMapModal').one('shown.bs.modal', function() {
    var latLng = new google.maps.LatLng(lat, lon)
    if(!_listingPopupMap) {
      _listingPopupMap = new google.maps.Map(document.getElementById('listingMapDiv'), {
        center: latLng,
        zoom: 15,
        mapTypeId: google.maps.MapTypeId.ROADMAP
      })
      _listingPopupMarker = new google.maps.Marker({ position: latLng, map: _listingPopupMap, title: title || '' })
    } else {
      _listingPopupMap.setCenter(latLng)
      _listingPopupMap.setZoom(15)
      _listingPopupMarker.setPosition(latLng)
      _listingPopupMarker.setTitle(title || '')
      google.maps.event.trigger(_listingPopupMap, 'resize')
    }
  })
}

function mapResetViewed()
{
  showConfirmModal(
    'Clear Viewed History',
    'Are you sure you want to clear the viewed listings history of this search?',
    function() {
      localStorage.removeItem('visitedUrls'+jobId)
      getViewedMarkers().forEach(marker => marker.setIcon("https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png"))
      visitedUrls=[]
    },
    { confirmLabel: 'Clear History', confirmClass: 'btn-danger' }
  )
}