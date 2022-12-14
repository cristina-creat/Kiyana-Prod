'use strict'
/** @module routes/v1/tools */

/**
 * @requires UserController - Require User controller to link functionality
 * @requires TenantController - Require Tenant controller to link functionality
 */
const UserController = require('../../controllers/users');
const ToolsController = require('../../controllers/tools');

/** Exports all routing functions to be used inside main app routing */
module.exports = function(router) {

    /**
     * Route designed for testing porpoises, should not return confidential data.
     * @name get/tools/test
     * @function
     * @memberof module:controllers/tools
     * @inner
     * @param {string} path - Express path
     * @param {function} test - Catalog controller function.
     */
    router.get('/tools/test', ToolsController.test);

    /**
     * Route designed for updating permissions, should be excecuted once some new functionality has been included.
     * @name get/tools/generate-permissions
     * @function
     * @memberof module:controllers/tools
     * @inner
     * @param {string} path - Express path
     * @param {function} generatePermissions - Catalog controller function.
     */
    router.get('/tools/generate-permissions', UserController.generatePermissions);

    /**
     * Route serving information about current running app.
     * @name get/tools/options
     * @function
     * @memberof module:controllers/tools
     * @inner
     * @param {string} path - Express path
     * @param {function} getAppOptions - Catalog controller function.
     */
    router.get('/tools/options', ToolsController.getAppOptions);

}

//app.use('/', routes);