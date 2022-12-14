'use strict'
/** @module routes/v1/catalog */

/**
 * @requires access - Require access middlewayre wich handle permissions before controller excecution
 * @requires ConciliadorController - Require Conciliador controller to link functionality
 */
const access = require('../../middlewares/permissions');
const ConciliadorController = require ('../../controllers/conciliador');

/** Exports all routing functions to be used inside main app routing */
module.exports = function (router){
    
    /**
     * Route serving catalog data by name.
     * @name get/conciliador
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} getConciliaciones - Catalog controller function.
     */
    router.get('/conciliador', access.permit('admin-conciliaciones-read'), ConciliadorController.getConciliaciones );
    
    /**
     * Route serving conciliaciones list.
     * @name post/catalog/upload-file
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {callback} middleware - Express middleware.
     * @param {function} addFileCatalog - Catalog controller function.
     */
    router.post('/conciliador', access.permit('admin-conciliaciones-create'), ConciliadorController.addConciliacion );
    
    /**
     * Route serving single conciliacion results by ID.
     * @name get/conciliador/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} getConciliacionResults - Catalog controller function.
     */
    router.get('/conciliador/:id', access.permit('admin-conciliaciones-read'), ConciliadorController.getConciliacionResults );

    /**
     * Route serving file to download result for a single conciliacion.
     * @name get/conciliador/:id/file-download/:id_result/:filename
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/catalog
     * @inner
     * @param {string} path - Express path
     * @param {function} getCatalog - Catalog controller function.
     */
    router.get('/conciliador/:id/file-download/:result_id/:filename', access.permit('admin-conciliaciones-read'), ConciliadorController.getConciliacionFile );
    
    /**
     * Route that regenerates conciliacion by ID.
     * @name get/conciliador/:id/sync
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} doConciliacion - Catalog controller function.
     */
    router.get('/conciliador/:id/sync', access.permit('admin-conciliaciones-create'), ConciliadorController.doConciliacion );
    
    /**
     * Route that set queue item in pending by conciliacion ID and queue ID.
     * @name get/conciliador/:id/reset-queue/:queue_id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} resetQueueById - Catalog controller function.
     */
    router.get('/conciliador/:id/reset-queue/:queue_id', access.permit('admin-conciliaciones-create'), ConciliadorController.resetQueueById );
    
    /**
     * Route that delete conciliacion and queues by conciliacion ID.
     * @name delete/conciliador/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} deleteConciliacionById - Catalog controller function.
     */
    router.delete('/conciliador/:id', access.permit('admin-conciliaciones-delete'), ConciliadorController.deleteConciliacionById );
    
    /**
     * Public route that excecute current pending queue in background.
     * @name get/crons/proccess-queue
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} proccessQueue - Catalog controller function.
     */
    router.get('/crons/proccess-queue', ConciliadorController.processQueue );

    /**
     * Public route that try to conciliar in background items where all queues are completed.
     * @name get/crons/conciliar
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} doConciliacion - Catalog controller function.
     */
    router.get('/crons/conciliar', ConciliadorController.doConciliacion );


    /**
     * Public route that sends a notification when some credential is going to expire in the next days.
     * @name get/crons/password-expire
     * @function
     * @memberof module:controllers/conciliador
     * @inner
     * @param {string} path - Express path
     * @param {function} doConciliacion - Catalog controller function.
     */
     router.get('/crons/password-expire', ConciliadorController.notifyPasswordExpiration );


}