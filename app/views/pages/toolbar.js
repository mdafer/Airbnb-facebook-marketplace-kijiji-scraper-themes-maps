var toolbarHtml = `
    <section class="content-header">
      <button class="btn btn-light" type="button" onclick="backToSearches();">
        <span class="fa fa-chevron-left" aria-hidden="true"></span>
      </button><h1 id="pageTitle" style="display: inline;vertical-align: middle;">
        <small></small>
      </h1>

      <input type="file" style="display:none" id="importViewedbtn">
      <div class="btn-group">
        <button id="hideViewedbtn" type="button" class="btn btn-default btn-sm BStooltip" rel="tooltip" data-placement="top" title="Click to hide viewed listings" onclick="hideViewedMarkers()"><i id="hideViewedicon" class="fa fa-eye"></i></button>
        <div class="btn-group">
          <button type="button" style="height:30px" class="btn btn-default btn-sm dropdown-toggle BStooltip" data-placement="top" title="Viewed listings settings" data-toggle="dropdown" aria-expanded="true">
            <span class="caret"></span>
            <span class="sr-only">Toggle Dropdown</span>
          </button>
          <ul class="dropdown-menu" style="margin-left: -62px; width: 180px;" role="menu">
            <div class="col-xs-12 text-center" style="padding:0">
              <button type="button" class="btn btn-warning BStooltip" rel="tooltip" data-placement="top" title="Save viewed listings to file" onclick="saveViewed()"><i class="glyphicon glyphicon-save"></i></button>
              <button type="button" class="btn btn-info BStooltip" rel="tooltip" data-placement="top" title="Load viewed listings from file" onclick="document.getElementById('importViewedbtn').click();"><i class="glyphicon glyphicon-import"></i></button>
              <button type="button" class="btn btn-danger BStooltip" rel="tooltip" data-placement="top" title="Rebuild viewed listings indexes" onclick="rebuildViewedList()"><i class="glyphicon glyphicon-flash"></i></button>
              <button type="button" class="btn btn-danger BStooltip" rel="tooltip" data-placement="top" title="Clear viewed listings history" onclick="mapResetViewed()"><i class="fa fa-trash-o"></i></button>
            </div>
          </ul>
        </div>
      </div>

      <div class="btn-group" style="margin-left:6px">
        <button id="gridModeCards" type="button" class="btn btn-default btn-sm BStooltip" title="Card view" onclick="switchToGridMode('cards')"><i class="fa fa-th"></i></button>
        <button id="gridModeRows" type="button" class="btn btn-default btn-sm BStooltip" title="Row view" onclick="switchToGridMode('rows')"><i class="fa fa-bars"></i></button>
        <a id="viewMapBtn" class="btn btn-default btn-sm BStooltip" title="Map view" href="#map" onclick="switchToMapView(); return false"><i class="fa fa-map"></i></a>
      </div>

      <button id="uncollapseAllBtn" type="button" class="btn btn-default btn-sm BStooltip" title="Expand all rows" onclick="uncollapseAllRows()" style="display:none;margin-left:2px"><i class="fa fa-chevron-down"></i></button>

      <button id="shareViewBtn" type="button" class="btn btn-default btn-sm BStooltip" title="Copy shareable link to this view" onclick="shareCurrentView()" style="margin-left:2px"><i class="fa fa-share-alt"></i> Share</button>

      <button id="favFilterBtn" type="button" class="btn btn-default btn-sm BStooltip" title="Show favorites only" onclick="toggleFavoritesFilter()"><i class="fa fa-heart"></i></button>
      <button id="dislikeFilterBtn" type="button" class="btn btn-primary btn-sm BStooltip" title="Show disliked listings (currently hidden)" onclick="toggleHideDislikedFilter()"><i class="fa fa-thumbs-down"></i></button>

      <button id="filtersBtn" type="button" class="btn btn-primary btn-sm BStooltip" title="Filters & Settings" data-toggle="modal" data-target="#filtersModal"><i class="fa fa-sliders"></i></button>
      <button id="clearFiltersBtn" type="button" class="btn btn-warning btn-sm BStooltip" title="Clear all filters" onclick="clearAllFilters()" style="display:none"><i class="fa fa-times"></i> Clear Filters</button>

      <button type="button" class="btn btn-success btn-sm BStooltip" rel="tooltip" data-placement="top" title="Reset all listings" onclick="resetJob()"><i class="fa fa-refresh"></i></button>
      <button type="button" class="btn btn-danger btn-sm BStooltip" rel="tooltip" data-placement="top" title="Clear cached listings" onclick="clearJobCache()"><i class="fa fa-trash"></i></button>

      <div class="btn-group" style="margin-left:2px">
        <button id="drawAreaBtn" type="button" class="btn btn-default btn-sm BStooltip" rel="tooltip" data-placement="top" title="Draw area to filter listings" onclick="startDrawing()"><i class="fa fa-pencil"></i></button>
        <button id="clearShapeBtn" type="button" class="btn btn-danger btn-sm BStooltip" rel="tooltip" data-placement="top" title="Clear drawn shape" onclick="clearDrawnShape()" style="display:none"><i class="fa fa-times"></i></button>
      </div>

      <div class="btn-group" style="margin-left:2px">
        <button type="button" class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown"><i class="fa fa-sort"></i> <span id="sortLabel">Sort</span> <span class="caret"></span></button>
        <ul class="dropdown-menu">
          <li><a href="#" onclick="sortGrid('price','asc');return false"><i class="fa fa-sort-amount-asc"></i> Price: Low to High</a></li>
          <li><a href="#" onclick="sortGrid('price','desc');return false"><i class="fa fa-sort-amount-desc"></i> Price: High to Low</a></li>
          <li class="divider"></li>
          <li><a href="#" onclick="sortGrid('date','desc');return false"><i class="fa fa-sort-amount-desc"></i> Date: Newest First</a></li>
          <li><a href="#" onclick="sortGrid('date','asc');return false"><i class="fa fa-sort-amount-asc"></i> Date: Oldest First</a></li>
          <li class="divider"></li>
          <li><a href="#" onclick="sortGrid('m2','asc');return false"><i class="fa fa-sort-amount-asc"></i> m²: Small to Large</a></li>
          <li><a href="#" onclick="sortGrid('m2','desc');return false"><i class="fa fa-sort-amount-desc"></i> m²: Large to Small</a></li>
        </ul>
      </div>

      <button type="button" class="btn btn-default btn-sm BStooltip" rel="tooltip" data-placement="top" title="Information" data-toggle="modal" data-target="#informationModal"><i class="glyphicon glyphicon-info-sign"></i></button>

      <p class="resultscount" style="display:inline;margin-left:10px;font-size:13px">Results: 0</p>
    </section>

<!-- Unified Filters Modal -->
<div id="filtersModal" class="modal fade" role="dialog" style="display:none">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header filters-modal-header">
        <button type="button" class="close" data-dismiss="modal">&times;</button>
        <h4 class="modal-title"><i class="fa fa-sliders"></i> Filters</h4>
      </div>
      <div class="modal-body filters-modal-body">
        <form role="form" id="filtersForm" data-toggle="validator">
          <input id="filterJobId" name="jobId" type="hidden">

          <!-- Price -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-dollar"></i> Price Range</label>
            <div class="filter-row">
              <input id="fromPrice" name="fromPrice" type="number" min="0" class="filter-input" placeholder="Min">
              <span class="filter-separator">&ndash;</span>
              <input id="toPrice" name="toPrice" type="number" min="0" class="filter-input" placeholder="Max">
            </div>
          </div>

          <!-- Listing Date -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-calendar"></i> Oldest Listing Date</label>
            <input id="fromDate" name="fromDate" type="date" class="filter-input filter-input-full">
          </div>

          <!-- Availability -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-calendar-check-o"></i> Available Between <small class="filter-hint">(Airbnb only)</small></label>
            <div class="filter-row">
              <input id="availableFrom" name="availableFrom" type="date" class="filter-input" placeholder="From">
              <span class="filter-separator">&ndash;</span>
              <input id="availableTo" name="availableTo" type="date" class="filter-input" placeholder="To">
            </div>
          </div>

          <!-- Search -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-search"></i> Search Text</label>
            <input id="searchText" name="searchText" type="text" class="filter-input filter-input-full" placeholder="Keywords, -exclude, &quot;exact phrase&quot;" value="">
            <label class="filter-checkbox-label">
              <input type="checkbox" id="searchTitleOnly" name="searchTitleOnly" value="true">
              Title only
            </label>
          </div>

          <!-- Rooms -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-bed"></i> Rooms &amp; Beds</label>
            <div class="filter-row filter-row-thirds">
              <div class="filter-field">
                <span class="filter-field-label">Bedrooms</span>
                <input id="minBedrooms" name="minBedrooms" type="number" min="0" class="filter-input" placeholder="Any">
              </div>
              <div class="filter-field">
                <span class="filter-field-label">Bathrooms</span>
                <input id="minBathrooms" name="minBathrooms" type="number" min="0" class="filter-input" placeholder="Any">
              </div>
              <div class="filter-field">
                <span class="filter-field-label">Beds</span>
                <input id="minBeds" name="minBeds" type="number" min="0" class="filter-input" placeholder="Any">
              </div>
            </div>
          </div>

          <!-- Property Details -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-home"></i> Property Details</label>
            <div class="filter-row filter-row-thirds">
              <div class="filter-field">
                <span class="filter-field-label">Min m²</span>
                <input id="minSqMeters" name="minSqMeters" type="number" min="0" class="filter-input" placeholder="Any">
              </div>
              <div class="filter-field">
                <span class="filter-field-label">Parking</span>
                <input id="minParking" name="minParking" type="number" min="0" class="filter-input" placeholder="Any">
              </div>
              <div class="filter-field">
                <span class="filter-field-label">Type</span>
                <select id="propertyType" name="propertyType" class="filter-input">
                  <option value="">Any</option>
                  <option value="apartment">Apartment</option>
                  <option value="house">House</option>
                  <option value="condo">Condo</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="studio">Studio</option>
                  <option value="room">Room</option>
                </select>
              </div>
            </div>
            <div class="filter-row" style="margin-top:8px">
              <div class="filter-field" style="flex:1">
                <span class="filter-field-label">Category / Location</span>
                <input id="categorySearch" name="categorySearch" type="text" class="filter-input" placeholder="e.g. Home sales, São Paulo...">
              </div>
            </div>
          </div>

          <!-- Photos -->
          <div class="filter-section">
            <label class="filter-checkbox-label">
              <input type="checkbox" id="minPhotosCheck" value="2" onchange="$('#minPhotos').val(this.checked?'2':'')">
              <i class="fa fa-camera"></i> Hide listings with 1 or no photos
            </label>
            <input id="minPhotos" name="minPhotos" type="hidden">
            <div class="filter-row" style="margin-top:8px">
              <div class="filter-field" style="flex:1">
                <span class="filter-field-label">Quinto Andar photo quality <small class="filter-hint">(applied on display — no re-scrape needed)</small></span>
                <select id="qaImageSize" class="filter-input" onchange="setQaImageSize(this.value)">
                  <option value="med">Low (med, ~30KB)</option>
                  <option value="xxl" selected>High (xxl, ~140KB)</option>
                  <option value="original">Original (~800KB, slowest)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Amenities -->
          <div class="filter-section">
            <label class="filter-label"><i class="fa fa-list"></i> Amenities</label>
            <input id="amenitySearch" type="text" class="filter-input filter-input-full" placeholder="Search amenities..." oninput="updateAmenityBubbles()">
          </div>
          <div class="filter-section filter-section-compact">
            <label class="filter-sublabel">AND <small class="filter-hint">(all must match)</small></label>
            <input id="amenities" name="amenities" type="hidden">
            <div id="amenityBubblesAnd" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px"></div>
          </div>
          <div class="filter-section filter-section-compact">
            <label class="filter-sublabel">OR <small class="filter-hint">(at least one · right-click to move)</small></label>
            <input id="orAmenities" name="orAmenities" type="hidden">
            <div id="amenityBubblesOr" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px"></div>
          </div>

          <input type="submit" value="Submit" style="display:none;">
        </form>
      </div>
      <div class="modal-footer filters-modal-footer">
        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-primary" onclick="$('#filtersForm').submit();"><i class="fa fa-check"></i> Apply Filters</button>
      </div>
    </div>
  </div>
</div>

<!-- Information Modal -->
<div id="informationModal" class="modal fade" role="dialog" style="display: none;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header" style="padding-bottom:5px">
        <button type="button" class="close" data-dismiss="modal">&times;</button>
        <h4 class="modal-title" style="padding-bottom:10px">Information</h4>
        <p id="informationStatus" style="margin:0"></p>
        <p class='resultscount pull-right' style="margin:0px">Number of results: 0</p>
        <p id="informationStatus2" style="margin:0"></p>
      </div>
      <div class="modal-body">
        <div id="messages" class="box-body"></div>
      </div>
      <div class="modal-footer">
        <div class="pull-left">
          <button type="button" class="btn btn-danger BStooltip" rel="tooltip" data-placement="top" title="Clear Information" onclick="mapClearInformationWindow()"><i class="fa fa-trash-o"></i></button>
          <input type="checkbox" id="autoScroll" checked>
          <label for="autoScroll">Auto Scroll</label>
          <input type="checkbox" id="autoConfirmEmpty" style="margin-left:10px" onchange="setAutoConfirmEmpty(this.checked)">
          <label for="autoConfirmEmpty">Auto confirm empty</label>
        </div>
        <div class="pull-right">
          <button type="button" class="btn btn-primary" data-dismiss="modal">Ok</button>
        </div>
      </div>
    </div>
  </div>
</div>
`;

