var searchespage= `<!-- Content Header (Page header) -->
    
    <section class="content-header">
      <button class="btn btn-light" type="button" onclick="loadpage('main', true);">
        <span class="fa fa-chevron-left" aria-hidden="true"></span>
      </button><h1 style="display: inline;vertical-align:  middle;">
        My Searches
        <small></small>
      </h1>
      <button id="viewSelectedBtn" type="button" class="btn btn-info" onclick="viewSelectedSearches()" disabled><i class="fa fa-eye"></i> View Selected</button>
      <button id="refreshSelectedBtn" type="button" class="btn btn-warning" onclick="refreshSelectedSearches()" disabled><i class="fa fa-refresh"></i> Refresh Selected</button>
      <div class="btn-group">
        <button id="moveToGroupBtn" type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" disabled><i class="fa fa-folder"></i> Move to Group <span class="caret"></span></button>
        <ul id="moveToGroupMenu" class="dropdown-menu"></ul>
      </div>
      <button type="button" class="btn btn-default" onclick="createNewSearchGroup()"><i class="fa fa-folder-open"></i> New Group</button>
      <button id="exportSearchesBtn" type="button" class="btn btn-default" onclick="exportSelectedSearches()" disabled><i class="fa fa-download"></i> Export</button>
      <button type="button" class="btn btn-default" onclick="document.getElementById('importSearchesFile').click()"><i class="fa fa-upload"></i> Import</button>
      <input type="file" id="importSearchesFile" accept="application/json,.json" style="display:none">
      <button type="button" class="btn btn-success" data-toggle="modal" data-target="#newSearchModal">New Search</button>
    </section>

    <!-- Main content -->
    <section class="content">
    
      <!-- Info boxes -->
      <div class="row">

        <!-- fix for small devices only -->
        <div class="clearfix visible-sm-block"></div>

        <div class="box box-info" data-ol-has-click-handler="">
            <div class="box-header with-border">
              <h3 class="box-title" style="display:inline-block;margin-right:12px">Search Jobs</h3>
              <div class="pull-right" style="max-width:260px">
                <input type="text" id="searchesFilterInput" class="form-control input-sm" placeholder="Filter by name...">
              </div>
            </div>
            <!-- /.box-header -->
            <div class="box-body">
              <div class="table-responsive">
                <table id="searchesTable" class="table no-margin">
                  <thead>
                  <tr>
                    <th><input type="checkbox" id="selectAllSearches" title="Select all"></th>
                    <th>Actions</th>
                    <th class="sortable" data-sort="platform" style="cursor:pointer;user-select:none">Platform</th>
                    <th class="sortable" data-sort="status" style="cursor:pointer;user-select:none">Status</th>
                    <th class="sortable" data-sort="name" style="cursor:pointer;user-select:none">Name</th>
                    <th>Description</th>
                    <th class="sortable" data-sort="lastUpdated" style="cursor:pointer;user-select:none">Last Updated</th>
                    <th>Link</th>
                  </tr>
                  </thead>
                  <tbody id="searchesTBody">
                  </tbody>
                </table>
              </div>
              <!-- /.table-responsive -->
            </div>
            <!-- /.box-body -->
            <div class="box-footer clearfix">
              <a class="btn btn-sm btn-info btn-flat pull-left" data-toggle="modal" data-target="#newSearchModal">New Search</a>
            </div>
            <!-- /.box-footer -->
          </div>

        
      </div>
    </section>
    <!-- /.content -->

    <!-- New Search Modal -->
<div id="newSearchModal" class="modal fade" role="dialog" style="display: none;">
  <div class="modal-dialog">

    <!-- Modal content-->
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal">×</button>
        <h4 class="modal-title">New Search</h4>
      </div>
      <div class="modal-body">
        <div class="box-body">
          <form role="form" id="newSearchForm" data-toggle="validator">
            <div class="form-group">
              <label>Platform</label>
              <select id="newSearchPlatform" name="platform" class="form-control" required>
                <option value="kijiji">Kijiji</option>
                <option value="airbnb">Airbnb</option>
                <option value="facebook">Facebook Marketplace</option>
                <option value="quintoandar">Quinto Andar (Sales)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Name</label>
              <input name="name" type="text" class="form-control" placeholder="Search Name" required>
            </div><!-- text input -->
            <div class="form-group">
              <label id="newSearchUrlLabel">First Page Link (after you click search)</label>
              <input name="url" type="text" class="form-control" id="newSearchUrlInput" placeholder="https://www.kijiji.ca/..." required>
            </div>
            

            <div id="newSearchQuintoExtras" style="display:none">
              <div class="form-group">
                <label>Search Area <small class="text-muted" id="newSearchBboxHint">— draw a circle, polygon, or rectangle. QA's URL doesn't encode map position, so we must capture it here. The shape's bounding box is sent to QA.</small></label>
                <div style="margin-bottom:6px">
                  <button type="button" class="btn btn-sm btn-default" id="newSearchBboxDrawBtn"><i class="fa fa-pencil"></i> Draw shape</button>
                  <button type="button" class="btn btn-sm btn-default" id="newSearchBboxUseViewBtn"><i class="fa fa-crop"></i> Use current map view</button>
                  <button type="button" class="btn btn-sm btn-default" id="newSearchBboxClearBtn" style="display:none"><i class="fa fa-times"></i> Clear</button>
                  <span id="newSearchBboxStatus" class="text-muted" style="margin-left:8px">(no area set — search will use the whole region implied by the URL slug)</span>
                </div>
                <div id="newSearchBboxMap" style="width:100%;height:260px;border:1px solid #ddd;border-radius:4px"></div>
              </div>
            </div>

            <div id="newSearchAirbnbExtras" style="display:none">
              <div class="form-group">
                <label>Grid Splits <i class="fa fa-question-circle BStooltip" style="cursor:help" data-placement="top" title="Splits the map area into smaller cells to find more listings. Depth 1 = 4 cells, 2 = 16 cells, 3 = 64 cells, 4 = 256 cells. Dense areas auto-split further if results are capped."></i></label>
                <input name="gridDepth" type="number" class="form-control" min="1" max="4" placeholder="1 (default)" value="1">
              </div>
              <div class="checkbox"><label><input type="checkbox" name="fetchDetails" value="1" checked> Fetch full photos &amp; amenities <small class="text-muted">(slower — visits each listing page)</small></label></div>
              <div class="checkbox"><label><input type="checkbox" name="fetchAvailability" value="1" checked> Fetch availability calendar</label></div>
              <div class="checkbox"><label><input type="checkbox" name="autoConfirmEmpty" id="newSearchAutoConfirmEmpty" value="1"> Auto confirm no listings <small class="text-muted">(skip soft-block prompts)</small></label></div>
            </div>

            <!-- textarea -->
            <div class="form-group">
              <label>Search Description</label>
              <textarea name="description" class="form-control" rows="3" placeholder="Room for rent in Toronto Price between 500 and 900"></textarea>
            </div>
            <input type="submit" value="Submit" style="display:none;">
          </form>
        </div>
      </div>
      <div class="modal-footer">
        <div class="pull-left">
          <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
        </div>
        <div class="pull-right">
          <button type="button" class="btn btn-primary" onclick="$('#newSearchForm').submit();">Save</button>
        </div>
      </div>
    </div>

  </div>
</div>
<!-- New Search Modal END-->

<!-- Edit Job Modal -->
<div id="editSearchModal" class="modal fade" role="dialog" style="display: none;">
  <div class="modal-dialog">

    <!-- Modal content-->
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal">×</button>
        <h4 class="modal-title">Edit Job</h4>
      </div>
      <div class="modal-body">
        <div class="box-body">
          <form role="form" id="editSearchForm" data-toggle="validator">
            <div class="form-group">
              <label>Search Name</label>
              <input id="searchId" name="id" hidden>
              <input id="searchNameBox" name="name" type="text" class="form-control" placeholder="Name" required>
            </div>

            <div class="form-group">
              <label>Search URL</label>
              <input id="searchUrlBox" name="url" type="url" class="form-control" placeholder="https://" required>
            </div>

            <!-- textarea -->
            <div class="form-group">
              <label>Search Description</label>
              <textarea id ="searchDescriptionBox" name="description" class="form-control" rows="3" placeholder="Description"></textarea>
            </div>
            <div class="form-group">
              <label>Group</label>
              <select id="searchGroupBox" name="groupId" class="form-control"></select>
            </div>
            <div id="editSearchAirbnbExtras" style="display:none">
              <div class="form-group">
                <label>URL Parameters</label>
                <div id="editSearchUrlParams" class="row"></div>
              </div>
              <div class="form-group">
                <label>Grid Splits <i class="fa fa-question-circle BStooltip" style="cursor:help" data-placement="top" title="Splits the map area into smaller cells to find more listings. Depth 1 = 4 cells, 2 = 16 cells, 3 = 64 cells, 4 = 256 cells. Dense areas auto-split further if results are capped."></i></label>
                <input id="searchGridDepthBox" name="gridDepth" type="number" class="form-control" min="1" max="4" placeholder="1 (default)">
              </div>
            </div>
            <div id="editSearchQuintoExtras" style="display:none">
              <div class="form-group">
                <label>Search Area <small class="text-muted" id="editSearchBboxHint">— draw a circle, polygon, or rectangle.</small></label>
                <div style="margin-bottom:6px">
                  <button type="button" class="btn btn-sm btn-default" id="editSearchBboxDrawBtn"><i class="fa fa-pencil"></i> Draw shape</button>
                  <button type="button" class="btn btn-sm btn-default" id="editSearchBboxUseViewBtn"><i class="fa fa-crop"></i> Use current map view</button>
                  <button type="button" class="btn btn-sm btn-default" id="editSearchBboxClearBtn" style="display:none"><i class="fa fa-times"></i> Clear</button>
                  <span id="editSearchBboxStatus" class="text-muted" style="margin-left:8px">(no area set)</span>
                </div>
                <div id="editSearchBboxMap" style="width:100%;height:260px;border:1px solid #ddd;border-radius:4px"></div>
              </div>
            </div>
            <input type="submit" value="Submit" style="display:none;">
          </form>
        </div>
      </div>
      <div class="modal-footer">
        <div class="pull-left">
          <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
        </div>
        <div class="pull-right">
          <button type="button" class="btn btn-primary" onclick="$('#editSearchForm').data('runNow', false).submit();">Save</button>
          <button type="button" class="btn btn-success" onclick="$('#editSearchForm').data('runNow', true).submit();">Run Now</button>
        </div>
      </div>
    </div>

  </div>
</div>
<!-- Edit Job Modal END-->
`;

