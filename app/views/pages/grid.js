var gridpage = toolbarHtml + `
    <section class="content">
      <div id="gridContainer"></div>
    </section>
`;

var _gridMode = 'cards'
var _gridListings = []
var _gridRenderedCount = 0
var _gridBatchSize = 50
var _gridScrollTimer = null
var _currentSort = { field: 'price', dir: 'asc' }

function getCollapsedRowIds() {
  try { return JSON.parse(localStorage.getItem('collapsedRowIds') || '[]') } catch(e) { return [] }
}
function isRowCollapsed(listingId) {
  return getCollapsedRowIds().indexOf(listingId) !== -1
}
function setRowCollapsed(listingId, collapsed) {
  var ids = getCollapsedRowIds()
  var idx = ids.indexOf(listingId)
  if(collapsed && idx === -1) ids.push(listingId)
  else if(!collapsed && idx !== -1) ids.splice(idx, 1)
  localStorage.setItem('collapsedRowIds', JSON.stringify(ids))
}

function gridfunc() {
  // Restore _gridMode/_currentSort before setViewMode so the toolbar highlight
  // and uncollapse-all button visibility match the saved mode on refresh.
  restoreSort()
  restoreGridMode()
  setViewMode('grid')
  updateSortLabel()
  $('#pageTitle').text(jobName + (_favoritesOnly ? ' - Favorites' : ''))
  $('#filterJobId').val(jobId)

  // Hide job-specific actions when viewing multiple searches
  if(jobId === 'all' || jobId === 'multi') {
    $('[onclick="resetJob()"], [onclick="clearJobCache()"]').hide()
  }

  // Restore persisted filters first, then let URL params override
  restoreFilters()
  restoreShapeGeo()
  restoreFavoritesOnly()
  restoreHideDisliked()
  applyUrlParamsToFilters()
  updateSortLabel()

  // Load hideAmenities from user account settings
  APIgetProfile(null, function(user){
    if(user) _savedHideAmenities = parseAmenityList(user.hideAmenities)
  })

  $(".BStooltip").tooltip({ trigger: 'hover', container: 'body', placement: 'auto bottom' })

  $('#filtersModal').on('show.bs.modal', function(){ updateAmenityBubbles() })

  $('#filtersForm').on('submit', function(event) {
    event.preventDefault()
    $('#filtersModal').modal('hide')
    saveFilters()
    updateFilterIndicator()
    loadGridListings($('#filtersForm').serialize())
  })

  setupSocketListeners()
  loadGridListings($('#filtersForm').serialize())
}

function gridUnload() {
  $('#filtersForm').off('submit')
  $('#filtersModal').off('show.bs.modal')
  teardownSocketListeners()
  $('.content-wrapper').off('scroll.gridInfinite')
  if(_gridScrollTimer) { clearTimeout(_gridScrollTimer); _gridScrollTimer = null }
}

function loadGridListings(params) {
  showResultsLoading('Loading listings...')
  showGridSkeleton()
  APIgetListings(params, function(listings) {
    // Apply shape filter if active
    if(hasActiveShapeFilter()) {
      listings = listings.filter(function(l){ return isInsideShapeFilter(l.lat, l.lon) })
    }
    _gridListings = listings
    _allAmenities = new Set()
    _amenityIdMap = {}
    listings.forEach(function(l) {
      if(l.amenities && l.amenities.length)
        l.amenities.forEach(function(a){ _allAmenities.add(a) })
      if(l.amenityIdMap) Object.assign(_amenityIdMap, l.amenityIdMap)
    })
    if(_currentSort) _applySort()
    renderGrid()
    if(_focusListingId) scrollToFocusedListing()
  })
}

function _applySort() {
  if(!_currentSort) return
  var field = _currentSort.field, dir = _currentSort.dir
  _gridListings.sort(function(a, b) {
    var va, vb
    if(field === 'price') {
      va = parseFloat(getDisplayPrice(a)) || 0
      vb = parseFloat(getDisplayPrice(b)) || 0
    } else if(field === 'm2') {
      // QA stores area; FB stores sqMeters
      va = Number(a.area || a.sqMeters) || 0
      vb = Number(b.area || b.sqMeters) || 0
    } else {
      va = a._id ? parseInt(a._id.substring(0, 8), 16) : 0
      vb = b._id ? parseInt(b._id.substring(0, 8), 16) : 0
    }
    return dir === 'asc' ? va - vb : vb - va
  })
}