function _isMessagesAtBottom() {
  var el = $('#messages')[0]
  if (!el) return true
  var isScrollable = el.scrollHeight > el.clientHeight
  if (!isScrollable) return true
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 2
}

$('#informationModal').on('shown.bs.modal', function() {
  // Restore the full log — navigation may have wiped #messages since last open.
  renderInfoMessages()
  $('#messages').off('scroll.autoScroll').on('scroll.autoScroll', function() {
    var el = this
    var isScrollable = el.scrollHeight > el.clientHeight
    if (!isScrollable) return
    if (_isMessagesAtBottom()) {
      $('#autoScroll').prop('checked', true)
    } else {
      $('#autoScroll').prop('checked', false)
    }
  })
})

// Persistent info-log buffer. renderpage() re-injects the toolbar template on
// navigation, which wipes #messages; anchoring the buffer on window lets the log
// survive so we can repopulate the panel whenever it's reopened.
var _infoMessages = (window._infoMessages = window._infoMessages || [])
var _INFO_MESSAGES_MAX = 1000

var _INFO_HEADER_HTML = '<div class="row" style="max-width:100%">' +
  '<div class="col-xs-3 text-center" style="padding:0">Time</div>' +
  '<div class="col-xs-9 text-center">Message</div>' +
'</div>'