function searchesfunc()
{
  $('#searchesTBody').html('')
  $(document).off('click.searchesActions')
  _searchesNameFilter = ''
  _searchesSort = null
  _searchesSelectedIds = {}
  $('#importSearchesFile').off('change.searchesImport').on('change.searchesImport', function(e) {
    var file = e.target.files && e.target.files[0]
    if(file) importSearchesFromFile(file)
    this.value = ''
  })
  if(_searchesFilterTimer) { clearTimeout(_searchesFilterTimer); _searchesFilterTimer = null }
  $('#searchesFilterInput').val('').off('input.searchesFilter').on('input.searchesFilter', function() {
    var val = $(this).val()
    if(_searchesFilterTimer) clearTimeout(_searchesFilterTimer)
    _searchesFilterTimer = setTimeout(function() {
      _searchesFilterTimer = null
      _searchesNameFilter = val
      renderSearchesTable()
    }, 200)
  })
  $('#searchesTable').off('click.searchesSort').on('click.searchesSort', 'th.sortable', function() {
    var field = $(this).data('sort')
    if(_searchesSort && _searchesSort.field === field)
      _searchesSort.dir = _searchesSort.dir === 'asc' ? 'desc' : 'asc'
    else
      _searchesSort = { field: field, dir: field === 'lastUpdated' ? 'desc' : 'asc' }
    renderSearchesTable()
  })

  // Set platform filter from URL params
  var searchPlatformFilter = urlParams.platform || null
  if(searchPlatformFilter) {
    $('#newSearchPlatform').val(searchPlatformFilter)
  }

  // Update URL placeholder when platform changes
  $('#newSearchPlatform').on('change', function() {
    var plat = $(this).val()
    if(plat === 'airbnb') {
      $('#newSearchUrlInput').attr('placeholder', 'https://www.airbnb.ca/s/Toronto/...')
      $('#newSearchUrlLabel').text('Airbnb Search Link')
      $('#newSearchAirbnbExtras').show()
      if(window._airbnbAutoConfirmEmpty) $('#newSearchAutoConfirmEmpty').prop('checked', true)
    } else if(plat === 'facebook') {
      $('#newSearchUrlInput').attr('placeholder', 'https://www.facebook.com/marketplace/category/propertyrentals?...')
      $('#newSearchUrlLabel').text('Facebook Marketplace Search Link')
      $('#newSearchAirbnbExtras').hide()
      $('#newSearchBboxHint').text("— click “Draw shape”, then click two opposite corners on the map. Facebook's URL doesn't encode map position, so we send this area as latitude/longitude/radius.")
      $('#newSearchQuintoExtras').show()
      initQuintoBboxPicker('new')
    } else if(plat === 'quintoandar') {
      $('#newSearchUrlInput').attr('placeholder', 'https://www.quintoandar.com.br/comprar/imovel/sao-paulo-sp-brasil/...')
      $('#newSearchUrlLabel').text('Quinto Andar Sales Search Link')
      $('#newSearchAirbnbExtras').hide()
      $('#newSearchBboxHint').text("— click “Draw shape”, then click two opposite corners on the map. QA's URL doesn't encode map position, so we capture this area and send its bounding box to QA.")
      $('#newSearchQuintoExtras').show()
      initQuintoBboxPicker('new')
    } else {
      $('#newSearchUrlInput').attr('placeholder', 'https://www.kijiji.ca/...')
      $('#newSearchUrlLabel').text('Kijiji First Page Link (after you click search)')
      $('#newSearchAirbnbExtras').hide()
      $('#newSearchQuintoExtras').hide()
    }
  }).trigger('change')
  $('#newSearchAirbnbExtras .BStooltip').tooltip({ trigger: 'hover', container: 'body' })

  _loadCollapsedSearchGroups()
  APIgetProfile(null, function(user){
    _searchGroups = (user && Array.isArray(user.searchGroups)) ? user.searchGroups : []
    if(!user.jobs || !user.jobs.length)
    {
      $('#searchesTBody').append(`
        <tr>
        <td>
        You don't have any jobs yet!
        </td>
        </tr>
      `)
      updateMoveToGroupBtn()
      updateExportSelectedBtn()
      return
    }
    jobs = user.jobs
    // Filter by platform if specified
    _searchesJobs = searchPlatformFilter ? user.jobs.filter(j => (j.platform || 'kijiji') === searchPlatformFilter) : user.jobs
    renderSearchesTable()

    $(document).on('click.searchesActions', '#searchesTBody .stopSearchBtn', function(event){
      event.preventDefault();
      var stopId = $(this).data('id')
      var stopName = $(this).data('name') || 'this search'
      var mode = $(this).attr('data-mode') || 'stop'
      var title = mode === 'dequeue' ? 'Remove from Queue' : 'Stop Search'
      var message = mode === 'dequeue'
        ? 'Remove "' + stopName + '" from the refresh queue?'
        : 'Stop running search "' + stopName + '"? You can re-run it later with Run Now.'
      var confirmLabel = mode === 'dequeue' ? 'Remove' : 'Stop'
      showConfirmModal(
        title,
        message,
        function() {
          APIstopJob(JSON.stringify({jobId: stopId}), ()=>{
            setTimeout(()=>{renderpage('searches')},300)
          })
        },
        { confirmLabel: confirmLabel, confirmClass: 'btn-warning' }
      )
    })

    $(document).on('click.searchesActions', '#searchesTBody .refetchPhotosBtn', function(event){
      event.preventDefault();
      var rfId = $(this).data('id')
      var rfName = $(this).data('name') || 'this search'
      showConfirmModal(
        'Re-scrape missing photos',
        'Refetch photos for listings in "' + rfName + '" that have no pictures. Progress will be shown in the job log. Continue?',
        function() {
          APIrefetchMissingPhotos(rfId)
        },
        { confirmLabel: 'Refetch', confirmClass: 'btn-info' }
      )
    })

    $(document).on('click.searchesActions', '#searchesTBody .clearCacheBtn', function(event){
      event.preventDefault();
      var ccId = $(this).data('id')
      var ccName = $(this).data('name') || 'this search'
      showConfirmModal(
        'Clear cached listings',
        'Remove all cached listings for "' + ccName + '" from the database so the next run re-scrapes everything from scratch. This cannot be undone. Continue?',
        function() {
          APIclearJobListings(JSON.stringify({jobId: ccId}), function(result){
            showAlertModal('Cache cleared', 'Cleared <strong>' + ((result && result.removed) || 0) + '</strong> cached listings. Run the search again to re-scrape from scratch.')
          })
        },
        { confirmLabel: 'Clear cache', confirmClass: 'btn-warning' }
      )
    })

    $(document).on('click.searchesActions', '#searchesTBody .delSearchBtn', function(event){
      event.preventDefault();
      var delId = $(this).data('id')
      showConfirmModal(
        'Delete Search',
        'Are you sure you want to delete this search? This cannot be undone.',
        function() {
          APIdeleteJob(JSON.stringify({id: delId}), ()=>{
            localStorage.removeItem('visitedUrls'+jobId)
            setTimeout(()=>{renderpage('searches')},300)
          })
        },
        { confirmLabel: 'Delete', confirmClass: 'btn-danger' }
      )
    })

    $(document).on('click.searchesActions', '#searchesTBody .editSearchBtn', function(event){
      event.preventDefault();
      var jobIdForEdit = $(this).data('id')
      var jobPlatform = $(this).data('platform')
      var currentGroupId = $(this).data('groupId') || ''
      $('#editSearchForm').data('jobId', jobIdForEdit).data('platform', jobPlatform)
      $('#searchId').val(jobIdForEdit)
      $('#searchNameBox').val($(this).data('name'))
      $('#searchUrlBox').val($(this).data('url'))
      $('#searchDescriptionBox').val($(this).data('description'))
      var groupOptions = '<option value="">Ungrouped</option>' + _searchGroups.map(function(g){
        return '<option value="' + _escapeHtml(g.id) + '"' + (String(g.id) === String(currentGroupId) ? ' selected' : '') + '>' + _escapeHtml(g.name) + '</option>'
      }).join('')
      $('#searchGroupBox').html(groupOptions)
      if(jobPlatform === 'airbnb') {
        $('#searchGridDepthBox').val($(this).data('gridDepth'))
        renderAirbnbUrlParamFields($(this).data('url'))
        $('#editSearchAirbnbExtras').show()
        $('#editSearchQuintoExtras').hide()
      } else if(jobPlatform === 'quintoandar') {
        $('#editSearchAirbnbExtras').hide()
        $('#editSearchUrlParams').empty()
        $('#editSearchBboxHint').text('— click “Draw shape”, then click two opposite corners on the map.')
        $('#editSearchQuintoExtras').show()
        var existingBbox = extractBboxFromUrl($(this).data('url'))
        initQuintoBboxPicker('edit', existingBbox)
      } else if(jobPlatform === 'facebook') {
        $('#editSearchAirbnbExtras').hide()
        $('#editSearchUrlParams').empty()
        $('#editSearchBboxHint').text("— click “Draw shape”, then click two opposite corners. Sent to Facebook as latitude/longitude/radius.")
        $('#editSearchQuintoExtras').show()
        var existingFbBbox = extractFbBboxFromUrl($(this).data('url'))
        initQuintoBboxPicker('edit', existingFbBbox)
      } else {
        $('#editSearchAirbnbExtras').hide()
        $('#editSearchQuintoExtras').hide()
        $('#editSearchUrlParams').empty()
      }
    })

    // Select-all checkbox
    $('#selectAllSearches').on('change', function(){
      var checked = this.checked
      $('.searchSelectCb').prop('checked', checked).each(function(){
        var id = $(this).data('jobid')
        if(checked) _searchesSelectedIds[id] = true
        else delete _searchesSelectedIds[id]
      })
      _syncGroupHeaderCheckboxes()
      updateViewSelectedBtn()
      updateRefreshSelectedBtn()
      updateMoveToGroupBtn()
      updateExportSelectedBtn()
    })
    // Individual checkbox updates button state
    $(document).on('change', '.searchSelectCb', function(){
      var id = $(this).data('jobid')
      if(this.checked) _searchesSelectedIds[id] = true
      else delete _searchesSelectedIds[id]
      _syncGroupHeaderCheckboxes()
      _syncSelectAllCheckbox()
      updateViewSelectedBtn()
      updateRefreshSelectedBtn()
      updateMoveToGroupBtn()
      updateExportSelectedBtn()
    })
    $(document).on('change', '.searchGroupHeaderCb', function(){
      toggleSearchGroupSelect($(this).data('groupid'), this.checked)
    })
    $(document).on('click.searchesActions', '.searchGroupTitle', function(e){
      var gid = $(this).data('groupid')
      if(!gid || gid === UNGROUPED_ID) return
      e.preventDefault()
      renameSearchGroup(gid)
    })
    $(document).on('keydown.searchesActions', '.searchGroupTitleInput', function(e){
      if(e.key === 'Enter') {
        e.preventDefault()
        $(this).data('committed', true)
        _commitRenameSearchGroup($(this).data('groupid'), this.value)
      } else if(e.key === 'Escape') {
        e.preventDefault()
        $(this).data('committed', true)
        _cancelRenameSearchGroup()
      }
    })
    $(document).on('blur.searchesActions', '.searchGroupTitleInput', function(){
      if($(this).data('committed')) return
      $(this).data('committed', true)
      _commitRenameSearchGroup($(this).data('groupid'), this.value)
    })
  })

  if(userId) {
    window._searchesSocketHandler = function(obj){
      if(obj && obj.channel === userId+'command' && obj.command === 'doneProcAndValid')
        renderpage('searches')
    }
    socket.on('all', window._searchesSocketHandler)
  }

  // Auto-fill description from Airbnb URL
  $('#newSearchUrlInput').on('input', function() {
    var platform = $('#newSearchPlatform').val()
    var descParts = []
    if(platform === 'airbnb') {
      var info = parseAirbnbUrl($(this).val())
      if(!info) return
      if(info.location) descParts.push(info.location)
      if(info.checkin && info.checkout) descParts.push(info.checkin + ' to ' + info.checkout)
      else if(info.monthlyStart) descParts.push(info.monthlyStart + ' (' + (info.monthlyLength || '') + ')')
      if(info.guests) descParts.push(info.guests)
      if(info.price) descParts.push(info.price)
      if(info.roomTypes) descParts.push(info.roomTypes)
      if(info.minBedrooms) descParts.push(info.minBedrooms)
      if(info.amenities) descParts.push(info.amenities)
    } else if(platform === 'quintoandar') {
      var qinfo = parseQuintoAndarUrl($(this).val())
      if(!qinfo) return
      if(qinfo.location) descParts.push(qinfo.location)
      if(qinfo.businessContext) descParts.push(qinfo.businessContext)
      if(qinfo.price) descParts.push(qinfo.price)
      if(qinfo.bedrooms) descParts.push(qinfo.bedrooms)
      if(qinfo.bathrooms) descParts.push(qinfo.bathrooms)
      if(qinfo.parking) descParts.push(qinfo.parking)
      if(qinfo.area) descParts.push(qinfo.area)
      if(qinfo.houseTypes) descParts.push(qinfo.houseTypes)
      if(qinfo.tags) descParts.push(qinfo.tags)
      if(qinfo.bbox) descParts.push(qinfo.bbox)
    } else return
    var descField = $('#newSearchForm textarea[name="description"]')
    // Only auto-fill if user hasn't manually typed a description
    if(!descField.data('manual')) descField.val(descParts.join(' | '))
  })
  $('#newSearchForm textarea[name="description"]').on('keydown', function() { $(this).data('manual', true) })

  $('#newSearchForm').on('submit', function(event) {
    event.preventDefault();
    // serializeObject returns a JSON STRING (named misleadingly) — parse it so
    // we can mutate before sending.
    var formData = JSON.parse($('#newSearchForm').serializeObject())
    if(formData.platform === 'airbnb') {
      formData.fetchDetails = formData.fetchDetails ? true : false
      formData.fetchAvailability = formData.fetchAvailability ? true : false
      formData.gridDepth = Number(formData.gridDepth) || 1
      if(typeof setAutoConfirmEmpty === 'function')
        setAutoConfirmEmpty(!!formData.autoConfirmEmpty)
    } else if(formData.platform === 'quintoandar') {
      var bbox = getQuintoBbox('new')
      if(!bbox) {
        showAlertModal('Search area required',
          'Quinto Andar URLs do not encode map position. Draw a shape on the map (circle, polygon, or rectangle) or click "Use current map view" so we know which area to scrape.')
        return
      }
      formData.url = applyBboxToUrl(formData.url, bbox)
      delete formData.gridDepth
    } else if(formData.platform === 'facebook') {
      var fbBbox = getQuintoBbox('new')
      if(!fbBbox) {
        showAlertModal('Search area required',
          'Facebook Marketplace URLs do not encode map position, so they fall back to your account default location. Draw a shape on the map (circle, polygon, or rectangle) or click "Use current map view" so we can send latitude/longitude/radius to Facebook.')
        return
      }
      formData.url = applyFbLocationToUrl(formData.url, fbBbox)
      delete formData.gridDepth
    } else {
      delete formData.gridDepth
    }
    delete formData.autoConfirmEmpty
    APIaddNewSearch(formData, ()=>{$('#newSearchModal').modal('hide');setTimeout(()=>{renderpage('searches')},300)})
  })

  // Wire up the bbox picker buttons (idempotent — handlers re-attached on each render)
  $('#newSearchBboxDrawBtn').off('click').on('click', function(){ _quintoStartDrawing('new') })
  $('#newSearchBboxUseViewBtn').off('click').on('click', function(){ _quintoUseCurrentView('new') })
  $('#newSearchBboxClearBtn').off('click').on('click', function(){ _quintoClearBbox('new') })
  $('#editSearchBboxDrawBtn').off('click').on('click', function(){ _quintoStartDrawing('edit') })
  $('#editSearchBboxUseViewBtn').off('click').on('click', function(){ _quintoUseCurrentView('edit') })
  $('#editSearchBboxClearBtn').off('click').on('click', function(){ _quintoClearBbox('edit') })
  $('#editSearchUrlParams').off('input.airbnbParams change.airbnbParams')
    .on('input.airbnbParams change.airbnbParams', '.airbnb-param-input', syncAirbnbUrlFromFields)
  $('#searchUrlBox').off('input.airbnbParams change.airbnbParams')
    .on('input.airbnbParams change.airbnbParams', function() {
      if($('#editSearchForm').data('platform') === 'airbnb')
        renderAirbnbUrlParamFields($(this).val())
    })

  $('#editSearchForm').on('submit', function(event) {
    event.preventDefault();
    // serializeObject returns a JSON STRING (named misleadingly) — parse it so
    // we can mutate before sending.
    const formData = JSON.parse($(this).serializeObject())
    const runNow = $(this).data('runNow')
    const jobId = $(this).data('jobId')
    const platform = $(this).data('platform')
    if(platform === 'airbnb') formData.gridDepth = Number(formData.gridDepth) || 1
    else delete formData.gridDepth
    if(platform === 'quintoandar') {
      var bbox = getQuintoBbox('edit')
      if(!bbox) {
        showAlertModal('Search area required',
          'Quinto Andar URLs do not encode map position. Draw a shape on the map or click "Use current map view".')
        return
      }
      formData.url = applyBboxToUrl(formData.url, bbox)
    }
    if(platform === 'facebook') {
      var fbBbox = getQuintoBbox('edit')
      if(!fbBbox) {
        showAlertModal('Search area required',
          'Facebook Marketplace URLs do not encode map position. Draw a shape on the map or click "Use current map view".')
        return
      }
      formData.url = applyFbLocationToUrl(formData.url, fbBbox)
    }
    if(!('groupId' in formData)) formData.groupId = ''
    APIupdateJob(formData, ()=>{
      $('#editSearchModal').modal('hide')
      if(runNow) {
        const resetParams = { jobId: jobId }
        if(platform === 'airbnb') resetParams.gridDepth = formData.gridDepth
        APIresetJob(JSON.stringify(resetParams), ()=>{
          setTimeout(()=>{renderpage('searches')},300)
        })
      } else {
        setTimeout(()=>{renderpage('searches')},300)
      }
    })
  })

  
}

