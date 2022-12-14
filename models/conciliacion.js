'use strict'
/** @module models/catalog */

/**
 * @requires mongoose - Require mongoose library wich includes main database handling
 */
var mongoose = require('mongoose');

/** @type {mongoose.Schema} */
var Schema = mongoose.Schema;

/**
 * @class Conciliacion - Stores Main Conciliación Data
 */
var ConciliacionSchema = Schema({
    type: { type: String },
    month: { type: Number },
    year: { type: Number },
    agents: [{ type: String }],
    count_files: { type: Number, default: 0 },
    status: { type: String, required:true, default: 'pending' },
    tries: { type: Number, required:true, default: 0 },
    extradata: { type: Schema.Types.Mixed },
    _sica: { type: Schema.ObjectId, ref: 'Sica' },
    _user: { type: Schema.ObjectId, ref: 'User' },
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'},
    created_at: { type: Date, required:true, default: Date.now },
    proccessed_at: { type: Date }
});

/**
 * @class SICA - Stores SICA informatio assocciated to a unique Conciliacion
 */
var SicaSchema = Schema({
    data: [
      {
        CAgente: {type: Number}, 
        CiaAbreviacion: {type: String}, 
        Documento: {type: String}, 
        EjecutNombre: {type: String}, 
        Endoso: {type: String}, 
        FDesde: {type: Date}, 
        FStatus: {type: Date}, 
        ImportePendXMon: {type: Number}, 
        ImportePend_MXN: {type: Number}, 
        Moneda: {type: String}, 
        Nliquidacion: {type: String}, 
        NombreCompleto: {type: String}, 
        NombreGerencia: {type: String}, 
        Periodo: {type: String}, 
        PrimaNeta: {type: Number}, 
        Serie: {type: String}, 
        Status_TXT: {type: String}, 
        TCPagoF: {type: String}, 
        TCom: {type: String}, 
      }
    ],
    _tenant: {type: Schema.ObjectId, ref: 'Tenant'},
    _user: { type: Schema.ObjectId, ref: 'User' },
    created_at: { type: Date, required:true, default: Date.now }
});

/**
 * @class QueueQuery - Stores single request RPA item, assocciated to a unique Conciliacion
 */
var QueueQuerySchema = Schema({
  type: { type: String, required: true },
  identifier: { type: String },
  status: { type: String, required:true, default: 'pending' },
  activities: [{
    act: { type: String },
    status: { type: Boolean },
    public: { type: Boolean, default: true },
    extradata: { type: Schema.Types.Mixed }
  }],
  _conciliacion: { type: Schema.ObjectId, ref: 'Conciliacion' },
  _tenant: {type: Schema.ObjectId, ref: 'Tenant'},
  started_at: { type: Date },
  finished_at: { type: Date },
  created_at: { type: Date, required:true, default: Date.now }
});

/**
 * @class ConciliacionResult - Stores results of matching data between SICAS & QueueQuery data, assocciated to a unique Conciliacion
 */
var ConciliacionResultSchema = Schema({
  data: [
    {
      poliza: { type: String },
      sica: { type: Schema.Types.Mixed },
      insurance: { type: Schema.Types.Mixed },
      status: { type: String },
    }
  ],
  filename:  { type: String },
  _conciliacion: { type: Schema.ObjectId, ref: 'Conciliacion' },
  _tenant: {type: Schema.ObjectId, ref: 'Tenant'},
  created_at: { type: Date, required:true, default: Date.now }
});

/** Exports already created Schemas as mongoose models */
module.exports = {
    Conciliacion: mongoose.model('Conciliacion', ConciliacionSchema),
    Sica: mongoose.model('Sica', SicaSchema),
    QueueQuery: mongoose.model('QueueQuery', QueueQuerySchema),
    ConciliacionResult: mongoose.model('ConciliacionResult', ConciliacionResultSchema)
  }