function _infoRowHtml(row) {
  return '<div class="row">' +
    '<div class="col-xs-3 text-center wrap" style="padding:0">' + row.date + '</div>' +
    '<div class="col-xs-9 wrap">' + row.print + '</div>' +
  '</div>'
}

// Rebuild #messages (header + every buffered row) from the persistent buffer.
// The buffer is the source of truth, so a full replace can't duplicate rows.
// Used on page load and modal-open so the log survives navigation.
function renderInfoMessages() {
  var el = $('#messages')
  if (!el.length) return
  var html = _INFO_HEADER_HTML
  for (var i = 0; i < _infoMessages.length; i++) html += _infoRowHtml(_infoMessages[i])
  el.html(html)
  if ($('#autoScroll').is(':checked')) el.scrollTop(el[0].scrollHeight)
}

function addInfoRow(row)
{
  _infoMessages.push({ date: row.date, print: row.print })
  if (_infoMessages.length > _INFO_MESSAGES_MAX) _infoMessages.splice(0, _infoMessages.length - _INFO_MESSAGES_MAX)
  $('#messages').append(_infoRowHtml(row));
  if($('#autoScroll').is(':checked') && $('#informationModal').hasClass('in'))
      $("#messages").scrollTop($("#messages")[0].scrollHeight);
}

