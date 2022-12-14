'use strict'
/** @module controllers/stats */

/**
 * @requires User - Require User Model
 * 
 */
const User = require('../models/user');


/**
 * @description Get a list of conciliaciones
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
exports.getGlobalStats = function(req,res){
	/** Define an array to store database promises */
	var promises = [];
	/** Select users from current tenant */
	promises.push(User.count({ '_tenants._tenant': req.tenant }));

	/** Select users that has used the app at least 1 time */
	promises.push(User.count({'_tenants._tenant': req.tenant, last_login: {$exists: true, $ne: null} }));

	/** Return promise results */
	Promise.all( promises ).then(
		result => {
			res.send( { data: {
				users: result[0],
				users_w_login: result[1],
			} } );
		}
	).catch(
		err => {
			/** Catch errors if something went wrong */
			res.send( err );
		}
	);


}	


/**
 * @description Get a list of conciliaciones
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
exports.getPeriodStats = function(req,res){
	/** This method is not in use yet */
	res.send();
}	