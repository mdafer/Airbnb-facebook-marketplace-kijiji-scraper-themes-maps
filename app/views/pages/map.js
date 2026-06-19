var mappage= toolbarHtml + `
    <!-- Main content -->
    <section class="content">
      <p class='resultscount'>Number of results: 0</p>
      <input
        id="pac-input"
        class="controls"
        type="text"
        placeholder="Focus map on location"
      />
      <div id="map"> </div>
    </section>
`;
function mapfunc()
{
  setViewMode('map')
  visitedUrls = JSON.parse(localStorage.getItem('visitedUrls'+jobId)) || []
  // Render the info panel from the persistent buffer (don't clear it — that's
  // only for the trash button). This preserves the log across navigation.
  if (typeof renderInfoMessages === 'function') renderInfoMessages()
  else mapClearInformationWindow()

  $(".BStooltip").tooltip({ trigger: 'hover', container: 'body', placement: 'auto bottom' })
  var reader = new FileReader()
  document.getElementById('importViewedbtn').addEventListener('change', (event) => {
    const myfile = event.target.files[0]
    reader.onload = updateViewedList
    reader.readAsText(myfile)
  })

  $('#searchTitleOnly').prop('checked', false);

  $('#pageTitle').text(jobName)

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

  // Load hideAmenities from user account settings
  APIgetProfile(null, function(user){
    if(user) _savedHideAmenities = parseAmenityList(user.hideAmenities)
  })

  $('#filtersModal').on('show.bs.modal', function(){ updateAmenityBubbles() })

  googleMapsReady.then(function() { initMap($('#filtersForm').serialize()) })

  $('#filtersForm').on('submit', function(event) {
    event.preventDefault();
    $('#filtersModal').modal('hide');
    saveFilters()
    updateFilterIndicator()
    getListingsAsync($('#filtersForm').serialize())
  });

  setupSocketListeners()
}

function mapUnload()
{
  $('#filtersForm').off('submit')
  $('#filtersModal').off('show.bs.modal')
  teardownSocketListeners()
  // Cancel any in-progress draw, but preserve a completed shape for other views
  cancelCustomDraw()
  if(_drawnShape) {
    // Save geometry before detaching
    _shapeFilterGeo = _extractShapeGeo(_drawnShape)
    _drawnShape.setMap(null)
  }
}
