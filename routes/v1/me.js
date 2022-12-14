'use strict'
/** @module routes/v1/users */

/**
 * @requires config - Require config wich includes main environment configuration
 * @requires multipart - Require multiparty module wich handles uploading functionality
 * @requires access - Require access middlewayre wich handle permissions before controller excecution
 * @requires UserController - Require User controller to link functionality
 */
var config = require('config');
var multipart = require('connect-multiparty');
var access = require('../../middlewares/permissions');
var MeController = require('../../controllers/me');


/** Exports all routing functions to be used inside main app routing */
module.exports = function(router) {

    /**
     * Route serving current user information.
     * @name get/me
     * @function
     * @memberof module:controllers/me
     * @inner
     * @param {string} path - Express path
     * @param {function} getMe - Catalog controller function.
     */
    router.get('/me', MeController.getMe);

    /**
     * Route serving current user updating.
     * @name patch/me
     * @function
     * @memberof module:controllers/me
     * @inner
     * @param {string} path - Express path
     * @param {function} updateMe - Catalog controller function.
     */
     router.patch('/me', MeController.updateMe);



}