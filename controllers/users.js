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
 * @constant
 * @type {object} base_permissions 
 * @default
 * @description Base of permissions to generate into database.
 * */
const base_permissions = {
    'Admin': {
        'Stats': ['read'], // Need this item for panel access
        'Tenant': ['read', 'create', 'update', 'delete'],
        'Roles': ['read', 'create', 'update', 'delete'],
        'Users': ['read', 'create', 'update', 'delete', 'bulk'],
        'Catalogs': ['read', 'create', 'update', 'delete'],
        'Conciliaciones': ['read', 'create','delete'],
        'Notifications': ['expirepassword'],
    }
}

/**
 * @description Admin only function to generate base permissions, use it when new permission is added
 *
 * @typedef {Object} requestData
 * 
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(array)} data - res.send permissions list
 * 
 * @returns {void}
 */
exports.generatePermissions = function(req, res) {
    
    /** Walk object for a main permissions or module */
    for (var module in base_permissions) {
        /** Walk object for a subpermission or submodule */
        for (var submodule in base_permissions[module]) 
            /** Walk array for final permissions */{
            base_permissions[module][submodule].forEach(function(item) {
                /** Define a structure for a single permission, later we'll convert it to a string */
                var permission = [];
                permission.push(module);
                permission.push(submodule);
                permission.push(item);
                /** Define a new prototype of permission model */
                var new_data = new UserPermission();
                /** Convert permission array to string */
                new_data.name = permission.join(' ');
                /** Get slug of permissions, this will avoid duplicate permissions */
                new_data.slug = getSlug(new_data.name);
                /** Save current permission */
                new_data.save((err, permissionStored) => {
                    if (err) {
                        /** Throw error if permission already exists or something went wrong */
                        console.log('error creating ' + new_data.name + ' permission');
                    }
                });

            });
        }
    }
    /** Send to the client the current permissions list */
    res.send(base_permissions);
}




/**
 * @description Get a list of current tenant users
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(array)} data - res.send conciliaciones list
 * 
 * @returns {void}
 */
exports.getUsers = function(req, res) {
    /** Look in the database for current tenant users, sorted by firstname */
    User.find({'_tenants._tenant': req.tenant}).sort({ firstname: 1 }).lean().exec(function(err, data) {
        /** Edit each user in order to not provide other tenants information */
        data = data.map( usr => {
            usr._tenants = usr._tenants.find( tn => String(tn._tenant) == String(req.tenant) );
            return usr;
        });
        /** Send information to the client */
        res.send({ data: data });
    });
}

/**
 * @description Create new user for the current tenant
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * RequestBody should include new user information
 * @typedef {Object} requestBody
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send new created conciliacion
 * 
 * @returns {void}
 */
exports.addUser = async function(req, res, next) {
    /** Store user information from requestBody to a local var */
    let params = req.body;

    /** Validate user email is present inside the requestBody */
     if (!params.email) {
        res.send({ message: 'El campo "email" es requerido' });
        return;
    }

    /** Find if user already exists, due to a multi tenant functionallity */
    let prevUser = await User.findOne({email: params.email }).exec();

    /** Create user if don't exists already */
    if ( !prevUser ) {
        var user = new User({ email: params.email });
        await user.save();
        /** Get user again, like if user already exists in a different tenant */
        prevUser = await User.findOne({email: params.email }).exec();
    }
    
    /** Validate user don't have already assigned the current tenant */
    if ( !prevUser._tenants.find( tn => tn._tenant == req.tenant ) ) {
        /** Update user pushing tenant information (Tenant ID and role), return new user info */
        prevUser = await User.findByIdAndUpdate(prevUser._id,{$push:{_tenants:{_tenant:req.tenant, _role: params.role}}},{new: true}).exec();
    }
    /** Replace user tenants information to prevent display other tenants information */
    prevUser._tenants = prevUser._tenants.find( tn => tn._tenant == req.tenant );

    /** Send user info to the client */
    res.send( {
        data: prevUser
    });
}

/**
 * @description Return user information by ID and current tenant
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - User ID
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response updated conciliacion
 * 
 * @returns {void}
 */

