'use strict'
var config = require('config');
var mailing = require('../services/mailing');
var User = require('../models/user');
var UserRole = require('../models/user_role');
var UserPermission = require('../models/user_permission');
const Mongoose = require('mongoose');




exports.permitAny = function(permissions, req) {
    var auth = false;
    /** Authorize if has a main global role */
    if( req.user.role == config.roles.admin ) {
        return true;
    }

    if(!req.user || !req.user.role || !req.user.role.permissions){
        return false;
    }
    var user_permissions = req.user.role.permissions.map( (el) => { return el.slug; } );
    permissions.forEach( per => {
        if(!auth && user_permissions.indexOf(per)!==-1 ){
            auth = true;
            return true;
        }
    });
    return auth;
}

exports._handleError = function(err){
	let errors = [];
    if(err){
        if(err.errors){
            for(var key in err.errors) {
                errors.push(err.errors[key].message);
            }
        } else {
            if(err.errmsg){
                errors.push(err.errmsg);
            } else {
                errors.push(err);
            }
        }
    }
    return errors;
}

exports.getUserWithPermission = function(user_permission, tenandId){
	/**
	* Return a list of user with some permission
	*
	* returns Promise
	**/
	return new Promise( async function(resolve, reject) {

        // Search for roles
        let pipeline = [
            { $match: {slug: user_permission} },
            { $lookup: {
                "from": "userroles",
                "localField": "_id",
                "foreignField": "permissions",
                "as": "_roles"
            } },
            { $match: {'_roles._tenant': Mongoose.Types.ObjectId(tenandId) } },
            { $lookup: {
                "from": "users",
                "localField": "_roles._id",
                "foreignField": "_tenants._role",
                "as": "_users"
            } },
            { $project: { "_users.firstname": 1, "_users.lastname": 1, "_users.email": 1 } }
        ];

        let results = await UserPermission.aggregate(pipeline);

        let arrayResults = [];

        results.forEach( rs => {
            arrayResults = arrayResults.concat( rs._users );
        })

        resolve( arrayResults );
		
		
	});
	
}


exports.zeroPad = function (num, places) {
  var zero = places - num.toString().length + 1;
  return Array(+(zero > 0 && zero)).join("0") + num;
}

exports.getSubstring = function (str,start,end) {
    const result = str.match(new RegExp(start + "(.*)" + end));
    return (result && result[1]) ? (result[1]).trim() : null; 
  }




/*
*
*   Validated Items
*
*/
exports.sendDefaultErrorMail = function( subject, title, error ){

    if ( error && typeof(error) != 'string' ) {
        error = JSON.stringify(error);
    }

    
    var recipients = {};

    config.admin_mails.forEach( em => {
        recipients[ em ] = {
            'title': title,
            'message': 'Se ha generado un error al ejecutar el código. Por favor verifica la siguiente información:<br/></br/>'+error
        };
    });

    mailing.send({
        recipients: recipients,
        subject: subject,
        template: "alert-notification"
    });
}