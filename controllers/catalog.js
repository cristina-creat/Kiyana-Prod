'use strict'
/** @module controllers/catalog */

/**
 * @requires config - Require main configuration file
 * @requires fs - Require fs library
 */
var config = require('config');
var fs = require('fs');

/**
 * @description Get a some catalog collection items
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestParams
 * @property {string} req.params.catalog - Catalog name expected to retrive
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(array)} data - res.send conciliaciones list
 * 
 * @returns {void}
 */
exports.getCatalog = function(req, res, next) {

    // Obtain main model dynamically
    var Catalog = require("../models/catalog")[req.params.catalog];

    // Define empty pipeline
    var pipeline = [];

    // Filter options
    var filter = {};

    if (req.query && req.query.query) {
        let buff = new Buffer(req.query.query, 'base64');
        let query = buff.toString('ascii');
        filter = JSON.parse(query);
    }

    if (Catalog.schema.paths.active && !req.query.all) {
        filter.active = true;
    }

    // Filter tenant
    filter._tenant = req.tenant;

    // Add to pipeline if not empty
    if (Object.keys(filter).length) {
        pipeline.push({
            $match: filter
        });
    }

    // Sort options
    var sort = {};
    if (Catalog.schema.paths.sort) {
        sort.sort = 1;
    }
    if (Catalog.schema.paths.name) {
        sort.name = 1;
    }

    if (Object.keys(sort).length) {
        pipeline.push({
            $sort: sort
        });
    }

    // Limit query
    if (req.query && req.query.limit) {
        pipeline.push({
            $limit: parseInt(req.query.limit)
        });
    }


    Catalog.aggregate(pipeline)
        .exec()
        .then(data => {
            res.send({ data: data });

        }).catch(err => {
            console.log(err);
            next({ status: 500, message: 'Error retriving catalog.' });
        });

}

/**
 * @description Create new catalog item fromm body data
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestParams
 * @property {string} req.params.catalog - Catalog name expected to retrive
 * 
 * @typedef {Object} requestBody
 * @property {object} req.body.data - Catalog item data to create
 * 
 * @param {Express.Request<{},requestData,requestParams,requestBody>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send new created catalog item
 * 
 * @returns {void}
 */
exports.addCatalog = function(req, res, next) {
    var Catalog = require("../models/catalog")[req.params.catalog];
    var item = new Catalog();

    for (var key in req.body) {
        item[key] = req.body[key];
    }

    // Add tenant
    item._tenant = req.tenant;


    item.save((err, data) => {
        if (err || !data) {
            next({ status: 200, message: 'Error saving item.', error: common._handleError(err) });
        } else {
            res.send({ data: data });
        }
    })

}

/**
 * @description Get catalog item data from catalog name and item ID
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestParams
 * @property {string} req.params.catalog - Catalog name expected to retrive
 * @property {string} req.params.id - Catalog item ID expected to retrive
 * 
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send expected catalog item
 * 
 * @returns {void}
 */
exports.getCatalogById = function(req, res, next) {
    /**
     * Get catalog item.
     *
     * returns Item
     **/

    var Catalog = require("../models/catalog")[req.params.catalog];

    Catalog.findOne({_tenant: req.tenant, _id:req.params.id}).exec(function(err, data) {
        if (err || !data) {
            next({ status: 200, message: 'Catalog item not exists.', error: common._handleError(err) });
        } else {
            res.send({ data: data });
        }
    });
}

/**
 * @description Update catalog item from catalog name, item ID and body data
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestParams
 * @property {string} req.params.catalog - Catalog name expected to retrive
 * @property {string} req.params.id - Catalog item ID expected to retrive
 * 
 * @typedef {Object} requestBody
 * @property {object} req.body.data - Catalog item data to update
 * 
 * @param {Express.Request<{},requestData,requestParams,requestBody>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send new updated catalog item
 * 
 * @returns {void}
 */
exports.updateCatalogById = function(req, res, next) {
    /**
     * Update catalog item.
     *
     * returns Item
     **/

    var Catalog = require("../models/catalog")[req.params.catalog];

    var item = {};

    for (var key in req.body) {
        if (key !== '_id')
            item[key] = req.body[key];
    }

    if ( item['_tenant'] ) {
        delete item['_tenant'];
    }

    Catalog.findOneAndUpdate({_tenant: req.tenant, _id: req.params.id}, item, { new: true }).exec(function(err, data) {
        if (err || !data) {
            next({ status: 200, message: 'Error updating item.', error: common._handleError(err) });
        } else {
            res.send({ data: data });
        }
    });

}

/**
 * @description Delete catalog item from catalog name and item ID
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestParams
 * @property {string} req.params.catalog - Catalog name expected to retrive
 * 
 * @typedef {Object} requestBody
 * @property {object} req.body.data - Catalog name expected to retrive
 * 
 * @param {Express.Request<{},requestData,requestParams,requestBody>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send deleted catalog item
 * 
 * @returns {void}
 */
exports.deleteCatalogById = function(req, res, next) {
    /**
     * Return a item deleted status
     *
     * returns Deleted status
     **/

    var Catalog = require("../models/catalog")[req.params.catalog];

    Catalog.findOneAndRemove({_tenant: req.tenant, _id: req.params.id}).exec(function(err, data) {
        if (err || !data) {
            next({ status: 200, message: 'Error deleting item.', error: common._handleError(err) });
        } else {
            res.send({ data: data });
        }
    })

}

/**
 * @description Create new catalog file item from file data
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestParams
 * @property {string} req.params.catalog - Catalog name expected to retrive
 * 
 * @typedef {Object} requestFile
 * @property {object} req.file.file - Catalog item file data to create
 * 
 * @param {Express.Request<{},requestData,requestParams,requestFile>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send new created catalog item URL
 * 
 * @returns {void}
 */
exports.addFileCatalog = function(req, res, next) {
    var filepath = req.files.file.path;
    var upload_tmp = config.upload_dir_tmp.replace('./', '');
    var filename = filepath.replace(upload_tmp, '');

    // Validate folder exists
    if (!fs.existsSync(config.upload_dir + config.upload_catalog_dir + req.tenant)) {
        // Do something
        fs.mkdirSync(config.upload_dir + config.upload_catalog_dir + req.tenant);
    }

    filepath = config.upload_dir + config.upload_catalog_dir + req.tenant + '/' + filename;
    fs.renameSync(req.files.file.path, filepath);
    res.send({
        url: config.api_url + 'files/catalogs/' + req.tenant + '/' + filename
    });
}