var _socketJobId = null

function formatElapsed(ms) {
  if (!ms) return '0s'
  var totalSec = Math.floor(ms / 1000)
  var h = Math.floor(totalSec / 3600)
  var m = Math.floor((totalSec % 3600) / 60)
  var s = totalSec % 60
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's'
  if (m > 0) return m + 'm ' + s + 's'
  return s + 's'
}

function _handleSocketMessage(obj) {
  console.log('[socket] _handleSocketMessage', {_socketJobId, channel: obj&&obj.channel, obj})
  if(!_socketJobId || !obj || !obj.channel) return
  var ch = obj.channel
  if(ch === _socketJobId+'jobUpdate' || ch === _socketJobId+'jobWarning') {
    addInfoRow(obj)
  } else if(ch === _socketJobId+'command') {
    switch(obj.command) {
      case 'procPageNumber':
        addInfoRow({date:obj.date, print:'Processing page: '+obj.print})
        var status = "Processing Page: " + obj.print
        var extra = ""
        if (obj.params) {
          if (obj.params.startTime) {
            extra = "Elapsed: " + formatElapsed(Date.now() - obj.params.startTime) + " · Total Pages: " + obj.print
            if (obj.params.totalListingsFound !== undefined) {
              extra += " · Total Found: " + obj.params.totalListingsFound
            }
          }
        }
        $('#informationStatus').text(status)
        if (extra) $('#informationStatus2').text(extra)
      break;
      case 'donePageNumber':
        addInfoRow({date:obj.date, print:'Done processing page: '+obj.print})
        if (obj.params && obj.params.refresh && typeof getListingsAsync === 'function')
          getListingsAsync($('#filtersForm').serialize())
        if (obj.params && obj.params.startTime) {
           var extraDone = "Elapsed: " + formatElapsed(Date.now() - obj.params.startTime) + " · Total Pages: " + obj.print
           if (obj.params.totalListingsFound !== undefined) extraDone += " · Total Found: " + obj.params.totalListingsFound
           $('#informationStatus2').text(extraDone)
        }
      break;
      case 'doneProc':
        if(typeof getListingsAsync === 'function') getListingsAsync($('#filtersForm').serialize())
        if(typeof loadGridListings === 'function' && window.currentState === 'grid') loadGridListings($('#filtersForm').serialize())
        var totalFoundMsg = obj.params && obj.params.totalListingsFound !== undefined ? " · Found " + obj.params.totalListingsFound + " listings" : ""
        addInfoRow({date:obj.date, print:'All listings have been refreshed and expired listings removed! Pages: '+obj.print + totalFoundMsg})
        $('#informationStatus').text("Listings refreshed! Total pages processed: "+obj.print + totalFoundMsg)
        var totalExtra = ""
        if (obj.params && obj.params.startTime) totalExtra = "Total Time: " + formatElapsed(Date.now() - obj.params.startTime) + " · "
        $('#informationStatus2').text(totalExtra + "All expired listings have been removed!")
      break;
      case 'removeUrlMarker':
        addInfoRow({date:obj.date, print:'Removing expired listing!'})
        if(typeof clearMapMarkers === 'function') clearMapMarkers(getMarkersFromListings(obj.print))
      break;
    }
  }
}

