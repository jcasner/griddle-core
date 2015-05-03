var AppDispatcher = require('../dispatcher/app-dispatcher');
var assign = require('object-assign');
var DataHelper = require('../helpers/data-helper');
var StoreBoilerplate = require('./store-boilerplate');
var Constants = require('../constants/constants');
var ScrollStore = require('./scroll-store');
var LocalActions = require('../actions/local-action-creators');
var ColumnProperties = require('../properties/column-properties');
var _ = require('lodash');

var defaultGridState = {
  hasFilter: false,
  hasSort: false,
  //this is the original data set -- don't mutate it (and yes we should switch to immutable)
  data: [],
  //this is the filtered / sorted data (not paged!)
  visibleData: [],
  // this is the filtered, sorted, and paged data
  currentDataPage: [],

  pageProperties: { currentPage: 0, maxPage: 0, pageSize: 5, initialDisplayIndex: 0, lastDisplayIndex: 0, infiniteScroll: true, shouldAutoLoadNextPage: false },

  // An array of the current visible columns.
  currentVisibleColumns: [],

  columnProperties: new ColumnProperties(),

  sortProperties: { sortColumns: [], sortAscending: true, defaultSortAscending: true }

  /* Properties added after initialization :

     scrollProperties
  */
};

var _state = {};

