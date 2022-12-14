'use strict'

/**
 * Express router main module, define subroutes and handle mongodb connection
 * @requires express
 * @requires mongoose
 * @requires config
 */
const express = require('express');
const mongoose = require('mongoose');
const config = require('config');

/** Initializa main routing express module */
const router = express.Router();

/** Initializa main routing express module */
mongoose.Promise = global.Promise;

/** Validate mongo configuration exists */
if (!config || !config.mongo || !config.mongo.database) {
    console.log('Mongo configuration not fount');
}

/** Define itial DB connection string */
var string_connection = config.mongo.protocol || 'mongodb://';

/** Add authentication data to DB connection string */
if (config.mongo.user && config.mongo.password) {
    string_connection += config.mongo.user + ':' + config.mongo.password + '@';
}

/** Add configuration for multiple hosts to DB connection string if neccessary */
if (config.mongo.hosts && Array.isArray(config.mongo.hosts) && config.mongo.hosts.length) {
    // Multiple host
    string_connection += config.mongo.hosts.map(el => el.url + ( ( el.port )  ? ( ':' + el.port ) : '' ) ).join(',');
} else {
    // Single host
    string_connection += config.mongo.url + ( ( config.mongo.port ) ? ( ':' + config.mongo.port ) : '' )
}

/** Add database name to connection string */
string_connection += '/' + config.mongo.database;

/** Add database extra params to connection string */
if (config.mongo.params) {
    string_connection += '?' + Object.keys(config.mongo.params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(config.mongo.params[k])}`).join('&');
}

/** Define database connection options */
var opts = {};
if (config.mongo.options) {
    opts = config.mongo.options;
}

/**
 * 
 * Initialize MongoDb connection
 * 
 * @param {String} string_connection - MongoDb formar string connection
 * @param {Object} opts - Object with extra options connection
 * @param {AnonFunction} callback - Callback when DB connection completed.
 */
mongoose.connect(string_connection, opts, (err, res) => {
    if (err) {
        throw err;
    } else {
        console.log('connected');
    }
});


/** Resolve base route */
router.get('/', function(req, res, next) {
    res.status(200).send({ message: 'welcome to KIYANA API' });
});


/**
 * Express router main module, define subroutes and handle mongodb connection
 * @requires auth
 * @requires catalog
 * @requires files
 * @requires stats
 * @requires tenant
 * @requires tools
 * @requires users
 * @requires conciliador
 */
require('./auth')(router);
require('./me')(router);
require('./catalog')(router);
require('./files')(router);
require('./stats')(router);
require('./tenant')(router);
require('./tools')(router);
require('./users')(router);
require('./conciliador')(router);

/** Exports full configured routed */
module.exports = router;
