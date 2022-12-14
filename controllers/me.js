'use strict'
/** @module controllers/conciliacion */

/**
 * @requires config - Require config wich includes main environment configuration
 * @requires mongoose - Require mongoose library
 * @requires bcrypt - Require bcrypt library
 * @requires fs - Require fs library
 * @requires speakingurl - Require speakingurl library
 * @requires _ - Require lodash library
 * 
 * @requires jwt - Require jwt service wich includes token generation functions
 * 
 * @requires UserPermission - Require User Permission model to connect with database
 * @requires User - Require User model to connect with database
 * 
 */
const config = require('config');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const getSlug = require('speakingurl');
const _ = require('lodash');

var jwt = require('../services/jwt');

var UserPermission = require('../models/user_permission');
var User = require('../models/user');



/**
 * @description Return current user information
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response updated conciliacion
 * 
 * @returns {void}
 */

exports.getMe = function(req, res, next) {
    /** Do a database search with a lean function to be able to edit as native object*/
    User.findOne({_id: req.user._id}).lean().exec((err, user) => {
        if (err) {
            /** Return error if something went wrong */
            next({ status: 200, message: 'User doesnt exists.' });
        } else {
            /** Validate user exists */
            if (user) {
                /** Return user data */
                res.send(user);
            } else {
                /** Return error if user not exists */
                next({ status: 200, message: 'Error retriving user.' });
            }
        }
    });

}

/**
 * @description Update current user information
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * 
 * * RequestBody should include new user information
 * @typedef {Object} requestBody
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response updated conciliacion
 * 
 * @returns {void}
 */
exports.updateMe = function(req, res, next) {
    /** Define fields that could be updated for the current user */
    let user_fields = ['firstname','lastname','email','password','sexo','role','extradata'];
    
    /** Define fields that could be updated inside the current tenant */
    const tenant_fields = [];
    
    /** Store request body data into a local variable */
    let params = req.body;
    /** User data must include email */
    if (!params.email) {
        res.send({ message: 'El campo "email" es requerido' });
        return;
    }

    /** If current user is not allowed to edit the Main Role, then remove this key */
    if( req.user.role != 'Admin' && params.role ) {
        delete params.role;
        user_fields = user_fields.filter( el => el != 'role' );
    }

    /** Find current user from the database */
    User.findOne({_id: req.user._id}).exec((err, user) => {
        /** Return error if something went wrong */
        if (err) {
            next({ status: 200, message: 'User doesnt exists.' });
        } else {
            /** Validate user exists */
            if (user) {
                /** Filter only available user data fields */
                user_fields.forEach( key => {
                    user[key] = params[key];
                });

                /** If password is changing, we also need to change the secret key */
                if ( params.password ) {
                    user.secret_key = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 16);
                    /** Encrypt new password */
                    user.password = bcrypt.hashSync(user.secret_key+'-'+params.password, config.bcrypt_rounds);
                }
                
                /** Save user information */
                user.save().then(
                    usrResponse => {
                        /** Send new data to the client */
                        res.send(user);
                    }
                ).catch( err => {
                    /** Pass error if something went wrong */
                    let message = 'Error updating user';
                    if ( err && err.code == 11000 )
                        message = 'El correo electrónico ya se encuentra en uso';
                    next({ status: 200, message: message, error: err });
                });

                
            } else {
                /** Return error if user not exists */
                next({ status: 200, message: 'Error retriving user.' });
            }
        }
    });  

}

/**
 * @description Update user password by ID and current tenant
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - User ID
 * 
 * RequestBody should include new user information
 * @typedef {Object} requestBody
 * @property {string} req.body.password - New user password
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response updated conciliacion
 * 
 * @returns {void}
 */
exports.updateUserPasswordById = function(req, res, next) {
    /** Define local var where we will store new user information */
    let user = {};
    /** Store body params locally */
    let params = req.body;
    /** Validate password is present in the current request body */
    if (!params.password) {
        res.send({ message: 'El campo "password" es requerido' });
        return;
    }

    /** If password is changing, we also need to change the secret key */
    user.secret_key = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 16);
    /** Encrypt new password */
    user.password = bcrypt.hashSync(user.secret_key+'-'+params.password, config.bcrypt_rounds);
    
    /** Update password from the current user and tenant */
    User.findOneAndUpdate({'_tenants._tenant': req.tenant, _id: req.params.id}, { $set: user }, { new: true }).exec((err, user) => {
        /** I something went wrong, pass error */
        if (err) {
            next({ status: 200, message: 'Error updating user.', error: err });
        } else {
            /** If user data exists, send to the client */
            if (user)
                res.send(user);
            else {
                /** Pass error if user not exists */
                next({ status: 200, message: 'Error updating user.' });
            }
        }
    });

}