function updateViewSelectedBtn() {
  var count = $('.searchSelectCb:checked').length
  $('#viewSelectedBtn').prop('disabled', count === 0)
  if(count > 0)
    $('#viewSelectedBtn').html('<i class="fa fa-eye"></i> View Selected (' + count + ')')
  else
    $('#viewSelectedBtn').html('<i class="fa fa-eye"></i> View Selected')
}

function viewSelectedSearches() {
  var selected = []
  var names = []
  $('.searchSelectCb:checked').each(function(){
    selected.push($(this).data('jobid'))
    names.push($(this).data('jobname'))
  })
  if(!selected.length) return
  // Single search: navigate directly to it
  if(selected.length === 1) {
    window.location.hash = 'grid?jobId=' + selected[0] + '&jobName=' + encodeURIComponent(names[0])
    renderpage()
    return
  }
  // Multiple: encode IDs in URL so the link is sharable
  localStorage.setItem('multiJobIds', JSON.stringify(selected))
  var label = selected.length + ' Searches'
  window.location.hash = 'grid?jobId=multi&jobIds=' + encodeURIComponent(selected.join(',')) + '&jobName=' + encodeURIComponent(label)
  renderpage()
}

function refreshSelectedSearches() {
  var selected = []
  var skipped = 0
  $('.searchSelectCb:checked').each(function(){
    var id = $(this).data('jobid')
    var job = _searchesJobs.find(function(j){ return String(j.id) === String(id) })
    if(job && (job.statusCode === 2 || job.queuedAt)) { skipped++; return }
    selected.push(id)
  })
  if(!selected.length) {
    if(skipped) showAlertModal('Nothing to queue', 'All selected searches are already running or queued.')
    return
  }
  var msg = 'Queue ' + selected.length + ' search' + (selected.length > 1 ? 'es' : '') + ' for refresh? They will run one after the other on the server — even if you close your browser.'
  if(skipped) msg += '<br><small class="text-muted">(' + skipped + ' already running/queued will be skipped.)</small>'
  showConfirmModal(
    'Refresh Selected',
    msg,
    function() {
      APIqueueJobs(JSON.stringify({ jobIds: selected }), function(){
        setTimeout(function(){ renderpage('searches') }, 300)
      })
    },
    { confirmLabel: 'Queue', confirmClass: 'btn-success' }
  )
}

