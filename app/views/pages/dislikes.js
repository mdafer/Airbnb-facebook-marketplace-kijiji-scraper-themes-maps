var dislikespage = toolbarHtml + `
    <section class="content">
      <div id="disJobFilters" style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <label style="margin:0">Searches:</label>
      </div>
      <div id="gridContainer"></div>
      <input id="pac-input" class="controls" type="text" placeholder="Focus map on location" />
      <div id="map"></div>
    </section>
`;

var _disJobs = []
var _disViewMode = 'grid'
var _disListings = []

function dislikesfunc() {
  _favoritesOnly = false
  _disViewMode = 'grid'
  setViewMode('grid')
  $('#pageTitle').text('Disliked')
  $('#map').hide()
  $('#pac-input').hide()
  // These toolbar controls don't apply to the dislikes view.
  $('#favFilterBtn').hide()
  $('#dislikeFilterBtn').hide()
  $('#shareViewBtn').hide()

  $(".BStooltip").tooltip({ trigger: 'hover', container: 'body', placement: 'auto bottom' })

  APIgetProfile(null, function(user){
    if(user) _savedHideAmenities = parseAmenityList(user.hideAmenities)
    _disJobs = (user && user.jobs) ? user.jobs : []
    $('#disJobFilters').find('label').remove()
    _disJobs.forEach(function(j){
      var name = $('<span>').text(j.name).html()
      $('#disJobFilters').append(
        '<label style="margin:0;cursor:pointer;font-weight:normal">' +
        '<input type="checkbox" class="dis-job-check" value="'+j.id+'" data-name="'+name+'" checked onchange="loadDislikedListings()" style="margin-right:3px">' +
        name + '</label>'
      )
    })
    loadDislikedListings()
  })

  $('#filtersModal').on('show.bs.modal', function(){ updateAmenityBubbles() })

  $('#filtersForm').on('submit', function(event) {
    event.preventDefault()
    $('#filtersModal').modal('hide')
    saveFilters()
    updateFilterIndicator()
    loadDislikedListings()
  })
}

function getSelectedDisJobIds() {
  var ids = []
  $('.dis-job-check:checked').each(function(){ ids.push($(this).val()) })
  return ids
}

function loadDislikedListings() {
  var params = {}

  var selectedIds = getSelectedDisJobIds()
  if(selectedIds.length) params.jobIds = selectedIds.join(',')

  var fp = $('#fromPrice').val()
  var tp = $('#toPrice').val()
  if(fp) params.fromPrice = fp
  if(tp) params.toPrice = tp
  var mb = $('#minBedrooms').val()
  var mba = $('#minBathrooms').val()
  var mbe = $('#minBeds').val()
  if(mb) params.minBedrooms = mb
  if(mba) params.minBathrooms = mba
  if(mbe) params.minBeds = mbe
  var st = $('#searchText').val()
  if(st) params.searchText = st
  var mp = $('#minPhotos').val()
  if(mp) params.minPhotos = mp
  var am = $('#amenities').val()
  if(am) params.amenities = am
  var oam = $('#orAmenities').val()
  if(oam) params.orAmenities = oam

  showResultsLoading('Loading disliked...')
  if(_disViewMode !== 'map') showGridSkeleton()
  APIgetDislikedListings(params, function(listings) {
    var seen = {}
    listings = listings.filter(function(l){ if(seen[l._id]) return false; seen[l._id] = true; return true })
    _disListings = listings
    _allAmenities = new Set()
    _amenityIdMap = {}
    listings.forEach(function(l) {
      if(l.amenities && l.amenities.length)
        l.amenities.forEach(function(a){ _allAmenities.add(a) })
      if(l.amenityIdMap) Object.assign(_amenityIdMap, l.amenityIdMap)
    })
    showDislikedView()
  })
}

function showDislikedView() {
  var listings = _disListings
  if(hasActiveShapeFilter()) {
    listings = listings.filter(function(l){ return isInsideShapeFilter(l.lat, l.lon) })
  }
  if(_disViewMode === 'map') {
    _gridListings = listings
    $('#gridContainer').hide()
    $('#pac-input').show()
    $('#map').show()
    showDislikedMap(listings)
  } else {
    $('#map').hide()
    $('#pac-input').hide()
    $('#gridContainer').show()
    _gridListings = listings
    renderGrid()
  }
}

function showDislikedMap(listings) {
  googleMapsReady.then(function() {
    var mapDiv = document.getElementById('map')
    if(!map) {
      map = new google.maps.Map(mapDiv, {
        center: new google.maps.LatLng(43.5890, -79.6441),
        zoom: 8,
        mapTypeId: google.maps.MapTypeId.ROADMAP
      })
      infowindow = new google.maps.InfoWindow({ disableAutoPan: true, content: '' })
      var input = document.getElementById('pac-input')
      var searchBox = new google.maps.places.SearchBox(input)
      map.controls[google.maps.ControlPosition.TOP_LEFT].push(input)
      map.addListener('bounds_changed', function(){ searchBox.setBounds(map.getBounds()) })
      searchBox.addListener('places_changed', function(){
        var places = searchBox.getPlaces()
        if(!places.length) return
        var bounds = new google.maps.LatLngBounds()
        places.forEach(function(place){
          if(!place.geometry) return
          if(place.geometry.viewport) bounds.union(place.geometry.viewport)
          else bounds.extend(place.geometry.location)
        })
        map.fitBounds(bounds)
      })
    } else {
      $('#pac-input').remove()
      $(mapDiv).replaceWith(map.getDiv())
      $(map.getDiv()).attr('id', 'map')
    }
    $('#map').height(function() {
      var cw = $('.content-wrapper')
      return cw.innerHeight() - ($(this).offset().top - cw.offset().top + cw.scrollTop())
    })

    visitedUrls = visitedUrls || []
    clearMapMarkers('all')
    if(listings.length) {
      setMarkersByListings(map, listings, true)
    }
    var countText = 'Results: ' + listings.length + ' (disliked)'
    if(hasActiveShapeFilter()) countText += ' (area filtered)'
    $('.resultscount').text(countText)

    if(hasActiveShapeFilter()) restoreShapeOnMap()
  })
}

function switchDislikedView(mode) {
  _disViewMode = mode
  if(mode === 'map') {
    setViewMode('map')
  } else {
    setViewMode('grid')
  }
  showDislikedView()
}

function dislikesUnload() {
  $('#filtersForm').off('submit')
  $('#filtersModal').off('show.bs.modal')
  $('.content-wrapper').off('scroll.gridInfinite')
  cancelCustomDraw()
  if(_drawnShape) {
    _shapeFilterGeo = _extractShapeGeo(_drawnShape)
    _drawnShape.setMap(null)
  }
}
