//@ts-check

/** 
 * Express router providing user related routes
 * @requires express - Imprting module for server and routing enhancements
 * @requires helmet - Imprting module for basic app security settings
 * @requires path - Imprting module where basic configuration is defined
 * @requires logger - Imprting module to handle output logs in console
 * @requires cookieParser - Imprting module to handle cookie functionalities
 * @requires bodyParser - Imprting module to handle body requests through POST & PATCH methods
 * @requires authentication - Imprting module for authentication handling
 */
const express = require('express');
const helmet = require('helmet')
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const authentication = require('./middlewares/authentication');
/**
* Load base configuration definitions
*
* @type {Object} - Imprting module where basic configuration is defined
*/
const config = require('config');


/**
 * 
 * @module appRoutes - Imprting main routing module for expose GET, POST, PATH, DELETE Methods
 */
var appRoutes = require('./routes/v1/app');

/** Initializa main express module */
var app = express();

/** Config X-Frame default headers */
app.use(helmet.frameguard());

/** Debine HBS Template engine */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
/**
 * 
 *  This section define base routing configuration
 *  - Define console.log level
 *  - Define MAX POST Size
 *  - Define public folders (public, v1/public, v1/uploads )
 * 
 */
app.use(logger('dev'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use('/api/public', express.static(path.join(__dirname, '/public')));
app.use('/api/v1/public', express.static(path.join(__dirname, '/public')));
app.use('/api/v1/uploads', express.static(path.join(__dirname, 'uploads')));


/**
 * 
 * Setup CORS depending from the configured origin
 * @param {string} origin
 */
function allowOrigins(origin) {
    if (config.cors_origins && config.cors_origins.indexOf(origin) != -1 || !origin) {
        return '*';
    } else {
        console.warn('Alert, possible hack *', origin);
        return '*';
        //return null;
    }
}


/**
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigins(req.headers.origin));
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Custom-Tenant');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, PATCH, DELETE, OPTIONS');
    // No cache
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
});


/** Use authentication middleware */
app.use('/api', authentication.validate);

/** Use defined routes from imported module */
app.use('/api/v1', appRoutes);

/** Setup default base route */
app.get('/api/', function(req, res) {
    res.render('index', { title: 'KIYANA' });
});

/** Catch 404 Errors */
app.use(function(req, res, next) {

    var err = new Error('404 Not Found');
    err['status'] = 404;
    next(err);
});

/** Catch any error */
app.use(function(err, req, res, next) {
    if (!err.status)
        err.status = 404;
    var error = new Error();
    error['status'] = err.status;
    error.message = err.message;
    error['error'] = (err.error || '');
    res.status(error['status']).send({ status: 'error', message: (error.message || 'Internal error'), error: error['error'] });
});

/** Exports full configured express app */
module.exports = app;