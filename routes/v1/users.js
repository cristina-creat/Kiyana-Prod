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
var UserController = require('../../controllers/users');

/** @const {middleware} multipartMiddleware - configure upload directory middleware */
var multipartMiddleware = multipart({ uploadDir: config.upload_dir_tmp });

/** Exports all routing functions to be used inside main app routing */
module.exports = function(router) {

    /**
     * Route serving all users list.
     * @name get/users
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} getUsers - Catalog controller function.
     */
    router.get('/users', access.permit('admin-users-read'), UserController.getUsers);

    /**
     * Route serving single user creation.
     * @name post/users
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} addUser - Catalog controller function.
     */
    router.post('/users', access.permit('admin-users-create'), UserController.addUser);

    /**
     * Route serving single user info with details.
     * @name get/users/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} getUserById - Catalog controller function.
     */
    router.get('/users/:id', access.permit('admin-users-read'), UserController.getUserById);

    /**
     * Route serving single user updating by user ID.
     * @name patch/users/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} updateUserById - Catalog controller function.
     */
    router.patch('/users/:id', access.permit('admin-users-update'), UserController.updateUserById);

    /**
     * Route serving single user password updating by user ID.
     * @name patch/users/:id/password
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} updateUserPasswordById - Catalog controller function.
     */
    router.patch('/users/:id/password', access.permit('admin-users-update'), UserController.updateUserPasswordById);

    /**
     * Route serving single user deleting by user ID.
     * @name delete/users/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} deleteUserById - Catalog controller function.
     */
    router.delete('/users/:id', access.permit('admin-users-delete'), UserController.deleteUserById);

    /**
     * Route serving bulk user creation.
     * @name post/users
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/user
     * @inner
     * @param {string} path - Express path
     * @param {function} bulkUsers - Catalog controller function.
     */
    router.post('/bulk-users', access.permit('admin-users-bulk'), UserController.bulkUsers);


}