//these are helpers that have access to the state
var helpers = {
  setCurrentDataPage: function(gridId){
    // If we're infinite scrolling, set the initial index to 0.
    if (_state[gridId].pageProperties.infiniteScroll) {
      var adjustedHeight = this.getAdjustedRowHeight(gridId);
      var visibleRecordCount = Math.ceil(_state[gridId].scrollProperties.tableHeight / adjustedHeight);

      // Inspired by : http://jsfiddle.net/vjeux/KbWJ2/9/
      _state[gridId].pageProperties.initialDisplayIndex = Math.max(0, Math.floor(_state[gridId].scrollProperties.yScrollPosition / adjustedHeight) - visibleRecordCount * 0.25);
      _state[gridId].pageProperties.lastDisplayIndex = Math.min(_state[gridId].pageProperties.initialDisplayIndex + visibleRecordCount * 1.25, this.getAllVisibleData(gridId).length - 1) + 1;
    } else {
      _state[gridId].pageProperties.initialDisplayIndex = _state[gridId].pageProperties.currentPage * _state[gridId].pageProperties.pageSize;
      _state[gridId].pageProperties.lastDisplayIndex = _state[gridId].pageProperties.initialDisplayIndex + _state[gridId].pageProperties.pageSize;
    }

    _state[gridId].currentDataPage = this.getRangeOfVisibleResults(gridId, _state[gridId].pageProperties.initialDisplayIndex, _state[gridId].pageProperties.lastDisplayIndex);
  },

  setVisibleColumns: function(gridId){
    var availableColumns = helpers.getAvailableColumns(gridId);

    if (availableColumns.length > 0) {
      _state[gridId].currentVisibleColumns = _.at(availableColumns, _.range(_state[gridId].columnProperties.getInitialDisplayIndex(), _state[gridId].columnProperties.getLastDisplayIndex() + 1));
    } else {
      _state[gridId].currentVisibleColumns = [];
    }
  },

  setMaxPage: function(gridId){
     _state[gridId].pageProperties.maxPage = DataHelper.getMaxPageSize(_state[gridId].data.length, _state[gridId].pageProperties.pageSize);
     this.setCurrentDataPage(gridId);
  },

  //this gets the full sorted and filtered dataset
  getAllVisibleData: function(gridId){
    return helpers.showVisibleData(gridId) ? _state[gridId].visibleData : _state[gridId].data;
  },

  getRangeOfVisibleResults: function(gridId, start, end){
    return _.at(this.getAllVisibleData(gridId), _.range(start, end));
  },

  //todo: change the name on this
  //this determines whether the data array or visible data array should be used
  showVisibleData: function(gridId){
    if(_state[gridId] && _state[gridId].hasFilter === true){
      return true;
    }
  },

  getGrid: function(gridId){
    return _state[gridId];
  },

  //tries to set the current page
  setCurrentPage: function(gridId, pageNumber){
    if(pageNumber > 0 && pageNumber <= _state[gridId].pageProperties.maxPage){
      _state[gridId].pageProperties.currentPage = pageNumber;
    }
  },

  filterData: function(gridId, filter){
    _state[gridId].pageProperties.currentPage = 0;
    _state[gridId].hasFilter = true;
    _state[gridId].visibleData = DataHelper.sort(
      _state[gridId].sortProperties.sortColumns,
      DataHelper.filterAllData(filter, _state[gridId].data),
      _state[gridId].sortProperties.sortAscending
    );

    this.setCurrentDataPage(gridId);
  },

  sort: function(){
    _state[gridId].visibleData = DataHelper.sort(
      _state[gridId].sortProperties.sortColumns,
      DataStore.getVisibleData(),
      _state[gridId].sortProperties.sortAscending
    );
  },

  shouldUpdateDrawnRows: function(oldScrollProperties, gridId){
    return oldScrollProperties === undefined ||
           Math.abs(oldScrollProperties.yScrollPosition - _state[gridId].scrollProperties.yScrollPosition) >= this.getAdjustedRowHeight(gridId);
  },

  shouldUpdateDrawnColumns: function(oldColumnProperties, gridId){
    return oldColumnProperties === undefined ||
           _state[gridId].columnProperties.getInitialDisplayIndex() != oldColumnProperties.getInitialDisplayIndex() ||
           _state[gridId].columnProperties.getLastDisplayIndex() != oldColumnProperties.getLastDisplayIndex();
  },

  updateColumnProperties: function(gridId, columnMetadata){
      // If there isn't any metadata defined, create default metadata based on the available properties.
    if (!columnMetadata && _state[gridId].data && _state[gridId].data.length > 0){
      // Load the width of the columns.
      var columnWidth = helpers.getAdjustedColumnWidth(gridId);

      var availableDataColumns = Object.keys(_state[gridId].data[0]);

      columnMetadata = {};
      for(var i = 0; i < availableDataColumns.length; i++){
        var column = availableDataColumns[i];
        columnMetadata[column] = {
          displayName: column,
          displayIndex: i,
          columnWidth: _state[gridId].scrollProperties.defaultColumnWidth
        };
      }
    }

    _state[gridId].columnProperties = new ColumnProperties(columnMetadata, _state[gridId].scrollProperties.xScrollPosition, _state[gridId].scrollProperties.tableWidth);
  },

  shouldLoadNewPage: function(gridId){
    _state[gridId].pageProperties.infiniteScroll &&
    _state[gridId].pageProperties.lastDisplayIndex !== this.getAllVisibleData(gridId).length &&
    _state[gridId].pageProperties.currentPage !== _state[gridId].pageProperties.maxPage &&
    function(){
        // Determine the diff by subtracting the amount scrolled by the total height, taking into consideratoin
        // the spacer's height.
        var scrollHeightDiff = _state[gridId].scrollProperties.yScrollMax - (_state[gridId].scrollProperties.yScrollPosition + _state[gridId].scrollProperties.tableHeight) - _state[gridId].scrollProperties.infiniteScrollLoadTreshold;

        // Make sure that we load results a little before reaching the bottom.
        var compareHeight = scrollHeightDiff * 0.6;

        // Send back whether or not we're under the threshold.
        return compareHeight <= _state[gridId].scrollProperties.infiniteScrollLoadTreshold;
    }();
  },

  getAdjustedRowHeight: function(gridId){
    return _state[gridId].scrollProperties.rowHeight; //+ this.props.paddingHeight * 2; // account for padding.
  },

  getAdjustedColumnWidth: function(gridId){
    return _state[gridId].scrollProperties.defaultColumnWidth; //+ this.props.paddingHeight * 2; // account for padding.
  },

  columnsHaveUpdated: function(gridId){
     // Compute the new visible column properties.
    var oldColumnProperties = _state[gridId].columnProperties; // TODO: Removed _.clone
    helpers.updateColumnProperties(gridId, _state[gridId].columnProperties.getColumnMetadata());

    if (helpers.shouldUpdateDrawnColumns(oldColumnProperties, gridId)){
      helpers.setVisibleColumns(gridId);
      return true;
    } else {
      return false;
    }
  },

  rowsHaveUpdated: function(gridId, oldScrollProperties){
    // If the scroll position changes and the drawn rows need to update, do so.
    if (helpers.shouldUpdateDrawnRows(oldScrollProperties, gridId)){
      // Update the current displayed rows
      helpers.setCurrentDataPage(gridId);
      return true;
    } else {
      return false;
    }
  },

  updateScrollProperties: function(gridId){
    // Load the new scrollProperties
    var oldScrollProperties = _state[gridId].scrollProperties;
    _state[gridId].scrollProperties = _.clone(ScrollStore.getScrollProperties(gridId));
    if (helpers.rowsHaveUpdated(gridId, oldScrollProperties) || helpers.columnsHaveUpdated(gridId)) {

      // Update whether or not we should automatically load the next page.
      _state[gridId].pageProperties.shouldAutoLoadNextPage = helpers.shouldLoadNewPage(gridId);
      // Emit the change.
      DataStore.emitChange();
    }
  },

  getAvailableColumns: function(gridId){
    if (_state[gridId].data){
      // TODO: this will be coming from column metadata, but for now, go with the property names.
      return Object.keys(_state[gridId].data[0]);
    } else {
      return [];
    }
  }
};

