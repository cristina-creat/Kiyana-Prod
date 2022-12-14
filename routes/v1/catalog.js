'use strict'
/** @module routes/v1/catalog */

/**
 * @requires config - Require config wich includes main environment configuration
 * @requires multipart - Require multiparty module wich handles uploading functionality
 * @requires access - Require access middlewayre wich handle permissions before controller excecution
 * @requires CatalogController - Require Catalog controller to link functionality
 */
const config = require('config');
const multipart = require('connect-multiparty');
const access = require('../../middlewares/permissions');
const CatalogControllers = require ('../../controllers/catalog');

/** @const {middleware} multipartMiddleware - configure upload directory middleware */
const multipartMiddleware = multipart({uploadDir: config.upload_dir_tmp });

/** Exports all routing functions to be used inside main app routing */
module.exports = function (router){
    
    /**
     * Route serving handling upload file for catalogs.
     * @name post/catalog/upload-file
     * @middleware [access:permit,multipartMiddleware]
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {callback} middleware - Express middleware.
     * @param {function} addFileCatalog - Catalog controller function.
     */
    router.post('/catalog/upload-file', [access.permit('admin-catalogs-create'),multipartMiddleware], CatalogControllers.addFileCatalog );
    
    /**
     * Route serving catalog data by name.
     * @name get/catalog/:catalog
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {function} getCatalog - Catalog controller function.
     */
    router.get('/catalog/:catalog', CatalogControllers.getCatalog );
    
    /**
     * Route for creating catalog item from catalog name.
     * @name post/catalog/:catalog
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {callback} middleware - Express middleware.
     * @param {function} addCatalog - Catalog controller function.
     */
    router.post('/catalog/:catalog', access.permit('admin-catalogs-create'), CatalogControllers.addCatalog );
    
    /**
     * Route serving single catalog item by catalog name and item ID.
     * @name get/catalog/:catalog:/:id
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {function} getCatalogById - Catalog controller function.
     */
    router.get('/catalog/:catalog/:id', CatalogControllers.getCatalogById );
    
    /**
     * Route for updating catalog item by catalog name and item ID.
     * @name put/catalog/:catalog/;id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {callback} middleware - Express middleware.
     * @param {function} updateCatalogById - Catalog controller function.
     */
    router.put('/catalog/:catalog/:id', access.permit('admin-catalogs-update'), CatalogControllers.updateCatalogById );
    /**
     * Route for updating catalog item by catalog name and item ID.
     * @name patch/catalog/:catalog/;id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {callback} middleware - Express middleware.
     * @param {function} updateCatalogById - Catalog controller function.
     */
    router.patch('/catalog/:catalog/:id', access.permit('admin-catalogs-update'), CatalogControllers.updateCatalogById );
    
    /**
     * Route for deleting catalog item by catalog name and item ID.
     * @name delete/catalog/:catalog/;id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {callback} middleware - Express middleware.
     * @param {function} deleteCatalogById - Catalog controller function.
     */
    router.delete('/catalog/:catalog/:id', access.permit('admin-catalogs-delete'), CatalogControllers.deleteCatalogById );

}