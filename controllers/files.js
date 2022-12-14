'use strict'
/** @module controllers/files */

/**
 * @requires config - Require main configuration file
 * @requires fs - Require fs library
 * @requires path - Require path library
 * 
 */
var fs = require('fs');
var path = require('path');
var config = require('config');

/**
 * @description Serve avatar file from filename
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.filename - Avatar name expected to retrive
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(file)} data - res.send Serve file data with express
 * 
 * @returns {void}
 */
exports.serveAvatarFileByName = function(req, res, next) {
    /** Define avatar file by directory and file */
    var file = config.upload_avatar_dir + req.params.file
    /** Validate file exists */
    fs.exists(file, function(exists) {
        /** Return file or error */
        if (exists) {
            res.sendFile(path.resolve(file));
        } else {
            next({ status: 200, message: 'File unavailable.' });
        }
    });
}

/**
 * @description Serve catalog file from filename
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.tenant - Tenant ID owner of the file
 * @property {string} req.params.filename - Catalog name expected to retrive
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(file)} data - res.send serve file data with express
 * 
 * @returns {void}
 */
exports.serveCatalogByName = function(req, res, next) {
        /** Define filname by directory and file */
        var file = config.upload_dir + config.upload_catalog_dir + req.params.tenant + '/' + req.params.filename;
        /** Return file or error */
        fs.exists(file, function(exists) {
            if (exists) {
                res.sendFile(path.resolve(file));
            } else {
                next({ status: 200, message: 'File unavailable.', });
            }
        });
}