function updateRefreshSelectedBtn() {
  var $btn = $('#refreshSelectedBtn')
  if(!$btn.length) return
  var count = $('.searchSelectCb:checked').length
  $btn.prop('disabled', count === 0)
  $btn.html('<i class="fa fa-refresh"></i> Refresh Selected' + (count > 0 ? ' (' + count + ')' : ''))
}

function parseAirbnbUrl(url) {
  try {
    var u = new URL(url)
    var p = u.searchParams
    var info = {}

    // Location from path: /s/Curitiba--PR/homes -> Curitiba, PR
    var pathMatch = u.pathname.match(/\/s\/([^/]+)/)
    if(pathMatch) info.location = decodeURIComponent(pathMatch[1]).replace(/--/g, ', ')
    // Override with query param if available
    if(p.get('query')) info.location = p.get('query')

    // Dates
    if(p.get('checkin')) info.checkin = p.get('checkin')
    if(p.get('checkout')) info.checkout = p.get('checkout')
    if(p.get('monthly_start_date')) info.monthlyStart = p.get('monthly_start_date')
    if(p.get('monthly_length')) info.monthlyLength = p.get('monthly_length') + ' months'

    // Guests
    var guests = []
    if(p.get('adults')) guests.push(p.get('adults') + ' adults')
    if(p.get('children')) guests.push(p.get('children') + ' children')
    if(p.get('infants')) guests.push(p.get('infants') + ' infants')
    if(p.get('pets')) guests.push(p.get('pets') + ' pets')
    if(guests.length) info.guests = guests.join(', ')

    // Price
    if(p.get('price_min') || p.get('price_max')) {
      var priceMin = p.get('price_min')
      var priceMax = p.get('price_max')
      info.price = priceMin && priceMax ? '$' + priceMin + ' - $' + priceMax
        : priceMax ? 'Up to $' + priceMax
        : '$' + priceMin + '+'
      if(p.get('price_filter_num_nights')) info.price += ' / ' + p.get('price_filter_num_nights') + ' nights'
    }

    // Rooms
    if(p.get('min_bedrooms')) info.minBedrooms = p.get('min_bedrooms') + ' bedrooms'
    if(p.get('min_bathrooms')) info.minBathrooms = p.get('min_bathrooms') + ' bathrooms'
    if(p.get('min_beds')) info.minBeds = p.get('min_beds') + ' beds'

    // Room type
    var roomTypes = p.getAll('room_types[]')
    if(roomTypes.length) info.roomTypes = roomTypes.join(', ')

    // Amenities
    var amenityMap = {
      '1': 'Pool', '2': 'Hot tub', '4': 'Wifi', '5': 'A/C', '7': 'Washer',
      '8': 'Kitchen', '9': 'Free parking', '11': 'Dryer', '12': 'Hangers',
      '15': 'Heating', '25': 'TV', '27': 'Fireplace', '30': 'Dishwasher',
      '33': 'Washer', '34': 'Dryer', '35': 'Smoke alarm', '36': 'Carbon monoxide alarm',
      '40': 'Gym', '41': 'Breakfast', '44': 'Indoor fireplace', '45': 'Iron',
      '46': 'Hair dryer', '47': 'Laptop-friendly workspace', '51': 'Self check-in',
      '57': 'Hot water', '58': 'Bed linens', '64': 'High chair', '78': 'EV charger',
      '100': 'BBQ grill', '137': 'Long-term stays'
    }
    var amenities = p.getAll('amenities[]')
    if(amenities.length) {
      info.amenities = amenities.map(function(id) { return amenityMap[id] || 'Amenity #' + id }).join(', ')
    }

    return info
  } catch(e) { return null }
}

// --- Quinto Andar search-area picker ---
// Reuses showDrawShapeModal (circle / polygon / rectangle). Whatever shape the
// user draws, we compute its bbox for the QA API (which only accepts a rect).
// Supports both the new-search and edit-search modals via separate state keyed
// by modal name ('new' or 'edit').
var _quintoPickers = {}

function _qpCfg(key) {
  return key === 'edit'
    ? { mapId: 'editSearchBboxMap', statusId: 'editSearchBboxStatus', clearBtnId: 'editSearchBboxClearBtn' }
    : { mapId: 'newSearchBboxMap',  statusId: 'newSearchBboxStatus',  clearBtnId: 'newSearchBboxClearBtn'  }
}

function initQuintoBboxPicker(key, initialBbox) {
  key = key || 'new'
  var cfg = _qpCfg(key)
  var modalSel = key === 'edit' ? '#editSearchModal' : '#newSearchModal'
  // The map needs the container to have layout — Bootstrap's fade animation
  // means we can't init in the click handler. Wait for shown.bs.modal, falling
  // back to setTimeout if the event already fired (modal reopened with no
  // re-render).
  var $modal = $(modalSel)
  var alreadyVisible = $modal.is(':visible') && parseFloat($modal.css('opacity')) > 0.5
  var run = function() { _doInitQuintoBboxPicker(key, initialBbox) }
  if(alreadyVisible) {
    setTimeout(run, 50)
  } else {
    $modal.one('shown.bs.modal', function() { setTimeout(run, 50) })
    // Safety net in case the event doesn't fire
    setTimeout(function() { if(!_quintoPickers[key] || !_quintoPickers[key].map) run() }, 800)
  }
}

function _doInitQuintoBboxPicker(key, initialBbox) {
  var cfg = _qpCfg(key)
  var el = document.getElementById(cfg.mapId)
  if(!el || !window.google || !google.maps) return
  // Always rebuild the map on each modal open. Reusing a cached map across
  // Bootstrap hide/show cycles leaves the canvas blank because Google Maps
  // caches layout state from when the container was display:none. resize
  // triggers alone don't reliably recover. Clearing + recreating is cheap.
  var prev = _quintoPickers[key]
  if(prev) {
    if(prev.shape) try { prev.shape.setMap(null) } catch(e) {}
    if(prev.map) try { google.maps.event.clearInstanceListeners(prev.map) } catch(e) {}
  }
  cancelCustomDraw()
  // Wipe the container so the old map's DOM doesn't linger
  el.innerHTML = ''
  var p = _quintoPickers[key] = { map: null, shape: null, key: key }
  p.map = new google.maps.Map(el, {
    center: { lat: -23.5505, lng: -46.6333 },
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  })
  // Drawing is started on demand by _quintoStartDrawing via startCustomDraw
  // (the old google.maps.drawing DrawingManager was removed by Google in Maps
  // JS v3.65). The picker object just holds the map and the current shape.
  // Pre-populate from initial bbox (e.g. when editing an existing search).
  // Run on next paint so fitBounds has the final container size.
  if(initialBbox) {
    if(p.shape) p.shape.setMap(null)
    p.shape = new google.maps.Rectangle({
      bounds: { north: initialBbox.north, south: initialBbox.south, east: initialBbox.east, west: initialBbox.west },
      map: p.map, editable: true, draggable: true,
      fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 2
    })
    _bindQuintoShapeListeners(p)
    var b = new google.maps.LatLngBounds(
      { lat: initialBbox.south, lng: initialBbox.west },
      { lat: initialBbox.north, lng: initialBbox.east }
    )
    // Map needs a resize + fitBounds after layout settles
    google.maps.event.trigger(p.map, 'resize')
    p.map.fitBounds(b)
    setTimeout(function() {
      google.maps.event.trigger(p.map, 'resize')
      p.map.fitBounds(b)
    }, 200)
  } else if(p.shape) {
    p.shape.setMap(null); p.shape = null
  }
  _updateQuintoBboxStatus(p)
}

function _bindQuintoShapeListeners(p) {
  if(!p.shape) return
  var update = function() { _updateQuintoBboxStatus(p) }
  if(p.shape.getBounds) {
    google.maps.event.addListener(p.shape, 'bounds_changed', update)
    google.maps.event.addListener(p.shape, 'radius_changed', update)
    google.maps.event.addListener(p.shape, 'center_changed', update)
  } else if(p.shape.getPath) {
    var path = p.shape.getPath()
    google.maps.event.addListener(path, 'set_at', update)
    google.maps.event.addListener(path, 'insert_at', update)
    google.maps.event.addListener(path, 'remove_at', update)
  }
}

function _quintoStartDrawing(key) {
  var p = _quintoPickers[key]
  // Self-heal: if the map never initialized (timing/visibility edge cases when
  // the picker is shown without a re-render), build it now — the modal is
  // definitely visible at click time, so the container has layout.
  if(!p || !p.map) {
    _doInitQuintoBboxPicker(key)
    p = _quintoPickers[key]
  }
  if(!p || !p.map) { showAlertModal('Map not ready', 'Wait a moment for the map to load.'); return }
  // The canvas may have been built while the container was hidden/animating,
  // leaving it zero-sized so clicks don't register — nudge it back to size.
  google.maps.event.trigger(p.map, 'resize')
  // Only rectangle is supported: the bbox the URL/API takes is a rectangle, so we
  // skip the shape chooser and draw a rectangle directly (click two corners).
  if(p.shape) { p.shape.setMap(null); p.shape = null }
  $('#' + _qpCfg(key).statusId).text('Click two opposite corners on the map to set the area.')
  startCustomDraw(p.map, DRAW_MODE.RECTANGLE, { fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 2 }, function(overlay) {
    p.shape = overlay
    _bindQuintoShapeListeners(p)
    _updateQuintoBboxStatus(p)
  })
}

function _quintoUseCurrentView(key) {
  var p = _quintoPickers[key]
  if(!p || !p.map) {
    _doInitQuintoBboxPicker(key)
    p = _quintoPickers[key]
  }
  if(!p || !p.map) return
  google.maps.event.trigger(p.map, 'resize')
  var b = p.map.getBounds()
  if(!b) return
  if(p.shape) p.shape.setMap(null)
  p.shape = new google.maps.Rectangle({
    bounds: b, map: p.map, editable: true, draggable: true,
    fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 2
  })
  _bindQuintoShapeListeners(p)
  _updateQuintoBboxStatus(p)
}

function _quintoClearBbox(key) {
  var p = _quintoPickers[key]
  if(!p) return
  if(p.shape) { p.shape.setMap(null); p.shape = null }
  _updateQuintoBboxStatus(p)
}

