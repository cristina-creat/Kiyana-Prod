'use strict'
/** @module middleware/authentication */

/**
 * @requires config - Require config wich includes main environment configuration
 * @requires jwt - Require jwt for token encryption / decryption
 * @requires UserModel - Require User model to interact with database
 */
const config = require('config');
const jwt = require('../services/jwt');
const User = require('../models/user');

/**
 * @description Validate token autorization middleware
 *
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
exports.validate = function(req,res,next){
    /** url - Store required URL */
    var url = req.url;
    /** Separate URL into pieces divided by "/" */
    url = url.split('/');
    /** Return only parts of the url that aren't empty */
    url = url.filter(function(el){ return el.length>0});
    /** remove api version from the url */
    if(url.length>0 && config.api_versions.indexOf(url[0])!=-1){
        url.shift();
    }
    /** If the route is protected, then apply the middleware */
    if('OPTIONS' != req.method && url.length>0 && config.public_directories.indexOf(url[0])==-1 && config.public_routes.indexOf(url.join('/'))==-1){
        /** If auth header is not present, then return error */
        if(!req.headers.authorization){
            return res.status(403).send({message:'Auth header is required.'});
        }
        /** token - get token from header */
        var token = req.headers.authorization.replace(/['"]+/g, '');
        /** try to decode jwt token, if could not be decoded then throw a js error by default */
        try{
            /** Token shouldn't be expired */
            var payload = jwt.decodeToken(token);
            if(!jwt.validateExpiration(payload.ext) || !jwt.validateKey(payload)){
                return res.status(401).send({message:'Token expired.'});
            }
        } catch(ex) {
            /** Token is invalid */
            return res.status(403).send({message:'Invalid token.'});
        }
        
        /** User - Connect with DB and look for user info, tenant ID should be present into token data */
        User.findOne(
            { $or: [
                { _id: payload._user, '_tenants._tenant': payload._tenant },
                { _id: payload._user, role: config.roles.admin },
            ] }
        )
        /** Explicit expose secret_key to compare with token */
        .select('+secret_key')
        /**
         *  Result of DB query
         * @param {callback} mongoResult - Mongo callback function
         * @inner
         * @param {error} err - MongoDb Error
         * @param {Object} userdata - Userdata info, may be empty. 
         * */
        .exec( (err, userdata) => {
            /** Validate if error is present or user not found */
            if(err || !userdata){
                /** Return error if user some error  - Middleware should finish at this momment */
                return res.status(403).send({message:'User not authorized.'});
            } else {
                /** If current user is MAIN Admin role, the assign current tenant to selected user */
                if ( userdata.role == config.roles.admin ) {
                    userdata._tenants.push({
                        _tenant: payload._tenant
                    })
                }
                /** populate - Define population object */
                var populate = { path: '_tenants._role', populate: { path: 'permissions', select: 'slug -_id' }, select: '-_id -_tenant' }
                /** Populate current userdata */
                userdata.populate(populate, function(err) {
                    /** Validate error on population */
                    if (!err) {
                        /** tmpUser - Convert userdata (DB Model) to a editable object */
                        let tmpUser = userdata.toObject();
                        /** Find current tenant inside user */
                        tmpUser._tenant = tmpUser._tenants.find( el => el._tenant == payload._tenant );
                        /** Validate current tenant exists */
                        if ( tmpUser._tenant && (tmpUser._tenant._role || tmpUser.role == config.roles.admin ) ) {
                            /** If current tenant role is empty, assign empty one */
                            if ( !tmpUser._tenant._role ) {
                                tmpUser._tenant._role = {
                                    permissions: []
                                }
                            }
                            /** Get an array of permissions slugs */
                            tmpUser._tenant._role.permissions = tmpUser._tenant._role.permissions.map( pr => pr.slug );
                            /** Remove all other tenants from user data */
                            delete tmpUser._tenants;
                            /** req.tenant - Update current express request to have current tenant available inside controllers*/
                            req.tenant = tmpUser._tenant._tenant;
                            /** req.user - Update current express request to have current user info available inside controllers*/
                            req.user = tmpUser;
                            next();
                        } else {
                            /** Return error if tenant not exists */
                            return res.status(403).send({message:'Tenant or permissions not found 1.', userdata: tmpUser});
                        }
                    } else {
                        /** Return error if population not successfull */
                        return res.status(403).send({message:'Tenant or permissions not found 2.', userdata: tmpUser});
                    }
                });
            }
        });
    } else {
        /** Current route is a public rout or directory */
        next();
    }
}
