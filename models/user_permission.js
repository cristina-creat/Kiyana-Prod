'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 */
var mongoose = require('mongoose');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;

/**
 * @class UserPermission - Stores global permissions to be used in roles management
 */
var UserPermissionSchema = Schema({
	name: { type : String, required : true},
	slug: { type : String, unique : true, required : true}
});

/** Exports already created Schemas as mongoose models */
module.exports = mongoose.model('UserPermission',UserPermissionSchema);