function updateSortLabel() {
  if(!_currentSort) { $('#sortLabel').text('Sort'); return }
  var labels = {
    'price_asc':  'Price: Low→High',
    'price_desc': 'Price: High→Low',
    'date_desc':  'Date: Newest',
    'date_asc':   'Date: Oldest',
    'm2_asc':     'm²: Small→Large',
    'm2_desc':    'm²: Large→Small'
  }
  $('#sortLabel').text(labels[_currentSort.field + '_' + _currentSort.dir] || 'Sort')
}

function sortGrid(field, dir) {
  _currentSort = { field: field, dir: dir }
  saveSort()
  _applySort()
  updateSortLabel()
  renderGrid()
}

function setGridMode(mode) {
  _gridMode = mode
  $('#gridModeCards').toggleClass('btn-primary', mode === 'cards').toggleClass('btn-default', mode !== 'cards')
  $('#gridModeRows').toggleClass('btn-primary', mode === 'rows').toggleClass('btn-default', mode !== 'rows')
  renderGrid()
}

function appendGridListing(listing) {
  if(!listing || !listing._id) return
  for(var i = 0; i < _gridListings.length; i++) {
    if(_gridListings[i]._id === listing._id) return
  }
  if(hasActiveShapeFilter() && !isInsideShapeFilter(listing.lat, listing.lon)) return
  if(_favoritesOnly && !isFavorite(listing._id)) return
  if(_hideDisliked && isDisliked(listing._id)) return

  _gridListings.push(listing)
  if(listing.amenities && listing.amenities.length)
    listing.amenities.forEach(function(a){ _allAmenities.add(a) })
  if(listing.amenityIdMap) Object.assign(_amenityIdMap, listing.amenityIdMap)

  var inner = document.getElementById('gridInner')
  // Only append to DOM if infinite-scroll is fully caught up; otherwise the
  // next scroll batch will render it naturally from _gridListings.
  if(inner && _gridRenderedCount === _gridListings.length - 1) {
    var html = _gridMode === 'cards' ? buildCardHtml(listing) : buildRowHtml(listing)
    var tmp = document.createElement('div')
    tmp.innerHTML = html
    var node = tmp.firstChild
    if(node) {
      inner.appendChild(node)
      observeLazyImages(inner)
      _gridRenderedCount++
    }
  }

  var base = 'Results: ' + _gridListings.length
  if(_favoritesOnly) base += ' (favorites)'
  if(hasActiveShapeFilter()) base += ' (area filtered)'
  if(_gridRenderedCount < _gridListings.length)
    $('.resultscount').text(base + ' (showing ' + _gridRenderedCount + ')')
  else
    $('.resultscount').text(base)
}

function renderGrid() {
  var container = $('#gridContainer')
  container.empty()
  _gridRenderedCount = 0
  var countText = 'Results: ' + _gridListings.length
  if(_favoritesOnly) countText += ' (favorites)'
  if(hasActiveShapeFilter()) countText += ' (area filtered)'
  $('.resultscount').text(countText)

  if(_gridMode === 'cards')
    container.html('<div class="grid-cards" id="gridInner"></div>')
  else
    container.html('<div class="grid-rows" id="gridInner"></div>')

  renderGridBatch()
  var $cw = $('.content-wrapper')
  $cw.off('scroll.gridInfinite').on('scroll.gridInfinite', onGridScroll)
}

function onGridScroll() {
  if(_gridRenderedCount >= _gridListings.length) return
  if(_gridScrollTimer) return
  _gridScrollTimer = setTimeout(function(){
    _gridScrollTimer = null
    var $cw = $('.content-wrapper')
    var scrollBottom = $cw.scrollTop() + $cw.innerHeight()
    var scrollHeight = $cw[0].scrollHeight
    if(scrollBottom >= scrollHeight - 600)
      renderGridBatch()
  }, 80)
}

function renderGridBatch() {
  var inner = document.getElementById('gridInner')
  if(!inner) return
  var end = Math.min(_gridRenderedCount + _gridBatchSize, _gridListings.length)
  var frag = document.createDocumentFragment()
  var tmp = document.createElement('div')
  var html = ''
  for(var i = _gridRenderedCount; i < end; i++) {
    html += _gridMode === 'cards' ? buildCardHtml(_gridListings[i]) : buildRowHtml(_gridListings[i])
  }
  tmp.innerHTML = html
  while(tmp.firstChild) frag.appendChild(tmp.firstChild)
  inner.appendChild(frag)
  observeLazyImages(inner)
  _gridRenderedCount = end
  var base = 'Results: ' + _gridListings.length
  if(_favoritesOnly) base += ' (favorites)'
  if(hasActiveShapeFilter()) base += ' (area filtered)'
  if(_gridRenderedCount < _gridListings.length)
    $('.resultscount').text(base + ' (showing ' + _gridRenderedCount + ')')
  else
    $('.resultscount').text(base)
}

