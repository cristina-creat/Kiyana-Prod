'use strict'
/** @module routes/v1/files */

/**
 * @requires FilesController - Require Files controller to link functionality
 */
const FileController = require('../../controllers/files');

/** Exports all routing functions to be used inside main app routing */
module.exports = function(router) {
    
    /**
     * Route serving single public avatar file by filename.
     * @name get/avatars/:file
     * @function
     * @memberof module:controllers/files
     * @inner
     * @param {string} path - Express path
     * @param {function} serveAvatarFileByName - Catalog controller function.
     */
    router.get('/avatars/:file', FileController.serveAvatarFileByName);
    
    /**
     * Route serving single public tenant file by filename.
     * @name get/files/catalogs/:tenant/:filename
     * @function
     * @memberof module:controllers/files
     * @inner
     * @param {string} path - Express path
     * @param {function} serveCatalogByName - Catalog controller function.
     */
    router.get('/files/catalogs/:tenant/:filename', FileController.serveCatalogByName);

}
