'use strict'
/** @module routes/v1/stats */

/**
 * * @requires access - Require access middlewayre wich handle permissions before controller excecution
 * @requires StatsController - Require Stats controller to link functionality
 */
const access = require('../../middlewares/permissions');
const StatsController = require('../../controllers/stats');

/** Exports all routing functions to be used inside main app routing */
module.exports = function (router) {

    /**
     * Route serving catalog data by name.
     * @name get/stats/global
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/stats
     * @inner
     * @param {string} path - Express path
     * @param {function} getGlobalStats - Catalog controller function.
     */
    router.get('/stats/global', access.permit('admin-stats-read'), StatsController.getGlobalStats );

    /**
     * Route serving catalog data by name.
     * @name get/stats/period/:start/:end
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/stats
     * @inner
     * @param {string} path - Express path
     * @param {function} getPeriodStats - Catalog controller function.
     */
    router.get('/stats/period/:start/:end', access.permit('admin-stats-read'), StatsController.getPeriodStats );

}

//app.use('/', routes);