function buildCardHtml(listing) {
  var img = listing.picture_url || ''
  var imgHtml = img ? '<img class="grid-card-img" data-src="'+img+'" referrerpolicy="no-referrer">' : '<div class="grid-card-img grid-card-noimg"><i class="fa fa-image"></i></div>'
  var pics = listing.picture_urls || []
  var hasGallery = pics.length > 1
  var photoBtnHtml = hasGallery
    ? '<button class="btn btn-xs btn-info" onclick="openPhotoGallery(gridListingPhotos(\''+listing._id+'\'))"><i class="fa fa-camera"></i> '+pics.length+'</button>'
    : ''
  // Clicking the card image opens the same gallery as the photos button.
  var imgWrapAttrs = (img && hasGallery)
    ? ' onclick="openPhotoGallery(gridListingPhotos(\''+listing._id+'\'))" style="cursor:pointer" title="View all photos"'
    : ''
  var details = []
  if(listing.bedrooms) details.push(listing.bedrooms + ' bd')
  if(listing.bathrooms) details.push(listing.bathrooms + ' ba')
  if(listing.beds) details.push(listing.beds + ' beds')
  // QA stores area; FB stores sqMeters
  var m2 = listing.area || listing.sqMeters
  if(m2) details.push(m2 + ' m²')
  var pk = listing.parkingSpaces != null ? listing.parkingSpaces : listing.parking
  if(pk) details.push(pk + ' parking')

  var amenityHtml = ''
  if(listing.amenities && listing.amenities.length) {
    var hideList = getHideAmenities()
    var shownAmenities = hideList.length ? listing.amenities.filter(function(a){ return hideList.indexOf(a) === -1 }) : listing.amenities
    if(shownAmenities.length) {
      amenityHtml = '<div class="grid-card-amenities">'
      shownAmenities.forEach(function(a){ amenityHtml += '<span class="amenity-bubble">'+a+'</span>' })
      amenityHtml += '</div>'
    }
  }

  var html = '<div class="grid-card" data-listingid="'+listing._id+'">'
  html += '  <div class="grid-card-img-wrap"'+imgWrapAttrs+'>'+imgHtml+'</div>'
  html += '  <div class="grid-card-body">'
  html += '    <div class="grid-card-title" title="'+listing.title+'">'+listing.title+'</div>'
  html += '    <div class="grid-card-price">$'+getDisplayPrice(listing)+'</div>'
  html += '    <div class="grid-card-details">'+details.join(' &middot; ')+'</div>'
  html += amenityHtml
  var favColor = isFavorite(listing._id) ? '#e74c3c' : '#ccc'
  var disColor = isDisliked(listing._id) ? '#34495e' : '#ccc'
  html += '    <div class="grid-card-actions">'
  html += '      <button class="btn btn-xs" data-listingid="'+listing._id+'" onclick="toggleFavoriteBtn(this)" title="Toggle favorite"><i class="fa fa-heart" style="color:'+favColor+'"></i></button>'
  html += '      <button class="btn btn-xs" data-listingid="'+listing._id+'" onclick="toggleDislikeBtn(this)" title="Toggle dislike"><i class="fa fa-thumbs-down" style="color:'+disColor+'"></i></button>'
  html += '      '+photoBtnHtml
  if(listing.platform === 'airbnb') {
    if(listing.availability) html += '      <button class="btn btn-xs btn-warning" onclick="openAvailabilityCalendar(\''+listing._id+'\')" title="Show 12-month availability"><i class="fa fa-calendar"></i></button>'
    else html += '      <button class="btn btn-xs btn-default" style="opacity:0.6" disabled title="Availability data not yet fetched. Refresh listing to update."><i class="fa fa-calendar-o"></i></button>'
  }
  if(listing.lat && listing.lon) html += '      <button class="btn btn-xs btn-info" onclick="googleMapsReady.then(function(){openListingMapPopup('+listing.lat+','+listing.lon+',\''+listing.title.replace(/'/g,"\\'")+'\')})" title="Show on map"><i class="fa fa-map-marker"></i> Map</button>'
  html += '      <a class="btn btn-xs btn-success" href="'+listing.url+'" target="_blank" title="Open listing"><i class="fa fa-external-link"></i></a>'
  html += '    </div>'
  html += '  </div>'
  html += '</div>'
  return html
}

function buildRowHtml(listing) {
  var details = []
  if(listing.bedrooms) details.push(listing.bedrooms + ' bd')
  if(listing.bathrooms) details.push(listing.bathrooms + ' ba')
  if(listing.beds) details.push(listing.beds + ' beds')
  // QA stores area; FB stores sqMeters
  var m2 = listing.area || listing.sqMeters
  if(m2) details.push(m2 + ' m²')
  var pk = listing.parkingSpaces != null ? listing.parkingSpaces : listing.parking
  if(pk) details.push(pk + ' parking')

  var pics = listing.picture_urls || []
  if(!pics.length && listing.picture_url) pics = [listing.picture_url]
  var cats = groupPhotoCategories(listing.photo_categories)

  var imagesHtml = ''
  if(cats && Object.keys(cats).length) {
    // Separate multi-pic categories from single-pic categories
    var multiCats = {}, singleCats = {}
    Object.keys(cats).forEach(function(cat) {
      if(cats[cat].length > 1) multiCats[cat] = cats[cat]
      else singleCats[cat] = cats[cat]
    })

    imagesHtml = '<div class="grid-row-categories">'
    // Render multi-pic categories normally
    Object.keys(multiCats).forEach(function(cat) {
      imagesHtml += '<div class="grid-row-cat">'
      imagesHtml += '<div class="grid-row-cat-title">'+cat+'</div>'
      imagesHtml += '<div class="grid-row-images">'
      multiCats[cat].forEach(function(url) {
        imagesHtml += '<img class="grid-row-img" data-src="'+(typeof upgradeQaImageUrl === 'function' ? upgradeQaImageUrl(url, 'auto') : url)+'" referrerpolicy="no-referrer" onclick="openPhotoZoom(this)">'
      })
      imagesHtml += '</div></div>'
    })
    // Combine single-pic categories into one row with overlaid labels
    var singleKeys = Object.keys(singleCats)
    if(singleKeys.length) {
      imagesHtml += '<div class="grid-row-cat">'
      imagesHtml += '<div class="grid-row-images">'
      singleKeys.forEach(function(cat) {
        var url = singleCats[cat][0]
        imagesHtml += '<div class="grid-row-img-labeled">'
        imagesHtml += '<img class="grid-row-img" data-src="'+(typeof upgradeQaImageUrl === 'function' ? upgradeQaImageUrl(url, 'auto') : url)+'" referrerpolicy="no-referrer" onclick="openPhotoZoom(this)">'
        imagesHtml += '<span class="grid-row-img-label">'+cat+'</span>'
        imagesHtml += '</div>'
      })
      imagesHtml += '</div></div>'
    }
    imagesHtml += '</div>'
  } else {
    imagesHtml = '<div class="grid-row-images-wrap"><div class="grid-row-images">'
    pics.forEach(function(url) {
      imagesHtml += '<img class="grid-row-img" data-src="'+(typeof upgradeQaImageUrl === 'function' ? upgradeQaImageUrl(url, 'auto') : url)+'" referrerpolicy="no-referrer" onclick="openPhotoZoom(this)">'
    })
    imagesHtml += '</div></div>'
  }

  var amenityHtml = ''
  if(listing.amenities && listing.amenities.length) {
    var hideList = getHideAmenities()
    var shownAmenities = hideList.length ? listing.amenities.filter(function(a){ return hideList.indexOf(a) === -1 }) : listing.amenities
    if(shownAmenities.length) {
      amenityHtml = '<span class="grid-row-amenities">'
      shownAmenities.forEach(function(a){ amenityHtml += '<span class="amenity-bubble">'+a+'</span>' })
      amenityHtml += '</span>'
    }
  }

  var collapsedClass = isRowCollapsed(listing._id) ? ' collapsed' : ''
  var html = '<div class="grid-row-item'+collapsedClass+'" data-listingid="'+listing._id+'">'
  html += '  <div class="grid-row-header">'
  html += '    <button class="grid-row-collapse-btn" onclick="toggleRowCollapse(this)" title="Collapse/expand"><i class="fa fa-chevron-up"></i></button>'
  html += '    <span class="grid-row-title" title="'+listing.title+'">'+listing.title+'</span>'
  html += '    <span class="grid-row-price">$'+getDisplayPrice(listing)+'</span>'
  html += '    <span class="grid-row-details">'+details.join(' &middot; ')+'</span>'
  var favColor = isFavorite(listing._id) ? '#e74c3c' : '#ccc'
  var disColor = isDisliked(listing._id) ? '#34495e' : '#ccc'
  html += '    '+amenityHtml
  // Action buttons live in a single flex item that takes the full row width,
  // forcing the wrap and giving us direct control over the row spacing via
  // negative margin-top (which the flex parent's gap:8px would otherwise enforce).
  html += '    <div class="grid-row-actions" style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:4px;margin-top:-4px">'
  html += '<button class="btn btn-xs" data-listingid="'+listing._id+'" onclick="toggleFavoriteBtn(this)" title="Toggle favorite"><i class="fa fa-heart" style="color:'+favColor+'"></i></button>'
  html += '<button class="btn btn-xs" data-listingid="'+listing._id+'" onclick="toggleDislikeBtn(this)" title="Toggle dislike"><i class="fa fa-thumbs-down" style="color:'+disColor+'"></i></button>'
  var totalPics = (listing.picture_urls && listing.picture_urls.length) || (listing.picture_url ? 1 : 0)
  if(totalPics > 0) html += '<button class="btn btn-xs btn-info" onclick="openPhotoGallery(gridListingPhotos(\''+listing._id+'\'))" title="Photo slideshow"><i class="fa fa-camera"></i> '+totalPics+'</button>'
  if(listing.platform === 'airbnb') {
    if(listing.availability) html += '<button class="btn btn-xs btn-warning" onclick="openAvailabilityCalendar(\''+listing._id+'\')" title="Show 12-month availability"><i class="fa fa-calendar"></i> Availability</button>'
    else html += '<button class="btn btn-xs btn-default" style="opacity:0.6" disabled title="Availability data not yet fetched. Refresh listing to update."><i class="fa fa-calendar-o"></i> Availability</button>'
  }
  if(listing.lat && listing.lon) html += '<button class="btn btn-xs btn-info" onclick="googleMapsReady.then(function(){openListingMapPopup('+listing.lat+','+listing.lon+',\''+listing.title.replace(/'/g,"\\'")+'\')})" title="Show on map"><i class="fa fa-map-marker"></i> Map</button>'
  if(listing.lat && listing.lon) html += '<a class="btn btn-xs btn-default" href="https://www.google.com/maps/search/?api=1&query='+listing.lat+','+listing.lon+'" target="_blank" title="Open in Google Maps"><i class="fa fa-external-link"></i> GMaps</a>'
  var visitLabel = listing.platform === 'airbnb' ? 'Airbnb'
    : listing.platform === 'facebook' ? 'Facebook'
    : listing.platform === 'quintoandar' ? 'Quinto Andar'
    : 'Visit'
  html += '<a class="btn btn-xs btn-success" href="'+listing.url+'" target="_blank"><i class="fa fa-external-link"></i> '+visitLabel+'</a>'
  html += '</div>'
  html += '  </div>'
  html += '  <div class="grid-row-body">'+imagesHtml+'</div>'
  html += '</div>'
  return html
}

function toggleRowCollapse(btn) {
  var $item = $(btn).closest('.grid-row-item')
  var isCollapsing = !$item.hasClass('collapsed')
  $item.toggleClass('collapsed')
  setRowCollapsed($item.data('listingid'), isCollapsing)
  if(isCollapsing) {
    // Scroll so the listing header is at the top of the viewport
    var $cw = $('.content-wrapper')
    var itemTop = $item.offset().top
    var cwTop = $cw.offset().top
    var targetScroll = $cw.scrollTop() + (itemTop - cwTop) - 4
    $cw.animate({ scrollTop: targetScroll }, 250)
  }
}

function uncollapseAllRows() {
  localStorage.setItem('collapsedRowIds', '[]')
  $('.grid-row-item.collapsed').removeClass('collapsed')
}

function gridListingPhotos(listingId) {
  var listing = _gridListings.find(function(a){ return a._id === listingId })
  var urls = (listing && listing.picture_urls && listing.picture_urls.length) ? listing.picture_urls : (listing && listing.picture_url ? [listing.picture_url] : [])
  var cats = (listing && listing.photo_categories) ? groupPhotoCategories(listing.photo_categories) : null
  return {urls: urls, categories: cats}
}

function groupPhotoCategories(cats) {
  if(!cats) return null
  var grouped = {}
  Object.keys(cats).forEach(function(key) {
    var norm = key.replace(/\s*(image|photo|picture|img|pic)\s*\d+\s*$/i, '').replace(/^\s*(image|photo|picture|img|pic)\s*\d+\s*[-\u2013\u2014:.]?\s*(of\s+)?/i, '').trim()
    var gkey = norm || key
    if(!grouped[gkey]) grouped[gkey] = []
    grouped[gkey] = grouped[gkey].concat(cats[key])
  })
  return grouped
}
