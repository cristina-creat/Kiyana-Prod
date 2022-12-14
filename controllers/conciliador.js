'use strict'
/** @module controllers/conciliacion */

/**
 * @requires mongoose - Require mongoose library
 * @requires moment - Require moment library
 * @requires fs - Require fs library
 * @requires path - Require path library
 * @requires _ - Require lodash library
 * @requires zipdir - Require zipdir library to generate ZIP file for a result
 * 
 * @requires common - Require common service wich includes current using functions
 * @requires mailing - Require mailing service
 * @requires chubb - Require chubb service
 * @requires hdi - Require hdi service
 * @requires qualitas - Require qualitas service
 * @requires gmx - Require GMX service
 * 
 * @requires catalogModel {CredencialQualitas, CredencialHDI, CredencialChubb} - Require User model to connect with database
 * @requires conciliacionModel {Conciliacion, Sica, QueueQuery, ConciliacionResult} - Require User model to connect with database
 * 
 */
const mongoose = require('mongoose');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const zipdir = require('zip-dir');
const _ = require('lodash');

const common = require('../services/common');
const mailing = require('../services/mailing');
const gmx = require('../services/insurances/gmx');
const chubb = require('../services/insurances/chubb');
const hdi = require('../services/insurances/hdi');
const qualitas = require('../services/insurances/qualitas');
const gnp = require('../services/insurances/gnp');

const { CredencialQualitas, CredencialHDI, CredencialChubb, CredencialGMX,CredencialGNP } = require('../models/catalog')
const { Conciliacion, Sica, QueueQuery, ConciliacionResult } = require('../models/conciliacion');

/** Setup moment language */
moment.locale('es')




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
exports.getConciliaciones = function (req, res, next) {
    /** Define base empty filtering object */
    let filter = {};
    /** If don't have enough permissions, filter for only their conciliaciones */
    if (!common.permitAny(['admin-conciliaciones-admin'], req)) {
        console.log('sin permiso admin');
        filter = {
            _tenant: req.tenant,
            _user: req.user._id
        }
    } else {
        /** If have enough permissions, filter all tenant items */
        filter = {
            _tenant: req.tenant
        }
    }
    /** Excecute query from the DB */
    Conciliacion.find(filter).populate([{ path: '_user', select: 'email firstname lastname' }]).sort({ created_at: -1 }).exec().then(
        data => {
            /** Should return an array of items */
            res.send({ data: data })
        }
    ).catch(
        err => {
            /** Throw an error if something went wrong */
            next({ status: 500, message: 'Error loading data', error: err });
        }
    )
}

/**
 * @description Create new conciliacion request
 *
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 * 
 * @typedef {Object} requestBody
 * @property {object} req.body.period - Date format period for requested conciliacion
 * @property {object} req.body.insurance - Selected insurance ID for requested conciliacion
 * @property {object} req.body.dataFile - Data origin of SICAS report (already converted to JSON)
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send new created conciliacion
 * 
 * @returns {void}
 */
