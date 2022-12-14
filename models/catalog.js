'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 */
var mongoose = require('mongoose');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;


/**
 * @class CredencialQualitas
 */
var CredencialQualitasSchema = Schema({
    identifier: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    expire: { type: Date },
    sort: { type: Number, default: 99 },
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'}
});

/**
 * @class CredencialChubb
 */
var CredencialChubbSchema = Schema({
    identifier: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    expire: { type: Date },
    sort: { type: Number, default: 99 },
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'}
});

/**
 * @class CredencialHDI
 */
var CredencialHDISchema = Schema({
    identifier: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    expire: { type: Date },
    sort: { type: Number, default: 99 },
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'}
});

/**
 * @class CredencialGMX
 */
 var CredencialGMXSchema = Schema({
    identifier: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    expire: { type: Date },
    sort: { type: Number, default: 99 },
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'}
});

/**
 * @class CredencialGNP
 */
 var CredencialGNPSchema = Schema({
    identifier: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    expire: { type: Date },
    sort: { type: Number, default: 99 },
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'}
});
/** Exports already created Schemas as mongoose models */
module.exports = {
    CredencialQualitas: mongoose.model('CredencialQualitas', CredencialQualitasSchema),
    CredencialChubb: mongoose.model('CredencialChubb', CredencialChubbSchema),
    CredencialHDI: mongoose.model('CredencialHDI', CredencialHDISchema),
    CredencialGMX: mongoose.model('CredencialGMX', CredencialGMXSchema),
    CredencialGNP: mongoose.model('CredencialGNP', CredencialGNPSchema),
}