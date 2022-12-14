'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 */
var mongoose = require('mongoose');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;

/**
 * @class Tenant - Stores company information
 */
const TenantSchema = Schema({
    name : {type : String, required: true},
    calle : {type : String},
    colonia : {type : String},
    cp : {type : String},
    estado : {type : String},
    municipio : {type : String},
    pais : {type : String},
    tel : {type : String},
    know_api : {type : String},
    contacto_admin : {type : String},
    status: { type: Boolean, required:true, default: true },
    img: { type: String} ,
    color: { type: String} ,
    last_update: { type: Date, required:true, default: Date.now },
    created_at: { type: Date, default: Date.now }
});

/** Exports already created Schemas as mongoose models */
module.exports = mongoose.model('Tenant', TenantSchema);