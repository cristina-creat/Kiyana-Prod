'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 */
var mongoose = require('mongoose');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;

/**
 * @class User - Stores user information - One user may be assigned to a multiple tenants
 * */
var UserSchema = Schema({
    firstname: { type: String },
    lastname: { type: String },
    email: { type: String, unique: true, required: true, default: function() { return (Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 16))+'@future.com.mx' }},
    password: { type: String, select: false },
    avatar: { type: String },
    sexo: { type: String },
    extradata: [{ type: Schema.Types.Mixed }],
    device_tokens: [{ type: String }],
    secret_key: { type: String, required: true, select: false, default: function() { return (Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 16)) } },
    last_login: { type: Date },
    _tenants: [ new Schema({
        _tenant: {type: Schema.ObjectId, ref: 'Tenant'},
        id_colaborador: { type: String },
        contact_phone: { type: String },
        director: { type: Boolean, required: true, default: false },
        position: { type: String },
        rango: { type: Number },
        admission_date: { type: String },
        division: { type: String },
        location: { type: String },
        _manager: { type: Schema.ObjectId, ref: 'User' },
        _role: { type: Schema.ObjectId, ref: 'UserRole', required: true },
        _paysheet: { type: Schema.ObjectId, ref: 'Paysheet' },
        _insurances: [{ type: Schema.ObjectId, ref: 'Insurance' }],
        active: { type: Boolean, required:true, default: true },
    })],
    role: { type: String, required: true, default: 'Subscriber' }, // Use Admin for master access
    created_at: { type: Date, required:true, default: Date.now },
    last_update: { type: Date, required:true, default: Date.now }
});

/** Exports already created Schemas as mongoose models */
module.exports = mongoose.model('User', UserSchema);