'use strict'
/** @module middleware/permission */

/**
 * @requires config - Require config wich includes main environment configuration
 */
var config = require('config');


/**
 * Validate user permissions middleware
 *
 * @param {String} permission - Slug permission that will be tested for authorization
 * @returns {function}
 * @inner
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
exports.permit = function(permission) {
  return function(req, res, next) {
        /** Validate user has assigned a role and role has a permissions array */
        if(!req.user || !req.user._tenant || !req.user._tenant._role || !req.user._tenant._role.permissions){
            return res.status(403).send({message:'Unauthorized access. User not logged in.'});
        }
        /** user_permissions - temporary var to store permissions slugs */
        var user_permissions = req.user._tenant._role.permissions;
        /** Test current permissions lists included required permission OR have a MAIN admin role */
        if( user_permissions.indexOf(permission)==-1 && req.user.role != config.roles.admin ){
            return res.status(403).send({message:'Unauthorized access. ( '+permission+' is required)'});
        }
        next();
    }
}

/**
 * Validate user permissions middleware, must pass at least one permission
 *
 * @param {Array<String>} permissions - Array of slugs permissions that will be tested for authorization
 * @returns {function}
 * @inner
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
exports.permitAny = function(permissions) {
  return function(req, res, next) {
        /** If is MAIN ADMIN role, let it pass */
        if( req.user.role == config.roles.admin ) {
            return next();
        }

        /** auth - Variable to let us know if some permission is available for user */
        var auth = false;
        
        /** Validate user has assigned a role and role has a permissions array */
        if(!req.user || !req.user._tenant || !req.user._tenant._role || !req.user._tenant._role.permissions){
            return res.status(403).send({message:'Unauthorized access.'});
        }
        
        /** user_permissions - temporary var to store permissions slugs */
        var user_permissions = req.user._tenant._role.permissions;
        /** Test each required permission agains current user permissions */
        permissions.forEach( per => {
            // If some permission is assigned, let user pass the middleware
            if(!auth && user_permissions.indexOf(per)!==-1 ){
                auth = true;
                return next();
            }
        });
        /** If none of the permissions was assigned, return error and finish middleware */
        if(!auth)
            return res.status(403).send({message:'Unauthorized access.', permissions: permissions});
        
    }
}