'use strict'
/** @module routes/v1/auth */

/**
 * Require Auth controller to link functionality
 * @requires AuthController
 */
var AuthController = require('../../controllers/auth');

/**
 * 
 * Exports authentication routing
 * 
 * @param {router} ExpressRouter - Receive main app router - 
 */
module.exports = function (router) {
    /** Setup default base route */
    router.post('/auth/login', AuthController.doLogin );
    router.get('/auth/validate-token', AuthController.validateToken );
    router.post('/auth/request-password-restore', AuthController.forgotPasswordRequest );
    router.post('/auth/request-password-restore-code', AuthController.forgotPasswordRequestCode );
    router.post('/auth/request-password-setup-new', AuthController.resetPassword );
    
}