function _updateQuintoBboxStatus(p) {
  var cfg = _qpCfg(p.key)
  var bbox = getQuintoBbox(p.key)
  if(bbox) {
    var shapeName = p.shape && p.shape.getRadius ? 'circle'
      : p.shape && p.shape.getPath && !p.shape.getBounds ? 'polygon'
      : 'rectangle'
    $('#' + cfg.statusId).removeClass('text-muted').addClass('text-success')
      .text(shapeName + ' bbox ' + bbox.south.toFixed(3) + ',' + bbox.west.toFixed(3) + ' → ' + bbox.north.toFixed(3) + ',' + bbox.east.toFixed(3))
    $('#' + cfg.clearBtnId).show()
  } else {
    $('#' + cfg.statusId).removeClass('text-success').addClass('text-muted')
      .text('(no area set — search will use the whole region implied by the URL slug)')
    $('#' + cfg.clearBtnId).hide()
  }
}

// Compute bbox from any drawn shape: rectangle = native bounds; circle = bounds
// of the inscribed lat/lng; polygon = min/max of vertex coords.
function getQuintoBbox(key) {
  var p = _quintoPickers[key || 'new']
  if(!p || !p.shape) return null
  if(p.shape.getBounds) {
    var b = p.shape.getBounds()
    if(!b) return null
    var ne = b.getNorthEast(), sw = b.getSouthWest()
    return { north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() }
  }
  if(p.shape.getPath) {
    var north = -Infinity, south = Infinity, east = -Infinity, west = Infinity
    p.shape.getPath().forEach(function(pt) {
      var lat = pt.lat(), lng = pt.lng()
      if(lat > north) north = lat
      if(lat < south) south = lat
      if(lng > east) east = lng
      if(lng < west) west = lng
    })
    if(!isFinite(north)) return null
    return { north: north, south: south, east: east, west: west }
  }
  return null
}