var registeredCallback = function(action){
    switch(action.actionType){
      case Constants.GRIDDLE_INITIALIZED:
        //assign new state object
        var state = assign({}, defaultGridState);
        _state[action.gridId] = state;

        // Set the initial scroll properties.
        _state[action.gridId].scrollProperties = _.clone(ScrollStore.getScrollProperties(action.gridId));

        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_REMOVED:
        //remove the item from the hash
        delete _state[action.gridId];

        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_LOADED_DATA:
        _state[action.gridId].data = action.data;
        helpers.setMaxPage(action.gridId);
        helpers.setCurrentDataPage(action.gridId);
        helpers.updateColumnProperties(action.gridId, action.columnMetadata);
        helpers.setVisibleColumns(action.gridId);
        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_FILTERED:
        helpers.filterData(action.gridId, action.filter);
        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_FILTER_REMOVED:
        _state[action.gridId].hasFilter = false;
        helpers.setCurrentDataPage(action.gridId);
        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_SET_PAGE_SIZE:
        _state[action.gridId].pageProperties.pageSize = action.pageSize;
        helpers.setMaxPage(action.gridId);
        helpers.setCurrentDataPage(action.gridId);
        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_GET_PAGE:
        if (action.pageNumber >= 0 && action.pageNumber <= _state[action.gridId].pageProperties.maxPage){
          _state[action.gridId].pageProperties.currentPage = action.pageNumber;
          helpers.setCurrentDataPage(action.gridId);
          DataStore.emitChange();
        }
        break;
      case Constants.GRIDDLE_NEXT_PAGE:
        if(_state[action.gridId].pageProperties.currentPage < _state[action.gridId].pageProperties.maxPage-1){
          _state[action.gridId].pageProperties.currentPage++;
          helpers.setCurrentDataPage(action.gridId);
          DataStore.emitChange();
        }
        break;
      case Constants.GRIDDLE_PREVIOUS_PAGE:
        if(_state[action.gridId].pageProperties.currentPage > 0){
          _state[action.gridId].pageProperties.currentPage--;
          helpers.setCurrentDataPage(action.gridId);
          DataStore.emitChange();
        }
        break;
      case Constants.GRIDDLE_SORT:
        _state[action.gridId].sortProperties.sortColumns = action.sortColumns;
        _state[action.gridId].sortProperties.sortAscending = action.sortAscending || _state[action.gridId].sortProperties.defaultSortAscending;
        helpers.sort(action.gridId);
        DataStore.emitChange();
        break;
      case Constants.GRIDDLE_ADD_SORT_COLUMN:
        _state[action.gridId].sortProperties.sortColumns.push(action.sortColumn);
        _state[action.gridId].visibleData = DataHelper.sort(
          _state[action.gridId].sortProperties.sortColumns,
          DataStore.getVisibleData(action.gridId),
          _state[action.gridId].sortAscending
        );
        break;
      case Constants.GRIDDLE_SORT_ORDER_CHANGE:
        _state[action.gridId].sortAscending = !_state[action.gridId].sortAscending;
        _state[action.gridId].visibleData = DataHelper.reverseSort(DataStore.getVisibleData(action.gridId));
        DataStore.emitChange();
        break;
      case Constants.XY_POSITION_CHANGED:
          helpers.updateScrollProperties(action.gridId);
          break;
      default:
    }
  }


var DataStore = assign({}, StoreBoilerplate, {
  getState: function(gridId){
    return _state[gridId];
  },

  //gets the original, full data-set
  getAllData: function(gridId){
    return _state[gridId].data;
  },

  //gets the filtered, sorted data-set
  getVisibleData: function(gridId){
    return helpers.getAllVisibleData(gridId);
  },

  getCurrentDataPage: function(gridId){
    return _state[gridId].currentDataPage;
  },

  getPageCount: function(gridId){
    return _state[gridId].pageProperties.maxPage;
  },

  getPageProperties: function(gridId){
    return _state[gridId].pageProperties;
  },

  getColumnProperties: function(gridId){
    return _state[gridId].columnProperties;
  },

  dispatchToken: AppDispatcher.register(registeredCallback)
});




module.exports = DataStore;