exports.addConciliacion = async function (req, res, next) {

    /** Receive data from post body */
    let { period, insurance } = req.body;

    /** Convert period to multiple formats */
    period = {
        month: moment(period).format('MMMM'),
        month_number: moment(period).format('MM'),
        year: moment(period).year()
    }


    /** Do a switch/case for available insurances, throw error if insurance is not available */
    switch (insurance) {
        /** Start QUALITAS insurance conciliacion generation */
        case 'Qualitas':

            /** Get credentials (Find agentes in SICA file, then get credentials in database) */
            let cveAgentes = _.uniq(req.body.dataFile.map(el => el.CAgente));
            /** Get credential from the database */
            let credentials = await CredencialQualitas.find({ _tenant: req.tenant, identifier: { $in: cveAgentes } });


            /** Save SICA DATA into database */
            let sicaData = new Sica({ data: req.body.dataFile, _user: req.user._id, _tenant: req.tenant });
            try {
                await sicaData.save();
            } catch (err) {
                /** Throw error if SICA Data don't have an appropiate structure */
                next({ status: 500, message: 'Data prototipe not structured', error: err });
                return;
            }


            /** Create a base object of a conciliacion */
            let new_conciliacion = new Conciliacion();
            /** Assign current user */
            new_conciliacion._user = req.user._id;
            /** Assign current tenant */
            new_conciliacion._tenant = req.tenant;
            /** The type of the conciliacion is name of the insurance */
            new_conciliacion.type = insurance;
            /** Set the period month as a number */
            new_conciliacion.month = period.month_number;
            /** Set the period year as a number */
            new_conciliacion.year = period.year;
            /** Assign agent numbers */
            new_conciliacion.agents = credentials.map(i => i.identifier);
            /** Assocciate with a SICA register document */
            new_conciliacion._sica = sicaData._id;


            /** Define an array of Queries to excecute for a RPA */
            let pipeQueryList = credentials.map(el => ({
                type: 'Qualitas',
                identifier: el.identifier,
                _conciliacion: new_conciliacion._id,
                _tenant: req.tenant
            }));

            /** Assign the number of queries to excecute, to a conciliacion object */
            new_conciliacion.count_files = pipeQueryList.length;
            /** Store new conciliacion into database */
            new_conciliacion.save();

            /** Save the RPA Queries into the Queue Database */
            try {
                await QueueQuery.insertMany(pipeQueryList);
            } catch (err) {
                new_conciliacion.status = 'failed';
                new_conciliacion.save();
                /** Throw an error if something went wrong from the database saving */
                next({ status: 500, message: 'Queue for this insurance not stored', error: err });
                return;
            }
            /** Send the response to the client, should be the new conciliacion object */
            res.send(new_conciliacion);

            break;
        case 'HDI':
            /** Get credentials (Find agentes in SICA file, then get credentials in database) */
            let cveAgentesHDI = _.uniq(req.body.dataFile.map(el => el.CAgente));
            /** Get credential from the database */
            let credentialsHDI = await CredencialHDI.find({ _tenant: req.tenant, identifier: { $in: cveAgentesHDI } });


            /** Save SICA DATA into database */
            let sicaDataHDI = new Sica({ data: req.body.dataFile, _user: req.user._id, _tenant: req.tenant });
            try {
                await sicaDataHDI.save();
            } catch (err) {
                /** Throw error if SICA Data don't have an appropiate structure */
                next({ status: 500, message: 'Data prototipe not structured', error: err });
                return;
            }


            /** Create a base object of a conciliacion */
            let new_conciliacionHDI = new Conciliacion();
            /** Assign current user */
            new_conciliacionHDI._user = req.user._id;
            /** Assign current tenant */
            new_conciliacionHDI._tenant = req.tenant;
            /** The type of the conciliacion is name of the insurance */
            new_conciliacionHDI.type = insurance;
            /** Set the period month as a number */
            new_conciliacionHDI.month = period.month_number;
            /** Set the period year as a number */
            new_conciliacionHDI.year = period.year;
            /** Assign agent numbers */
            new_conciliacionHDI.agents = credentialsHDI.map(i => i.identifier);
            /** Assocciate with a SICA register document */
            new_conciliacionHDI._sica = sicaDataHDI._id;


            /** Define an array of Queries to excecute for a RPA */
            let pipeQueryListHDI = credentialsHDI.map(el => ({
                type: 'HDI',
                identifier: el.identifier,
                _conciliacion: new_conciliacionHDI._id,
                _tenant: req.tenant
            }));

            /** Assign the number of queries to excecute, to a conciliacion object */
            new_conciliacionHDI.count_files = pipeQueryListHDI.length;
            /** Store new conciliacion into database */
            new_conciliacionHDI.save();

            /** Save the RPA Queries into the Queue Database */
            try {
                await QueueQuery.insertMany(pipeQueryListHDI);
            } catch (err) {
                new_conciliacionHDI.status = 'failed';
                new_conciliacionHDI.save();
                /** Throw an error if something went wrong from the database saving */
                next({ status: 500, message: 'Queue for this insurance not stored', error: err });
                return;
            }

            /** Send the response to the client, should be the new conciliacion object */
            res.send(new_conciliacionHDI);

            break;
        case 'CHUBB':
            /** Get credentials (Find agentes in SICA file, then get credentials in database) */
            let cveAgentesChubb = _.uniq(req.body.dataFile.map(el => el.CAgente));
            /** Get credential from the database */
            let credentialsChubb = await CredencialChubb.find({ _tenant: req.tenant, identifier: { $in: cveAgentesChubb } });

            /** Save SICA DATA into database */
            let sicaDataChubb = new Sica({ data: req.body.dataFile, _user: req.user._id, _tenant: req.tenant });
            try {
                await sicaDataChubb.save();
            } catch (err) {
                /** Throw an error if something went wrong from the database saving */
                next({ status: 500, message: 'Data prototipe not structured', error: err });
                return;
            }


            /** Create a base object of a conciliacion */
            let new_conciliacionChubb = new Conciliacion();
            /** Assign current user */
            new_conciliacionChubb._user = req.user._id;
            /** Assign current tenant */
            new_conciliacionChubb._tenant = req.tenant;
            /** The type of the conciliacion is name of the insurance */
            new_conciliacionChubb.type = insurance;
            /** Set the period month as a number */
            new_conciliacionChubb.month = period.month_number;
            /** Set the period year as a number */
            new_conciliacionChubb.year = period.year;
            /** Assign agent numbers */
            new_conciliacionChubb.agents = credentialsChubb.map(i => i.identifier);
            /** Assocciate with a SICA register document */
            new_conciliacionChubb._sica = sicaDataChubb._id;


            /** Define an array of Queries to excecute for a RPA */
            let pipeQueryListChubb = credentialsChubb.map(el => ({
                type: 'Chubb',
                identifier: el.identifier,
                _conciliacion: new_conciliacionChubb._id,
                _tenant: req.tenant
            }));

            /** Assign the number of queries to excecute, to a conciliacion object */
            new_conciliacionChubb.count_files = pipeQueryListChubb.length;
            /** Store new conciliacion into database */
            new_conciliacionChubb.save();

            /** Save the RPA Queries into the Queue Database */
            try {
                await QueueQuery.insertMany(pipeQueryListChubb);
            } catch (err) {
                new_conciliacionChubb.status = 'failed';
                new_conciliacionChubb.save();
                /** Throw an error if something went wrong from the database saving */
                next({ status: 500, message: 'Queue for this insurance not stored', error: err });
                return;
            }

            /** Send the response to the client, should be the new conciliacion object */
            res.send(new_conciliacionChubb);

            break;
        case 'GMX':
                /** Get credentials (Find agentes in SICA file, then get credentials in database) */
                let cveAgentesGMX = _.uniq(req.body.dataFile.map(el => el.CAgente));
                /** Get credential from the database */
                let  credencialGMX = await CredencialGMX.find({ _tenant: req.tenant, identifier: { $in: cveAgentesGMX } });
             
                /** Save SICA DATA into database */
                let sicaDataGMX = new Sica({ data: req.body.dataFile, _user: req.user._id, _tenant: req.tenant });
                try {
                    await sicaDataGMX.save();
                } catch (err) {
                    /** Throw an error if something went wrong from the database saving */
                    next({ status: 500, message: 'Data prototipe not structured', error: err });
                    return;
                }
    
    
                /** Create a base object of a conciliacion */
                let new_conciliacionGMX= new Conciliacion();
                /** Assign current user */
                new_conciliacionGMX._user = req.user._id;
                /** Assign current tenant */
                new_conciliacionGMX._tenant = req.tenant;
                /** The type of the conciliacion is name of the insurance */
                new_conciliacionGMX.type = insurance;
                /** Set the period month as a number */
                new_conciliacionGMX.month = period.month_number;
                /** Set the period year as a number */
                new_conciliacionGMX.year = period.year;
                /** Assign agent numbers */
                new_conciliacionGMX.agents = credencialGMX.map(i => i.identifier);
                /** Assocciate with a SICA register document */
                new_conciliacionGMX._sica = sicaDataGMX._id;
    
    
                /** Define an array of Queries to excecute for a RPA */
                let pipeQueryListGMX = credencialGMX.map(el => ({
                    type: 'GMX',
                    identifier: el.identifier,
                    _conciliacion: new_conciliacionGMX._id,
                    _tenant: req.tenant
                }));
    
                /** Assign the number of queries to excecute, to a conciliacion object */
                new_conciliacionGMX.count_files = pipeQueryListGMX.length;
               
                /** Store new conciliacion into database */
                new_conciliacionGMX.save();
    
                /** Save the RPA Queries into the Queue Database */
                try {
                    
                    await QueueQuery.insertMany(pipeQueryListGMX);
                } catch (err) {
                    new_conciliacionGMX.status = 'failed';
                    new_conciliacionGMX.save();
                    /** Throw an error if something went wrong from the database saving */
                    next({ status: 500, message: 'Queue for this insurance not stored', error: err });
                    return;
                }
    
                /** Send the response to the client, should be the new conciliacion object */
                res.send(new_conciliacionGMX);
    
                break;
        
        default:
            /** Throw an error if insurance don't exists */
            next({ status: 500, message: 'Insurance module not available' });
    }

}

