'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 */
var mongoose = require('mongoose');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;

/**
 * @class UserRole - Stores roles with array of permission ID, assigned for a single tenant
 */
var UserRoleSchema = Schema({
	name: { type : String, required : true},
	slug: { type : String, required : true},
	permissions: [{ type: Schema.ObjectId, ref: 'UserPermission' }],
	_tenant: {type: Schema.ObjectId, ref: 'Tenant'},
});

/** Exports already created Schemas as mongoose models */
module.exports = mongoose.model('UserRole',UserRoleSchema);