function _isJobInCurrentView(listingJobId) {
  if(!_socketJobId || !listingJobId) return false
  if(_socketJobId === listingJobId) return true
  if(_socketJobId === 'multi') {
    var multiIds = getMultiJobIds()
    return multiIds.indexOf(listingJobId) !== -1
  }
  return false
}

function _handleNewListing(data) {
  if(!data || !data.listing || !_isJobInCurrentView(data.jobId)) return
  var listing = data.listing
  if(listing.lat == null || listing.lon == null) return
  if(_hideDisliked && typeof isDisliked === 'function' && isDisliked(listing._id)) return
  if(typeof _markers !== 'undefined' && _markers.some(function(m){ return m.url === listing.url })) return
  if(typeof setMarkersByListings === 'function' && typeof map !== 'undefined' && map) {
    setMarkersByListings(map, [listing], false)
    $('.resultscount').html('Last Updated: '+lastUpdated+', Number of results: '+ _markers.length)
  } else if(typeof appendGridListing === 'function' && window.currentState === 'grid') {
    appendGridListing(listing)
  }
}

function setupSocketListeners() {
  teardownSocketListeners()
  console.log('[socket] setupSocketListeners jobId=', jobId, 'messagesEl=', $('#messages').length)
  if(!jobId) return
  _socketJobId = jobId
  socket.on('all', _handleSocketMessage)
  socket.on('newListing', _handleNewListing)
}

function teardownSocketListeners() {
  socket.off('all', _handleSocketMessage)
  socket.off('newListing', _handleNewListing)
  _socketJobId = null
}