/**
 * @description Proccess the RPA excecutions queue, this may be a public method if it's excecuted from a crontab
 *
 * @typedef {Object} requestData
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response with all queue excecutions result
 * 
 * @returns {void}
 */
exports.processQueue = async function (req, res, next) {
    /** Define an array of promises, the response should be sent when all promises are completed */
    let result = [];
    /** Execute the qualitas queue */
    result.push(qualitas.processQueue());
    /** Execute the hdi queue */
    result.push(hdi.processQueue());
    /** Execute the chubb queue */
    result.push(chubb.proccessQueue());
     /** Execute the GMX queue */
    
     result.push(gmx.proccessQueue());
    Promise.all(result).then(
        resultData => {
            /** Send response to the client with the promise result  */
            res.send(resultData)
        }
    ).catch(err => {
        /** Send the error response to the client */
        res.send(err);
    })
}

/**
 * @description Search for a ready to conciliate RPAs and concilite it, this may be a public method if it's excecuted from a crontab
 *
 * @typedef {Object} requestData
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response with all conciliaciones results
 * 
 * @returns {void}
 */
exports.doConciliacion = async function (req, res, next) {

    // Commented because it's killing conciliaciones and leaving queues unproccessed, Conciliaciones should continue executing, this don't stop new conciliaciones
    // Here, we should kill items older than 1 day (queues and conciliaciones)
    // await Conciliacion.updateMany({status: "pending", created_at: { $lte: moment().subtract(1, 'day').toDate() }},{$set:{status:'proccessed'}},{multi: true});

    /** Set as completed conciliaciones that have 0 queue items */
    await Conciliacion.updateMany({ status: "pending", count_files: 0 }, { $set: { status: 'proccessed' } }, { multi: true });

    /** Define an array for the Database pipeline */
    let pipeline = [];
    /** If an ID is received, filter for selected ID */
    if (req.params.id) {
        pipeline = [
            { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
            /** Execute max 5 items per request */
            { $limit: 5 },
            {
                /** Populate Queue with their parent Conciliacion */
                $lookup: {
                    "from": "queuequeries",
                    "localField": "_id",
                    "foreignField": "_conciliacion",
                    "as": "_queue"
                }
            },
        ]
    } else {
        /** If no ID is received, look for common pending conciliaciones */
        pipeline = [
            { $match: { status: "pending" } },
            /** Execute max 5 items per request */
            { $limit: 5 },
            {
                /** Populate Queue with their parent Conciliacion */
                $lookup: {
                    "from": "queuequeries",
                    "localField": "_id",
                    "foreignField": "_conciliacion",
                    "as": "_queue"
                }
            }
        ];
    }

    /** Execute database query */
    let conciliaciones = await Conciliacion.aggregate(pipeline);
    

    /** remove unnecessary data from the database response */
    conciliaciones = conciliaciones.map(c => {
        /** Return only status and assigned agent */
        c._queue = c._queue.map(q => ({
            old: Math.ceil( moment().diff(q.finished_at) / 60000 ), // Number of minutes since this proccess was completed
            status: q.status,
            identifier: q.identifier
        }));
        /** Filter only queues that are in pending state or finished lower than 2 minutes */
        c._queue = c._queue.filter(q => q.status == 'pending' || q.old < 2 );
        return c;
    });


    /** Filter elements that have 0 item to proccess (length == 0), and return only the ID */
    let conIds = conciliaciones.filter(el => el.type && !el._queue.length).map(el => el._id);

    /** Get conciliaciones by previous array od IDs in order to have editable documents  */
    conciliaciones = await Conciliacion.find({ _id: { $in: conIds } });


    /** Create an array of promise responses */
    let responses = []
    /** Execute each conciliacion */
    for (const cn of conciliaciones) {
        /** Do different proccess for each insurance type */
        switch (cn.type) {
            /** Excecute conciliación by insurance type */
            case 'Qualitas':
                let qualitasResult = await qualitas.doConciliacion(cn);
                responses.push({
                    cn: cn,
                    s: qualitasResult
                });
                break;
            case 'HDI':
                let hdiResult = await hdi.doConciliacion(cn);
                responses.push({
                    cn: cn,
                    s: hdiResult
                }); break;
            case 'CHUBB':
                let chubbResult = await chubb.doConciliacion(cn);
                responses.push({
                    cn: cn,
                    s: chubbResult
                });
                break;
                case 'GMX':
                    let GMXResult = await gmx.doConciliacion(cn);
                    responses.push({
                        cn: cn,
                        s: GMXResult
                    });
                    break;
            default:
                /** Save an error response if the insurance type no longer exists */
                responses.push({
                    cn: cn,
                    s: 'Insurance not available'
                });
                console.log('Conciliation type not available', cn);
        }
    }
    
    /** Send the responses to the client */
    res.send({
        data: responses
    })
}

/**
 * @description Reinicia un elemento previamente procesado (restaura la conciliación y la solicitud a 'pending')
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - Queue ID
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response updated conciliacion
 * 
 * @returns {void}
 */
exports.resetQueueById = async function (req, res, next) {

    /** Set conciliacion status to pending */
    let conciliacion = await Conciliacion.updateOne({ _id: req.params.id, _tenant: req.tenant }, { $set: { status: 'pending', created_at: moment().toDate() } }, { new: true });
    /** Set selected queue status to pending */
    await QueueQuery.updateOne({ _id: req.params.queue_id, _conciliacion: req.params.id, _tenant: req.tenant }, { $set: { status: 'pending', created_at: moment().toDate(), activities: [] } });

    /** Remove results for selected conciliacion */
    await ConciliacionResult.remove({ _conciliacion: req.params.id, _tenant: req.tenant }, { multi: true });

    /** Send response to the client */
    res.send({
        data: conciliacion
    })
}


/**
 * @description Elimina una conciliación, así como sus dependientes por un  ID recibido
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - Conciliacion ID
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response updated conciliacion
 * 
 * @returns {void}
 */
exports.deleteConciliacionById = async function (req, res, next) {

    /** Remove all results from the current conciliación ID and current tenant */
    await ConciliacionResult.remove({ _conciliacion: req.params.id, _tenant: req.tenant }, { multi: true });

    /** Remove all queues from the current conciliación ID and current tenant */
    await QueueQuery.remove({ _conciliacion: req.params.id, _tenant: req.tenant }, { multi: true });

    /** Remove conciliacion from the current ID and current tenant */
    await Conciliacion.remove({ _id: req.params.id, _tenant: req.tenant }, { multi: true });

    /** Remove files to prevent garbage */
    fs.rmSync('./downloads/' + req.params.id, { recursive: true, force: true });

    /** Return just a simple OK */
    res.send({
        data: 'ok',
    })
}

/**
 * @description Return the last result of a conciliacion
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - Conciliacion ID
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response with a conciliacion result
 * 
 * @returns {void}
 */
exports.getConciliacionResults = async function (req, res, next) {

    /** Wrap code block to catch errors */
    try {
        /** Get conciliacion by ID and Tenant */
        let conciliacion = await Conciliacion.findOne({ _id: req.params.id, _tenant: req.tenant }).populate([{ path: '_user', select: 'email firstname lastname' }]);

        /** Validate user has permissions to view this item */
        if (!common.permitAny(['admin-conciliaciones-admin'], req)) {
            if (conciliacion && (!conciliacion._user || String(conciliacion._user._id) != String(req.user._id))) {
                conciliacion = null;
            }
        }

        /** Return 404 error if not found or not permissions */
        if (!conciliacion) {
            next({ status: 404, message: 'Data not found', error: 'Conciliación not found' });
            return;
        }

        /** Send client conciliacion, including queue list and last results */
        res.send({
            data: {
                conciliacion: conciliacion,
                queue: await QueueQuery.find({ _conciliacion: req.params.id }),
                result: await ConciliacionResult.findOne({ _conciliacion: req.params.id, _tenant: req.tenant }).sort({ created_at: -1 })
            }
        })
    } catch (err) {
        /** Throw error if something went wrong */
        next({ status: 500, message: 'Error retriving data', error: err });
        return;
    }


}

/**
 * @description Allow the conciliacion result in a XLSX file
 * 
 * @typedef {Object} requestData
 * @property {number} req.user - includes user data in current request
 * @property {string} req.tenant - includes user tenant in current request
 *
 * @typedef {Object} requestParams
 * @property {string} req.params.id - Conciliacion ID
 * @property {string} req.params.result_id - Resultado ID
 * @property {string} req.params.filename - File Name
 * 
 * @param {Express.Request<{},requestData,requestParams>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response with a conciliacion result
 * 
 * @returns {void}
 */
exports.getConciliacionFile = function (req, res, next) {

    /** Find conciliacion resuls by ResultID and Conciliacion ID */
    ConciliacionResult.findOne({ _conciliacion: req.params.id, _id: req.params.result_id }).exec().then(
        conciliacionData => {
            /** Define files path */
            let fileName = './downloads/' + req.params.id;
            /** Validate path exists */
            if (fs.existsSync(fileName)) {
                /** Setup file hheaders */
                res.setHeader('Content-disposition', 'attachment; filename=' + req.params.id + '.zip');
                res.setHeader('Content-type', 'application/zip');
                /** Compress path into a ZIP */
                zipdir(fileName, function (err, buffer) {
                    /** If result of zipping is complete, then send buffer to client*/
                    if (!err && buffer) {
                        res.status(200).send(new Buffer(buffer, 'base64'));
                    } else {
                        console.log('File download error', err)
                        res.status(404).send({
                            error: 'File not available 3'
                        })
                    }
                });
            } else {
                /** Throw error if path don't exists */
                res.status(404).send({
                    error: 'File not available 1'
                })
            }
        }
    ).catch(err => {
        /** Throw error if something went wrong */
        res.status(404).send({
            error: 'File not available 2'
        })
    });
}

/**
 * @description Search for a credentials that are going to expire and send a notification to the user
 * 
 * @param {Express.Request<{},requestData>} req
 * @param {Express.Response} res
 * @param {Function} next
 * 
 * @param {Function(object)} data - res.send response with all conciliaciones results
 * 
 * @returns {void}
 */
 exports.notifyPasswordExpiration = async function (req, res, next) {

    // Define main pipeline to search for almost expiring credentials
    let pipeline = [
        { $match: { expire: { $lte: moment().startOf('day').add(5,'days').toDate(), $gte: moment().startOf('day').subtract(1,'day').toDate() } } },
        { $unset: "password" }
    ];

    // Define promise array
    let promises = [];

    // Define insurance names
    let insuranceTypes = ['Qualitas','HDI','CHUBB','GMX'];

    // Excecute DB queries
    promises.push(CredencialQualitas.aggregate(pipeline));
    promises.push(CredencialHDI.aggregate(pipeline));
    promises.push(CredencialChubb.aggregate(pipeline));
    promises.push(CredencialGMX.aggregate(pipeline));

    // Wait for DataBase response
    Promise.all( promises ).then(
        async(expiringCredentials) => {
            // Define Object where the tenant notifications will be stored
            let tenantExpirations = {};
            // Map responses to add insurance type, add to a final array
            expiringCredentials = expiringCredentials.map( (insurance, index) => {
                insurance = insurance.map( cred => {
                    // Set insurance type to document
                    cred.type = insuranceTypes[index];
                    // Create register in the master Object if not exists (first element)
                    if ( !tenantExpirations[cred._tenant] )
                        tenantExpirations[cred._tenant] = [];
                    // Insert current credential expiration
                    tenantExpirations[cred._tenant].push( cred )
                    // Return modified item
                    return cred;
                })
                return insurance;
            });

            for( let tenantId in tenantExpirations ) {
                // Get users by tenant and permission
                let users = await common.getUserWithPermission('admin-notifications-expirepassword',tenantId);
                // Convert expirations to a string to send email
                let expirations = tenantExpirations[ tenantId ].map( el => {
                    return el.type + ' - Agente: ' + el.identifier + ' ('+ moment(el.expire).format('DD MMM YYYY') +')'
                }).join("<br/>");

                // Compose email object
                var expireEmail = {
                    subject: 'Expiración de credenciales KIYANA',
                    recipients: {},
                    template: 'protec-credentials-expire'
                }
                users.forEach( usr => {
                    expireEmail.recipients[usr.email] = {
                        'name': usr.firstname + ' ' + usr.lastname,
                        'expirations': expirations,
                    };
                });
                
                // Send notification email
                mailing.send(expireEmail, function (mailResult) {
                    // console.log('mail result', mailResult);
                });
                
            }

            
            res.send({
                data: Object.keys(tenantExpirations).length
            });

        }
    ).catch(
        err => {
            // Send error the responses to the client
            res.send({
                error: err
            })
        }
    )
    


   
}