// Extract bbox from a URL's hash. Returns null if not present.
function extractBboxFromUrl(url) {
  try {
    var u = new URL(url)
    var m = (u.hash || '').match(/bbox=(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if(!m) return null
    return { south: Number(m[1]), west: Number(m[2]), north: Number(m[3]), east: Number(m[4]) }
  } catch(e) { return null }
}

function applyBboxToUrl(url, bbox) {
  try {
    var u = new URL(url)
    // Strip any existing #bbox=... and append fresh
    var hash = (u.hash || '').replace(/(^|[#&])bbox=[^&]*/g, '').replace(/^#&?/, '#').replace(/^#$/, '')
    var bboxStr = 'bbox=' + bbox.south.toFixed(6) + ',' + bbox.west.toFixed(6) + ',' + bbox.north.toFixed(6) + ',' + bbox.east.toFixed(6)
    u.hash = hash ? hash + '&' + bboxStr : '#' + bboxStr
    return u.toString()
  } catch(e) { return url }
}

// Facebook Marketplace category URLs (e.g. /marketplace/category/propertyrentals)
// carry no location, so FB falls back to the account's default city. FB does honor
// latitude/longitude/radius query params, so we inject them from the drawn shape.
// Allowed radius buckets (km) match Facebook's own distance picker.
var _FB_RADIUS_BUCKETS_KM = [1, 2, 5, 10, 20, 40, 60, 80, 100, 250, 500]

function _haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Radius covering the bbox = center-to-corner distance, snapped up to a FB bucket.
function _fbRadiusKmFromBbox(bbox) {
  var latC = (bbox.north + bbox.south) / 2
  var lngC = (bbox.east + bbox.west) / 2
  var halfDiag = _haversineKm(latC, lngC, bbox.north, bbox.east)
  for(var i = 0; i < _FB_RADIUS_BUCKETS_KM.length; i++)
    if(_FB_RADIUS_BUCKETS_KM[i] >= halfDiag) return _FB_RADIUS_BUCKETS_KM[i]
  return _FB_RADIUS_BUCKETS_KM[_FB_RADIUS_BUCKETS_KM.length - 1]
}

function applyFbLocationToUrl(url, bbox) {
  try {
    var u = new URL(url)
    var latC = (bbox.north + bbox.south) / 2
    var lngC = (bbox.east + bbox.west) / 2
    u.searchParams.set('latitude', latC.toFixed(6))
    u.searchParams.set('longitude', lngC.toFixed(6))
    u.searchParams.set('radius', String(_fbRadiusKmFromBbox(bbox)))
    return u.toString()
  } catch(e) { return url }
}

// Rebuild an approximate bbox from a FB URL's latitude/longitude/radius so the
// edit modal can pre-populate the shape. Returns null if no coords present.
function extractFbBboxFromUrl(url) {
  try {
    var u = new URL(url)
    var lat = parseFloat(u.searchParams.get('latitude'))
    var lng = parseFloat(u.searchParams.get('longitude'))
    var radius = parseFloat(u.searchParams.get('radius'))
    if(!isFinite(lat) || !isFinite(lng)) return null
    if(!isFinite(radius) || radius <= 0) radius = 10
    var dLat = radius / 111.0
    var dLng = radius / ((111.0 * Math.cos(lat * Math.PI / 180)) || 1)
    return { north: lat + dLat, south: lat - dLat, east: lng + dLng, west: lng - dLng }
  } catch(e) { return null }
}

function parseQuintoAndarUrl(url) {
  try {
    var u = new URL(url)
    if(!/quintoandar/.test(u.hostname)) return null
    var info = {}

    // Location from path: /comprar/imovel/sao-paulo-sp-brasil[/segment][/segment]...
    var pathMatch = u.pathname.match(/\/(comprar|alugar)\/imovel\/([^/?#]+)((?:\/[^/?#]+)*)/)
    if(!pathMatch) return null
    info.businessContext = pathMatch[1] === 'alugar' ? 'For rent' : 'For sale'
    info.location = decodeURIComponent(pathMatch[2])
      .split('-').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1) }).join(' ')

    // QA encodes filters as path segments after the slug. Patterns observed:
    //   2-quartos                       → bedrooms = 2
    //   2-3-quartos                     → bedrooms = 2,3
    //   0-1-2-3-vagas                   → parking = 0,1,2,3
    //   de-55-a-1000-m2                 → area 55-1000 m²
    //   de-150000-a-560000-venda        → price 150000-560000 (venda=sale)
    //   de-1500-a-5000-aluguel          → rent price
    //   ate-500000-venda                → up to 500000
    //   apartamento|casa|studio|kitnet|cobertura → houseTypes
    //   anything else                   → free-form tag (rua-silenciosa, varanda, ...)
    var typeWords = ['apartamento','apartamentos','casa','casas','studio','studios','kitnet','kitnets','cobertura','coberturas','sobrado','sobrados']
    var houseTypes = [], tags = []
    var segs = (pathMatch[3] || '').split('/').filter(Boolean)
    segs.forEach(function(seg) {
      var s = decodeURIComponent(seg)
      var m
      if((m = s.match(/^((?:\d+-)*\d+)-quartos$/))) info.bedrooms = m[1].replace(/-/g, ',') + ' quartos'
      else if((m = s.match(/^((?:\d+-)*\d+)-banheiros$/))) info.bathrooms = m[1].replace(/-/g, ',') + ' banheiros'
      else if((m = s.match(/^((?:\d+-)*\d+)-vagas$/))) info.parking = m[1].replace(/-/g, ',') + ' vagas'
      else if((m = s.match(/^de-(\d+)-a-(\d+)-m2$/))) info.area = m[1] + '–' + m[2] + ' m²'
      else if((m = s.match(/^ate-(\d+)-m2$/))) info.area = 'até ' + m[1] + ' m²'
      else if((m = s.match(/^a-partir-de-(\d+)-m2$/))) info.area = m[1] + '+ m²'
      else if((m = s.match(/^de-(\d+)-a-(\d+)-(venda|aluguel)$/))) {
        info.price = 'R$' + Number(m[1]).toLocaleString('pt-BR') + ' – R$' + Number(m[2]).toLocaleString('pt-BR')
        info.businessContext = m[3] === 'aluguel' ? 'For rent' : 'For sale'
      }
      else if((m = s.match(/^ate-(\d+)-(venda|aluguel)$/))) {
        info.price = 'Up to R$' + Number(m[1]).toLocaleString('pt-BR')
        info.businessContext = m[2] === 'aluguel' ? 'For rent' : 'For sale'
      }
      else if((m = s.match(/^a-partir-de-(\d+)-(venda|aluguel)$/))) {
        info.price = 'R$' + Number(m[1]).toLocaleString('pt-BR') + '+'
        info.businessContext = m[2] === 'aluguel' ? 'For rent' : 'For sale'
      }
      else if(typeWords.indexOf(s) !== -1) houseTypes.push(s)
      else tags.push(s.replace(/-/g, ' '))
    })
    if(houseTypes.length) info.houseTypes = houseTypes.join(', ')
    if(tags.length) info.tags = tags.join(', ')

    // Bbox override from hash (#bbox=south,west,north,east)
    var bm = (u.hash || '').match(/bbox=(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if(bm) info.bbox = 'bbox ' + Number(bm[1]).toFixed(3) + ',' + Number(bm[2]).toFixed(3)
      + ' → ' + Number(bm[3]).toFixed(3) + ',' + Number(bm[4]).toFixed(3)

    return info
  } catch(e) { return null }
}

function formatQuintoAndarDetails(url) {
  var info = parseQuintoAndarUrl(url)
  if(!info) return ''
  var parts = []
  if(info.location) parts.push('<b>' + info.location + '</b>')
  if(info.businessContext) parts.push(info.businessContext)
  if(info.price) parts.push('<i class="fa fa-dollar"></i> ' + info.price)
  if(info.bedrooms) parts.push('<i class="fa fa-bed"></i> ' + info.bedrooms)
  if(info.bathrooms) parts.push(info.bathrooms)
  if(info.parking) parts.push('<i class="fa fa-car"></i> ' + info.parking)
  if(info.area) parts.push(info.area)
  if(info.houseTypes) parts.push('<i class="fa fa-home"></i> ' + info.houseTypes)
  if(info.tags) parts.push('<i class="fa fa-tag"></i> ' + info.tags)
  if(info.bbox) parts.push('<i class="fa fa-map"></i> ' + info.bbox)
  return parts.join(' &middot; ')
}

function formatAirbnbDetails(url) {
  var info = parseAirbnbUrl(url)
  if(!info) return ''
  var parts = []
  if(info.location) parts.push('<b>' + info.location + '</b>')
  if(info.checkin && info.checkout) parts.push('<i class="fa fa-calendar"></i> ' + info.checkin + ' &rarr; ' + info.checkout)
  else if(info.monthlyStart) parts.push('<i class="fa fa-calendar"></i> ' + info.monthlyStart + ' (' + (info.monthlyLength || '') + ')')
  if(info.guests) parts.push('<i class="fa fa-users"></i> ' + info.guests)
  if(info.price) parts.push('<i class="fa fa-dollar"></i> ' + info.price)
  if(info.roomTypes) parts.push('<i class="fa fa-home"></i> ' + info.roomTypes)
  if(info.minBedrooms) parts.push('<i class="fa fa-bed"></i> ' + info.minBedrooms)
  if(info.minBathrooms) parts.push(info.minBathrooms)
  if(info.minBeds) parts.push(info.minBeds)
  if(info.amenities) parts.push('<i class="fa fa-check-circle"></i> ' + info.amenities)
  return parts.join(' &middot; ')
}

var _searchesJobs = []
var _searchGroups = []
var _collapsedSearchGroups = {}
var _searchesNameFilter = ''
var _searchesSort = null
var _searchesFilterTimer = null
var _searchesSelectedIds = {}
var UNGROUPED_ID = '__ungrouped__'

function _platformFromUrl(url) {
  if(!url) return 'kijiji'
  if(url.includes('quintoandar.com.br')) return 'quintoandar'
  if(url.includes('airbnb')) return 'airbnb'
  if(url.includes('facebook.com')) return 'facebook'
  return 'kijiji'
}

function _loadCollapsedSearchGroups() {
  try { _collapsedSearchGroups = JSON.parse(localStorage.getItem('collapsedSearchGroups') || '{}') || {} }
  catch(e) { _collapsedSearchGroups = {} }
}
function _saveCollapsedSearchGroups() {
  localStorage.setItem('collapsedSearchGroups', JSON.stringify(_collapsedSearchGroups))
}

function _genGroupId() {
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID()
  return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

function _groupById(id) {
  return _searchGroups.find(function(g){ return String(g.id) === String(id) })
}

function _jobGroupId(job) {
  return (job && job.groupId && _groupById(job.groupId)) ? String(job.groupId) : UNGROUPED_ID
}

function _escapeHtml(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function _persistSearchGroups(onDone) {
  APIupdateSearchGroups({groups: JSON.stringify(_searchGroups)}, function(meta){
    if(meta && Array.isArray(meta.searchGroups)) _searchGroups = meta.searchGroups
    if(onDone) onDone()
    renderSearchesTable()
  })
}

function createNewSearchGroup() {
  var newId = _genGroupId()
  _searchGroups.push({id: newId, name: 'New Group'})
  _persistSearchGroups(function(){
    // Open inline rename on the newly added group once the table re-renders
    _pendingRenameGroupId = newId
  })
}

var _pendingRenameGroupId = null

function renameSearchGroup(groupId) {
  var g = _groupById(groupId)
  if(!g) return
  var $title = $('.searchGroupTitle[data-groupid="' + groupId + '"]')
  if(!$title.length || $title.hasClass('editing')) return
  var currentName = g.name
  $title.addClass('editing').data('origname', currentName)
  $title.html('<input type="text" class="searchGroupTitleInput form-control input-sm" data-groupid="' + groupId + '" value="' + _escapeHtml(currentName) + '" maxlength="80" style="display:inline-block;width:auto;min-width:160px;height:26px;padding:2px 6px;font-size:14px;font-weight:600">')
  var $input = $title.find('input')
  $input.trigger('focus').get(0).select()
}

function _commitRenameSearchGroup(groupId, rawName) {
  var g = _groupById(groupId)
  if(!g) return
  var name = (rawName || '').trim().slice(0, 80)
  if(!name || name === g.name) { renderSearchesTable(); return }
  g.name = name
  _persistSearchGroups()
}

function _cancelRenameSearchGroup() {
  renderSearchesTable()
}

function deleteSearchGroup(groupId) {
  var g = _groupById(groupId)
  if(!g) return
  showConfirmModal(
    'Delete Group',
    'Delete group "' + _escapeHtml(g.name) + '"? Searches inside will move to Ungrouped.',
    function() {
      _searchGroups = _searchGroups.filter(function(x){ return String(x.id) !== String(groupId) })
      _persistSearchGroups(function(){
        // Backend clears orphaned groupId on jobs, but refresh local copy
        _searchesJobs.forEach(function(j){ if(String(j.groupId) === String(groupId)) delete j.groupId })
      })
    },
    { confirmLabel: 'Delete', confirmClass: 'btn-danger' }
  )
}

function toggleSearchGroupCollapse(groupId) {
  _collapsedSearchGroups[groupId] = !_collapsedSearchGroups[groupId]
  _saveCollapsedSearchGroups()
  renderSearchesTable()
}

function toggleSearchGroupSelect(groupId, checked) {
  $('.searchSelectCb[data-groupid="' + groupId + '"]').each(function(){
    var id = $(this).data('jobid')
    this.checked = checked
    if(checked) _searchesSelectedIds[id] = true
    else delete _searchesSelectedIds[id]
  })
  _syncGroupHeaderCheckboxes()
  _syncSelectAllCheckbox()
  updateViewSelectedBtn()
  updateRefreshSelectedBtn()
  updateMoveToGroupBtn()
  updateExportSelectedBtn()
}

function moveSelectedToGroup(groupId) {
  var selected = Object.keys(_searchesSelectedIds)
  if(!selected.length) return
  var targetId = (groupId === UNGROUPED_ID || !groupId) ? '' : String(groupId)
  var remaining = selected.length
  selected.forEach(function(jobId){
    var payload = {id: jobId, groupId: targetId}
    var existing = _searchesJobs.find(function(j){ return String(j.id) === String(jobId) })
    if(existing) payload.name = existing.name
    APIupdateJob(payload, function(){
      if(existing) {
        if(targetId) existing.groupId = targetId
        else delete existing.groupId
      }
      if(--remaining === 0) renderSearchesTable()
    })
  })
}

function updateExportSelectedBtn() {
  var count = Object.keys(_searchesSelectedIds).length
  $('#exportSearchesBtn').prop('disabled', count === 0)
  $('#exportSearchesBtn').html('<i class="fa fa-download"></i> Export' + (count > 0 ? ' (' + count + ')' : ''))
}

function exportSelectedSearches() {
  var selected = Object.keys(_searchesSelectedIds)
  if(!selected.length) return
  var modalBody =
    '<p>Export ' + selected.length + ' search' + (selected.length > 1 ? 'es' : '') + ' and their groups to a JSON file.</p>' +
    '<p style="margin-top:8px;margin-bottom:4px"><b>Include:</b></p>' +
    '<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="exportIncludeAdsCb" style="margin-right:6px">Scraped listings</label>' +
    '<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="exportIncludeFavoritesCb" style="margin-right:6px">Favorites</label>' +
    '<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="exportIncludeDislikesCb" style="margin-right:6px">Dislikes</label>' +
    '<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="exportIncludeHideAmenitiesCb" style="margin-right:6px">Hidden amenities (profile setting)</label>' +
    '<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="exportIncludeSeenCb" style="margin-right:6px">Seen listings (for selected searches)</label>' +
    '<p class="text-muted" style="margin-top:6px;font-size:12px">Listings can be large. Images load from external URLs so they stay working on import.</p>'
  showConfirmModal(
    'Export Searches',
    modalBody,
    function() {
      var includeAds = $('#exportIncludeAdsCb').is(':checked')
      var includeFavorites = $('#exportIncludeFavoritesCb').is(':checked')
      var includeDislikes = $('#exportIncludeDislikesCb').is(':checked')
      var includeHideAmenities = $('#exportIncludeHideAmenitiesCb').is(':checked')
      var includeSeen = $('#exportIncludeSeenCb').is(':checked')
      APIexportSearches({
        jobIds: selected,
        includeAds: includeAds,
        includeFavorites: includeFavorites,
        includeDislikes: includeDislikes,
        includeHideAmenities: includeHideAmenities
      }, function(payload) {
        if(!payload) return
        if(includeSeen) {
          var seenItems = {}
          selected.forEach(function(id) {
            try {
              var raw = localStorage.getItem('visitedUrls' + id)
              if(!raw) return
              var arr = JSON.parse(raw)
              if(Array.isArray(arr) && arr.length) seenItems[id] = arr
            } catch(e) {}
          })
          if(Object.keys(seenItems).length) payload.seenItems = seenItems
        }
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        var url = URL.createObjectURL(blob)
        var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        var a = document.createElement('a')
        a.href = url
        a.download = 'searches-export-' + stamp + '.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(function(){ URL.revokeObjectURL(url) }, 1000)
      })
    },
    { confirmLabel: 'Export', confirmClass: 'btn-primary' }
  )
}

function importSearchesFromFile(file) {
  if(!file) return
  var reader = new FileReader()
  reader.onload = function(e) {
    var payload
    try { payload = JSON.parse(e.target.result) }
    catch(err) { showAlertModal('Invalid File', 'This is not a valid JSON export file.'); return }
    var jobCount = Array.isArray(payload.jobs) ? payload.jobs.length : 0
    var groupCount = Array.isArray(payload.searchGroups) ? payload.searchGroups.length : 0
    var adCount = Array.isArray(payload.ads) ? payload.ads.length : 0
    var favoriteCount = Array.isArray(payload.favorites) ? payload.favorites.length : 0
    var dislikeCount = Array.isArray(payload.dislikes) ? payload.dislikes.length : 0
    var hasHideAmenities = typeof payload.hideAmenities === 'string' || Array.isArray(payload.hideAmenities)
    var hideAmenitiesList = hasHideAmenities ? parseAmenityList(payload.hideAmenities) : []
    var seenItems = (payload.seenItems && typeof payload.seenItems === 'object') ? payload.seenItems : null
    var seenJobCount = seenItems ? Object.keys(seenItems).length : 0
    var seenTotal = 0
    if(seenItems) Object.keys(seenItems).forEach(function(k){ if(Array.isArray(seenItems[k])) seenTotal += seenItems[k].length })

    if(!jobCount && !groupCount && !adCount && !favoriteCount && !dislikeCount && !hideAmenitiesList.length && !seenJobCount) {
      showAlertModal('Nothing to Import', 'This file contains no importable data.')
      return
    }

    var rows = []
    if(jobCount || groupCount) {
      var parts = []
      if(jobCount) parts.push(jobCount + ' search' + (jobCount === 1 ? '' : 'es'))
      if(groupCount) parts.push(groupCount + ' group' + (groupCount === 1 ? '' : 's'))
      rows.push('<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="importIncludeSearchesCb" checked style="margin-right:6px">Searches & groups (' + parts.join(', ') + ')</label>')
    }
    if(adCount)
      rows.push('<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="importIncludeAdsCb" checked style="margin-right:6px">Scraped listings (' + adCount + ')</label>')
    if(favoriteCount)
      rows.push('<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="importIncludeFavoritesCb" checked style="margin-right:6px">Favorites (' + favoriteCount + ')</label>')
    if(dislikeCount)
      rows.push('<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="importIncludeDislikesCb" checked style="margin-right:6px">Dislikes (' + dislikeCount + ')</label>')
    if(hideAmenitiesList.length)
      rows.push('<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="importIncludeHideAmenitiesCb" checked style="margin-right:6px">Hidden amenities (' + hideAmenitiesList.length + ')</label>')
    if(seenJobCount)
      rows.push('<label style="display:block;font-weight:normal;cursor:pointer;margin:4px 0"><input type="checkbox" id="importIncludeSeenCb" checked style="margin-right:6px">Seen listings (' + seenTotal + ' across ' + seenJobCount + ' search' + (seenJobCount === 1 ? '' : 'es') + ')</label>')

    var modalBody =
      '<p><b>Select what to import:</b></p>' + rows.join('') +
      '<hr style="margin:10px 0">' +
      '<label style="font-weight:normal;cursor:pointer"><input type="checkbox" id="importOverrideCb" style="margin-right:5px"> Override existing entries</label>' +
      '<p class="text-muted" style="margin-top:6px;font-size:12px">Unchecked: new items are added, duplicates are skipped. Favorites/dislikes/seen items are merged with yours.</p>'

    showConfirmModal(
      'Import Searches',
      modalBody,
      function() {
        var override = $('#importOverrideCb').is(':checked')
        var doSearches = (jobCount || groupCount) && $('#importIncludeSearchesCb').is(':checked')
        var doAds = adCount && $('#importIncludeAdsCb').is(':checked')
        var doFavorites = favoriteCount && $('#importIncludeFavoritesCb').is(':checked')
        var doDislikes = dislikeCount && $('#importIncludeDislikesCb').is(':checked')
        var doHideAmenities = hideAmenitiesList.length && $('#importIncludeHideAmenitiesCb').is(':checked')
        var doSeen = seenJobCount && $('#importIncludeSeenCb').is(':checked')

        var filteredPayload = {
          jobs: doSearches ? payload.jobs : [],
          searchGroups: doSearches ? payload.searchGroups : [],
          ads: doAds ? payload.ads : []
        }
        if(doFavorites) filteredPayload.favorites = payload.favorites
        if(doDislikes) filteredPayload.dislikes = payload.dislikes
        if(doHideAmenities) filteredPayload.hideAmenities = payload.hideAmenities

        APIimportSearches({ payload: filteredPayload, override: override }, function(stats) {
          if(!stats) return

          var seenApplied = 0
          if(doSeen) {
            Object.keys(seenItems).forEach(function(id) {
              var arr = seenItems[id]
              if(!Array.isArray(arr) || !arr.length) return
              try {
                var existing = []
                if(!override) {
                  var raw = localStorage.getItem('visitedUrls' + id)
                  if(raw) { try { existing = JSON.parse(raw) || [] } catch(e) {} }
                }
                var merged = existing.concat(arr)
                var unique = merged.filter(function(v, i){ return merged.indexOf(v) === i })
                localStorage.setItem('visitedUrls' + id, JSON.stringify(unique))
                seenApplied += arr.length
              } catch(e) {}
            })
          }

          var msg = ''
          if(doSearches)
            msg += '<p><b>Groups:</b> ' + stats.groups.added + ' added, ' + stats.groups.updated + ' updated, ' + stats.groups.skipped + ' skipped</p>' +
                   '<p><b>Searches:</b> ' + stats.jobs.added + ' added, ' + stats.jobs.updated + ' updated, ' + stats.jobs.skipped + ' skipped</p>'
          if(doAds)
            msg += '<p><b>Listings:</b> ' + stats.ads.added + ' added, ' + stats.ads.updated + ' updated, ' + stats.ads.skipped + ' skipped</p>'
          if(doFavorites && stats.favorites)
            msg += '<p><b>Favorites:</b> ' + stats.favorites.added + ' added, ' + stats.favorites.skipped + ' skipped</p>'
          if(doDislikes && stats.dislikes)
            msg += '<p><b>Dislikes:</b> ' + stats.dislikes.added + ' added, ' + stats.dislikes.skipped + ' skipped</p>'
          if(doHideAmenities && stats.hideAmenities)
            msg += '<p><b>Hidden amenities:</b> ' + stats.hideAmenities.added + ' added, ' + stats.hideAmenities.skipped + ' skipped</p>'
          if(doSeen)
            msg += '<p><b>Seen listings:</b> ' + seenApplied + ' merged into local history</p>'
          if(!msg) msg = '<p>Nothing was imported.</p>'

          renderpage('searches')
          setTimeout(function(){ showAlertModal('Import Complete', msg) }, 400)
        })
      },
      { confirmLabel: 'Import', confirmClass: 'btn-success' }
    )
  }
  reader.readAsText(file)
}

function _syncGroupHeaderCheckboxes() {
  $('.searchGroupHeaderCb').each(function(){
    var gid = $(this).data('groupid')
    var cbs = $('.searchSelectCb[data-groupid="' + gid + '"]')
    if(!cbs.length) { this.checked = false; this.indeterminate = false; return }
    var checked = cbs.filter(':checked').length
    this.checked = checked === cbs.length
    this.indeterminate = checked > 0 && checked < cbs.length
  })
}

function _syncSelectAllCheckbox() {
  var cbs = $('.searchSelectCb')
  var el = document.getElementById('selectAllSearches')
  if(!el) return
  if(!cbs.length) { el.checked = false; el.indeterminate = false; return }
  var checked = cbs.filter(':checked').length
  el.checked = checked === cbs.length
  el.indeterminate = checked > 0 && checked < cbs.length
}

function updateMoveToGroupBtn() {
  var count = Object.keys(_searchesSelectedIds).length
  $('#moveToGroupBtn').prop('disabled', count === 0)
  var menu = _searchGroups.map(function(g){
    return '<li><a href="#" onclick="moveSelectedToGroup(\'' + g.id + '\');return false">' + _escapeHtml(g.name) + '</a></li>'
  }).join('')
  menu += (menu ? '<li class="divider"></li>' : '') + '<li><a href="#" onclick="moveSelectedToGroup(\'\');return false"><i class="fa fa-ban"></i> Ungrouped</a></li>'
  $('#moveToGroupMenu').html(menu)
}

function renderSearchesTable() {
  var jobs = _searchesJobs.slice()
  var q = _searchesNameFilter.trim().toLowerCase()
  if(q) jobs = jobs.filter(function(j){ return (j.name || '').toLowerCase().indexOf(q) !== -1 })
  if(_searchesSort) {
    var f = _searchesSort.field, d = _searchesSort.dir
    jobs.sort(function(a, b) {
      var va, vb
      if(f === 'lastUpdated') {
        va = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
        vb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0
        return d === 'asc' ? va - vb : vb - va
      }
      if(f === 'status') {
        va = a.statusCode == null ? -1 : a.statusCode
        vb = b.statusCode == null ? -1 : b.statusCode
        return d === 'asc' ? va - vb : vb - va
      }
      if(f === 'platform') {
        va = (a.platform || _platformFromUrl(a.url))
        vb = (b.platform || _platformFromUrl(b.url))
      } else {
        va = (a[f] || '').toString().toLowerCase()
        vb = (b[f] || '').toString().toLowerCase()
      }
      return d === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }
  _renderSearchesRows(jobs)
  _updateSearchesSortIndicators()
  _syncGroupHeaderCheckboxes()
  _syncSelectAllCheckbox()
  updateViewSelectedBtn()
  updateRefreshSelectedBtn()
  updateMoveToGroupBtn()
  updateExportSelectedBtn()
  if(_pendingRenameGroupId) {
    var pending = _pendingRenameGroupId
    _pendingRenameGroupId = null
    renameSearchGroup(pending)
  }
}

function _renderSearchesRows(jobs) {
  var $tbody = $('#searchesTBody')
  $tbody.html('')
  if(!jobs.length) {
    $tbody.append('<tr><td colspan="8" class="text-muted" style="text-align:center;padding:16px">No searches match.</td></tr>')
    return
  }

  // Partition jobs by group, preserving _searchGroups order then Ungrouped last.
  var jobsByGroup = {}
  jobs.forEach(function(j){
    var gid = _jobGroupId(j)
    ;(jobsByGroup[gid] = jobsByGroup[gid] || []).push(j)
  })
  var orderedGroups = _searchGroups.map(function(g){ return {id: String(g.id), name: g.name, removable: true} })
  if(jobsByGroup[UNGROUPED_ID] && jobsByGroup[UNGROUPED_ID].length)
    orderedGroups.push({id: UNGROUPED_ID, name: 'Ungrouped', removable: false})
  var onlyUngrouped = _searchGroups.length === 0
  var renderGroupHeaders = !onlyUngrouped

  for(var gi = 0; gi < orderedGroups.length; gi++) {
    var grp = orderedGroups[gi]
    var groupJobs = jobsByGroup[grp.id] || []
    if(renderGroupHeaders) {
      var collapsed = !!_collapsedSearchGroups[grp.id]
      var chevron = collapsed ? 'fa-chevron-right' : 'fa-chevron-down'
      var removeBtn = grp.removable
        ? '<button type="button" class="btn btn-xs btn-link text-danger" style="margin-left:8px" onclick="deleteSearchGroup(\'' + grp.id + '\')" title="Delete group"><i class="fa fa-trash"></i></button>'
        : ''
      var renameBtn = grp.removable
        ? '<button type="button" class="btn btn-xs btn-link" onclick="renameSearchGroup(\'' + grp.id + '\')" title="Rename group"><i class="fa fa-pencil"></i></button>'
        : ''
      var titleMarkup = grp.removable
        ? '<span class="searchGroupTitle" data-groupid="' + grp.id + '" style="cursor:text" title="Click to rename">' + _escapeHtml(grp.name) + '</span>'
        : '<span class="searchGroupTitle" data-groupid="' + grp.id + '">' + _escapeHtml(grp.name) + '</span>'
      $tbody.append(
        '<tr class="searchGroupHeader" data-groupid="' + grp.id + '" style="background:#f5f5f5">' +
          '<td><input type="checkbox" class="searchGroupHeaderCb" data-groupid="' + grp.id + '"' + (groupJobs.length ? '' : ' disabled') + '></td>' +
          '<td colspan="7" style="font-weight:600">' +
            '<a href="#" onclick="toggleSearchGroupCollapse(\'' + grp.id + '\');return false" style="color:inherit;text-decoration:none;margin-right:6px"><i class="fa ' + chevron + '"></i></a>' +
            titleMarkup +
            ' <span class="text-muted" style="font-weight:normal">(' + groupJobs.length + ')</span>' +
            renameBtn + removeBtn +
          '</td>' +
        '</tr>'
      )
      if(collapsed) continue
    }
    _appendJobRows($tbody, groupJobs, grp.id)
  }
  $('.BStooltip').tooltip({ trigger: 'hover', container: 'body' })
}

function _appendJobRows($tbody, jobs, groupId) {
  for(let i = 0; i < jobs.length; i++) {
    let job = jobs[i]
    let statusDom
    if(job.queuedAt && job.statusCode !== 2) {
      statusDom = '<td><span class="label label-primary">Queued</span></td>'
    } else {
      switch(job.statusCode) {
        case 0: statusDom = '<td><span class="label label-default">Stopped</span></td>'; break
        case 1: statusDom = '<td><span class="label label-success">Completed</span></td>'; break
        case 2: statusDom = '<td><span class="label label-warning">Pending</span></td>'; break
        default: statusDom = '<td></td>'
      }
    }
    let platform = job.platform || _platformFromUrl(job.url)
    let platformLabel = platform === 'airbnb'
      ? '<td><span class="label label-danger">Airbnb</span></td>'
      : platform === 'facebook'
      ? '<td><span class="label label-primary">Facebook</span></td>'
      : platform === 'quintoandar'
      ? '<td><span class="label label-warning">Quinto Andar</span></td>'
      : '<td><span class="label label-info">Kijiji</span></td>'
    let linkLabel = platform === 'airbnb' ? 'Airbnb Link'
      : platform === 'facebook' ? 'FB Marketplace Link'
      : platform === 'quintoandar' ? 'Quinto Andar Link'
      : 'Kijiji Link'
    let descriptionHtml = job.description
    if(platform === 'airbnb') {
      let airbnbDetails = formatAirbnbDetails(job.url)
      if(airbnbDetails) descriptionHtml = airbnbDetails + (job.description ? '<br><small class="text-muted">' + job.description + '</small>' : '')
    } else if(platform === 'quintoandar') {
      let qaDetails = formatQuintoAndarDetails(job.url)
      if(qaDetails) descriptionHtml = qaDetails + (job.description ? '<br><small class="text-muted">' + job.description + '</small>' : '')
    }
    let isQueued = !!(job.queuedAt && job.statusCode !== 2)
    let stopBtnHtml = ''
    if(job.statusCode === 2)
      stopBtnHtml = `<button type="button" class="btn btn-warning stopSearchBtn BStooltip" rel="tooltip" data-placement="top" data-mode="stop" title="stop"><i class="fa fa-stop"></i></button>`
    else if(isQueued)
      stopBtnHtml = `<button type="button" class="btn btn-default stopSearchBtn BStooltip" rel="tooltip" data-placement="top" data-mode="dequeue" title="remove from queue"><i class="fa fa-times"></i></button>`
    let checkedAttr = _searchesSelectedIds[job.id] ? ' checked' : ''
    $tbody.append(`
      <tr>
        <td><input type="checkbox" class="searchSelectCb" data-jobid="${job.id}" data-jobname="${job.name}" data-groupid="${groupId}"${checkedAttr}></td>
        <td><button type="button" class="btn btn-primary editSearchBtn BStooltip" rel="tooltip" data-placement="top" title="edit" data-toggle="modal" data-target="#editSearchModal"><i class="fa fa-edit"></i></button>
        ${stopBtnHtml}
        <button type="button" class="btn btn-info refetchPhotosBtn BStooltip" rel="tooltip" data-placement="top" title="Re-scrape listings with no photos"><i class="fa fa-camera"></i></button>
        <button type="button" class="btn btn-default clearCacheBtn BStooltip" rel="tooltip" data-placement="top" title="Clear cache (re-scrape from scratch)"><i class="fa fa-eraser"></i></button>
        <button type="button" class="btn btn-danger delSearchBtn BStooltip" rel="tooltip" data-placement="top" title="delete"><i class="fa fa-trash"></i></button>
        </td>
        ${platformLabel}
        ${statusDom}
        <td><a href="/index.html#map?jobId=${job.id}&jobName=${job.name}&platform=${platform}">${job.name}</a></td>
        <td>${descriptionHtml}</td>
        <td>${job.lastUpdated ? new Date(job.lastUpdated).toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '-'}</td>
        <td><a target="_blank" href="${job.url}">${linkLabel}</a></td>
      </tr>
    `)
    $('#searchesTBody .editSearchBtn').last().data('id', job.id).data('name', $.parseHTML(job.name || ' ')[0].data).data('url', job.url).data('description', $.parseHTML(job.description || ' ')[0].data).data('platform', platform).data('gridDepth', job.gridDepth || 1).data('groupId', job.groupId || '')
    $('#searchesTBody .refetchPhotosBtn').last().data('id', job.id).data('name', job.name)
    $('#searchesTBody .clearCacheBtn').last().data('id', job.id).data('name', job.name)
    $('#searchesTBody .delSearchBtn').last().data('id', job.id)
    if(stopBtnHtml)
      $('#searchesTBody .stopSearchBtn').last().data('id', job.id).data('name', job.name)
  }
}

function _updateSearchesSortIndicators() {
  $('#searchesTable th.sortable .sort-caret').remove()
  if(!_searchesSort) return
  var icon = _searchesSort.dir === 'asc' ? 'fa-caret-up' : 'fa-caret-down'
  $('#searchesTable th.sortable[data-sort="' + _searchesSort.field + '"]').append(' <i class="fa ' + icon + ' sort-caret"></i>')
}

var AIRBNB_PARAM_FIELDS = [
  { key: 'checkin',                 label: 'Check-in',            type: 'date'   },
  { key: 'checkout',                label: 'Check-out',           type: 'date'   },
  { key: 'monthly_start_date',      label: 'Monthly Start',       type: 'date'   },
  { key: 'monthly_length',          label: 'Monthly Length',      type: 'number', min: 1 },
  { key: 'adults',                  label: 'Adults',              type: 'number', min: 0 },
  { key: 'children',                label: 'Children',            type: 'number', min: 0 },
  { key: 'infants',                 label: 'Infants',             type: 'number', min: 0 },
  { key: 'pets',                    label: 'Pets',                type: 'number', min: 0 },
  { key: 'price_min',               label: 'Min Price',           type: 'number', min: 0 },
  { key: 'price_max',               label: 'Max Price',           type: 'number', min: 0 },
  { key: 'price_filter_num_nights', label: 'Price Filter Nights', type: 'number', min: 1 },
  { key: 'min_bedrooms',            label: 'Min Bedrooms',        type: 'number', min: 0 },
  { key: 'min_bathrooms',           label: 'Min Bathrooms',       type: 'number', min: 0 },
  { key: 'min_beds',                label: 'Min Beds',            type: 'number', min: 0 }
]

function renderAirbnbUrlParamFields(url) {
  var $box = $('#editSearchUrlParams')
  var u
  try { u = new URL(url) } catch(e) { $box.empty(); return }
  var p = u.searchParams
  var html = ''
  AIRBNB_PARAM_FIELDS.forEach(function(f) {
    var val = p.get(f.key) || ''
    var attrs = 'type="' + f.type + '" data-param="' + f.key + '" class="form-control airbnb-param-input" value="' + val + '"'
    if(f.min !== undefined) attrs += ' min="' + f.min + '"'
    html += '<div class="col-xs-6 col-sm-4" style="margin-bottom:8px">'
    html += '<label style="font-weight:normal;font-size:12px;margin-bottom:2px">' + f.label + '</label>'
    html += '<input ' + attrs + '>'
    html += '</div>'
  })
  $box.html(html)
}

function syncAirbnbUrlFromFields() {
  var url = $('#searchUrlBox').val()
  var u
  try { u = new URL(url) } catch(e) { return }
  $('#editSearchUrlParams .airbnb-param-input').each(function() {
    var key = $(this).data('param')
    var val = $(this).val()
    if(val === '' || val == null) u.searchParams.delete(key)
    else u.searchParams.set(key, val)
  })
  $('#searchUrlBox').val(u.toString())
}

function searchesUnload()
{
  $('#newSearchForm').off('submit')
  $('#editSearchForm').off('submit')
  $('#editSearchUrlParams').off('input.airbnbParams change.airbnbParams')
  $('#searchUrlBox').off('input.airbnbParams change.airbnbParams')
  $(document).off('click.searchesActions')
  $(document).off('keydown.searchesActions blur.searchesActions')
  $('#searchesFilterInput').off('input.searchesFilter')
  $('#searchesTable').off('click.searchesSort')
  if(_searchesFilterTimer) { clearTimeout(_searchesFilterTimer); _searchesFilterTimer = null }
  $('#newSearchPlatform').off('change')
  $('#newSearchUrlInput').off('input')
  $('#newSearchForm textarea[name="description"]').off('keydown').removeData('manual')
  $(document).off('change', '.searchSelectCb')
  $(document).off('change', '.searchGroupHeaderCb')
  $('#selectAllSearches').off('change')
  if(window._searchesSocketHandler) {
    socket.off('all', window._searchesSocketHandler)
    window._searchesSocketHandler = null
  }
}