function switchToGridMode(mode) {
  _gridMode = mode
  saveGridMode()
  $('#gridModeCards').toggleClass('btn-primary', mode === 'cards').toggleClass('btn-default', mode !== 'cards')
  $('#gridModeRows').toggleClass('btn-primary', mode === 'rows').toggleClass('btn-default', mode !== 'rows')
  $('#uncollapseAllBtn').toggle(mode === 'rows')
  var state = window.currentState
  if(state === 'favorites') {
    switchFavView('grid')
  } else if(state === 'dislikes') {
    switchDislikedView('grid')
  } else if(state === 'grid') {
    renderGrid()
  } else {
    if(jobId && jobName) {
      loadpage('grid', true)
    }
  }
}

function switchToMapView() {
  if(window.currentState === 'favorites') {
    switchFavView('map')
  } else if(window.currentState === 'dislikes') {
    switchDislikedView('map')
  } else if(jobId && jobName) {
    loadpage('map', true)
  }
}

var _favoritesOnly = false
var _favJobIds = [] // selected job IDs when in favorites mode

function toggleFavoritesFilter() {
  _favoritesOnly = !_favoritesOnly
  if(!_favoritesOnly) _favJobIds = []
  saveFavoritesOnly()
  $('#favFilterBtn').toggleClass('btn-primary', _favoritesOnly).toggleClass('btn-default', !_favoritesOnly)
  updateFilterIndicator()
  // Reload current view with the filter applied
  var state = window.currentState
  if(state === 'map' && typeof getListingsAsync === 'function')
    getListingsAsync($('#filtersForm').serialize(), true)
  else if(state === 'grid' && typeof loadGridListings === 'function')
    loadGridListings($('#filtersForm').serialize())
}

function toggleHideDislikedFilter() {
  _hideDisliked = !_hideDisliked
  saveHideDisliked()
  $('#dislikeFilterBtn')
    .toggleClass('btn-primary', _hideDisliked)
    .toggleClass('btn-default', !_hideDisliked)
    .attr('title', _hideDisliked ? 'Show disliked listings (currently hidden)' : 'Hide disliked listings (currently shown)')
  var state = window.currentState
  if(state === 'map' && typeof getListingsAsync === 'function')
    getListingsAsync($('#filtersForm').serialize(), true)
  else if(state === 'grid' && typeof loadGridListings === 'function')
    loadGridListings($('#filtersForm').serialize())
  else if(state === 'favorites' && typeof loadFavListings === 'function')
    loadFavListings()
}

function setViewMode(mode) {
  // Highlight active view button
  $('#gridModeCards, #gridModeRows, #viewMapBtn').removeClass('btn-primary').addClass('btn-default')
  if(mode === 'map') $('#viewMapBtn').removeClass('btn-default').addClass('btn-primary')
  else if(mode === 'cards') $('#gridModeCards').removeClass('btn-default').addClass('btn-primary')
  else if(mode === 'rows') $('#gridModeRows').removeClass('btn-default').addClass('btn-primary')
  else if(mode === 'grid') {
    // For 'grid' mode, check the actual _gridMode to determine which button to highlight
    if(_gridMode === 'rows') $('#gridModeRows').removeClass('btn-default').addClass('btn-primary')
    else $('#gridModeCards').removeClass('btn-default').addClass('btn-primary')
  }
  var isRows = mode === 'rows' || (mode === 'grid' && _gridMode === 'rows')
  $('#uncollapseAllBtn').toggle(isRows)

  if(hasActiveShapeFilter()) {
    $('#drawAreaBtn').addClass('btn-primary').removeClass('btn-default')
    $('#clearShapeBtn').show()
  }

  // Sync favorites filter button state
  $('#favFilterBtn').toggleClass('btn-primary', _favoritesOnly).toggleClass('btn-default', !_favoritesOnly)
  // Sync dislike-hide filter button state
  $('#dislikeFilterBtn')
    .toggleClass('btn-primary', _hideDisliked)
    .toggleClass('btn-default', !_hideDisliked)
    .attr('title', _hideDisliked ? 'Show disliked listings (currently hidden)' : 'Hide disliked listings (currently shown)')

  updateFilterIndicator()
}
