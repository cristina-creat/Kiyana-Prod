'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 * @requires moment - Require moment library to handle date time manipulation
 */
var mongoose = require('mongoose');
var moment = require('moment');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;

/**
 * @class UserPassword - Stores password change requests with expire date
 */
var UserPasswordSchema = Schema({
	_user: { type: Schema.ObjectId, ref: 'User' },
	code: { type: String, required: true, default: function() { return (Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 8)) } },
	created_at: { type: Date, default: Date.now },
	valid_until: { type: Date, default: function() {
		return moment(new Date()).add(30, 'minutes').toDate();
	}},
	used: { type: Date },
	pwd_changed: { type: Date },
});

UserPasswordSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 0 });

/** Exports already created Schemas as mongoose models */
module.exports = mongoose.model('UserPassword',UserPasswordSchema);