exports.getUserById = function(req, res, next) {
    /** Do a database search with a lean function to be able to edit as native object*/
    User.findOne({'_tenants._tenant': req.tenant, _id: req.params.id}).lean().exec((err, user) => {
        if (err) {
            /** Return error if something went wrong */
            next({ status: 200, message: 'User doesnt exists.' });
        } else {
            /** Validate user exixts */
            if (user) {
                /** Remove other tenants information */
                user._tenants = user._tenants.find( tn => String(tn._tenant) == String(req.tenant) );
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
 * @description Update user information by ID and current tenant
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - User ID
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
exports.updateUserById = function(req, res, next) {
    /** Define fields that could be updated for the current user */
    let user_fields = ['firstname','lastname','email','sexo','role','extradata'];
    /** Define fields that could be updated inside the current tenant */
    const tenant_fields = ['id_colaborador','contact_phone','_role','active'];
    
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

    /** Find user from the database and current tenant */
    User.findOne({'_tenants._tenant': req.tenant, _id: req.params.id}).exec((err, user) => {
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
                /** Get index of the current tenant into the user information */
                let tenantIndex = user._tenants.findIndex( tn => String(tn._tenant) == String(req.tenant) );
                
                /** If tenant exists, update only allowed fields */
                if ( tenantIndex != -1 && user._tenants && user._tenants[tenantIndex] ) {
                    tenant_fields.forEach( key => {
                        user._tenants[tenantIndex][key] = params._tenants[key];
                    });
                }

                /** Save user information */
                user.save().then(
                    usrResponse => {
                        /** Remove other tenants information to avoid exposing sensible data */
                        let tmpUser = usrResponse.toObject();
                        tmpUser._tenants = tmpUser._tenants.find( tn => String(tn._tenant) == String(req.tenant) );
                        /** Send new data to the client */
                        res.send(tmpUser);
                    }
                ).catch( err => {
                    /** Pass error if something went wrong */
                    next({ status: 200, message: 'Error updating user.', error: err });
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

/**
 * @description Elimina un usuario por ID del tenant actual
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - User ID
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response with user info
 * 
 * @returns {void}
 */
exports.deleteUserById = async function(req, res, next) {
    /** Find user in current tenant */
    let prevUser = await User.findOne({_tenant: req.renant, _id: req.params.id }).exec();

    /** Update _tenants array pulling the current one */
    prevUser._tenants = prevUser._tenants.filter( tn => String(tn._tenant) != String(req.tenant) );

    /**  Update user in the database */
    await prevUser.save()

    /** Send user data to the client */
    res.send( {
        data: prevUser
    });
    
}

/**
 * @description Create multiple users for the current tenant in one request
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * RequestBody should include multiple user information
 * @typedef {Object} requestBody
 * @property {Array<Object>} req.body.users - User data array
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send new created conciliacion
 * 
 * @returns {void}
 */
exports.bulkUsers = async function(req, res, next) {
    
    /** Convert user information to a standard email and role types */
    req.body.users = req.body.users.map( el => {
         el.email = el.email.toLowerCase();
         if ( el._tenant && el._tenant._role ) {
             el._tenant._role = mongoose.Types.ObjectId( el._tenant._role );
         }
         return el;
    });

    /** Define global userdata information removing sensible information */
    let global_userdata = _.cloneDeep(req.body.users).map( el => {
        delete el._tenant;
        delete el.created_at;
        delete el.updated_at;
        delete el.role;
        delete el.extra_data;
        delete el.secret_key;
        delete el.last_login;
        /** If new password is present, encrypt and assign secret key */
        if ( el.password ) {
            el.secret_key = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 16);
            el.password = bcrypt.hashSync(el.secret_key+'-'+el.password, config.bcrypt_rounds);
        }
        return el;
    });

    /** Only users with email will be updated */
    global_userdata = global_userdata.filter( el => el.email );

    /** Define bulk write options, email is the key to update */
    var bulkOps = global_userdata.map(el => ({
        updateOne: {
            filter: { email: el.email },
            update: {
                $set: el
            },
            upsert: true
        }
    }));
    
    /** Update all global data */
    let globalResults = await User.collection.bulkWrite(bulkOps);

    /** Define tenant userdata object */
    let tenant_userdata = {};
    
    /** We will update only users that have an email, tenant and role */
    req.body.users.filter( el => (el.email && el._tenant && el._tenant._role) ).forEach( el => {
        /** _tenant should be an object of current tenant information */
        tenant_userdata[ el.email ] = el._tenant
   });

    /** Get users from an array of emails */
    User.find({ email: { $in: Object.keys(tenant_userdata) } }).then(
        updateUsers => {
            /** We will walk each user to update info */
            updateUsers.map( async u => {
                /** Find current tenant index to update */
                let tenantIndex = u._tenants.findIndex( tn => String(tn._tenant) == String(req.tenant) );
                /** If user already belongs to the current tenant, we will update it */
                if ( tenantIndex != -1 && u._tenants && u._tenants[tenantIndex] ) {
                    /** Insert tenant data to the existent information */
                    let tenant_fields = tenant_userdata[u.email];
                    if ( tenant_fields ) {
                        Object.keys(tenant_fields).forEach( key => {
                            u._tenants[tenantIndex][key] = tenant_fields[key];
                        });
                    }
                    
                } else {
                    /** If user dont belong to the current tenant, we will push the new one */
                    let _tenant = {};
                    let tenant_fields = tenant_userdata[u.email];
                    if ( tenant_fields ) {
                        /** Insert new tenant information */
                        Object.keys(tenant_fields).forEach( key => {
                            _tenant[key] = tenant_fields[key];
                        });
                    }
                    _tenant._tenant = req.tenant;
                    u._tenants.push(_tenant)
                }
                /** Save the current user data */
                await u.save();

            });
            /** Add the updated users qty to the result*/
            globalResults.result.nTenant = updateUsers.length;
            /** Send the updated results to the client */
            res.send( globalResults );
            
        }
    ).catch(
        err => {
            next({ status: 200, message: 'Error updating userdata tenant.' });
        }
    );
    
}