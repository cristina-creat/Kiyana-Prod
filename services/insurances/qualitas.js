'use strict'
/** @module services/insurances/qualitas */

/**
 * @requires config - Require main config file
 * @requires fs - Require fs library
 * @requires _ - Require lodash library
 * @requires moment - Require moment library
 * 
 * @requires scrapper - Require qualitas scrapper service
 * @requires xlsxConciliacion - Require xlsx conxiliacion service to generate final result file
 * @requires mailing - Require mailing service to send final result
 * 
 * @requires User - Require User model to connect with database
 * @requires catalogModel {CredencialQualitas} - Require Catalog model to connect with database
 * @requires conciliacionModel { Sica, ConciliacionResult, QueueQuery, Conciliacion } - Require User model to connect with database
 * 
 */
const config = require('config');
const fs = require('fs');
const _ = require('lodash');
const moment = require('moment');

const scrapper = require('../scrappers/qualitas');
const xlsxConciliacion = require('../xlsx_conciliacion');
const mailing = require('../mailing');

const User = require('../../models/user');
const { CredencialQualitas } = require('../../models/catalog')
const { Sica, ConciliacionResult, QueueQuery, Conciliacion } = require('../../models/conciliacion');

/** Setup moment language */
moment.locale('es')

/**
 * @description This function takes one pending item in queue and proccess it
 *
 * 
 * @returns {Promise<Object>} - Should return a promise with the object of the queue status
 */
exports.processQueue = function () {
    /** Return a promise */
    return new Promise(async (resolve, reject) => {
        
        // Base timout response definition
        let timeoutData = {
            $set: {
                status: 'failed',
                extradata: {
                    status: 'failed',
                    message: 'Credentials not found'
                },
                finished_at: new Date
            }
        }

        // Remove items that are running for more than 5 minutes
        await QueueQuery.updateMany({ type: 'Qualitas', status: 'running', started_at: { $lte: moment().subtract(5, 'minutes') } }, timeoutData);
        
        // Get items currently running
        let inProccess = await QueueQuery.find({ status: 'running', type: 'Qualitas' });
        // Get items in queue 
        let pendiengItems = await QueueQuery.countDocuments({ status: 'pending', type: 'Qualitas' });

        // If already running items are more than permmited, finish this proccess
        if (inProccess && inProccess.length >= config.scrapper.service.qualitas.maxQueue) {
            resolve({
                inProccessItem: inProccess,
                remainItems: pendiengItems
            });
            return;
        }

        // Get queue list sort by creation date
        let queueItem = await QueueQuery.findOne({ status: 'pending', type: 'Qualitas' }).sort({ created_at: 1 });
        
        // If one element to proccess is available, setup pending lenght
        if (queueItem) {
            pendiengItems = pendiengItems - 1;
        } else {
            // If no items are pending to proccess, finish this proccess
            resolve({
                currentItem: null,
                result: null,
                remainItems: 0
            });
            return;
        }
        
        // Define result template object
        let result = {
            status: '',
            message: '',
            data: {}
        };

        // Just for log
        console.log('Se inicia el procesamiento de Qualitas');
        
        // Status 1 - Running proccess
        queueItem.activities.push({
            act: 'Proceso iniciado',
            status: true
        });

        // Get credentials of the current item
        let credential = await CredencialQualitas.findOne({ identifier: queueItem.identifier });

        // Finish proccess if no available credentials
        if (!credential) {

            // Status 2 - Buscar credenciales
            queueItem.activities.push({
                act: 'Agente asociado',
                status: false
            });

            // Finish if no credentials found
            result.status = 'failed';
            result.message = 'Credentials not found';
            queueItem.status = 'failed';
            queueItem.extradata = result;
            queueItem.save();

            resolve({
                currentItem: queueItem,
                result: result,
                remainItems: pendiengItems
            });
            return;
        }

        // Status 2 - Buscar credenciales
        queueItem.activities.push({
            act: 'Agente asociado',
            status: true
        });

        // Save item as current proccessing
        queueItem.started_at = new Date();
        queueItem.status = 'running';
        queueItem.save();

        // Get conciliacion by ID
        let conciliacion = await Conciliacion.findById(queueItem._conciliacion);
        
        // Finish proccess if no available conciliacion
        if (!conciliacion) {

            // Status 3 - Buscar conciliación asociadada
            queueItem.activities.push({
                act: 'Conciliación asociada',
                status: false
            });
            
            // Finish if no conciliación is available
            result.status = 'failed';
            result.message = 'Conciliacion not found';
            queueItem.status = 'failed';
            queueItem.extradata = result;
            queueItem.save();

            resolve({
                currentItem: queueItem,
                result: result,
                remainItems: pendiengItems
            });
            return;
        }

        // Status 3 - Buscar conciliación asociadada
        queueItem.activities.push({
            act: 'Conciliación asociada',
            status: true
        });

        // Setup initial excecution time
        queueItem.started_at = new Date;
        // Catch some error on scrapping
        try {
            // Success execution block
            // Excecute scrapping method fron library
            let scrapeResult = await scrapper.scrapeQualitas(conciliacion, credential );
            // Set as completed if await is success
            queueItem.status = 'completed';
            // Store log scrapping results
            queueItem.activities = queueItem.activities.concat( scrapeResult );
            // Setup finished date time
            queueItem.finished_at = new Date;
            // Save Queue item
            queueItem.save();
            // Finish proccess with object results
            resolve({
                conciliacion: conciliacion,
                currentItem: queueItem,
                result: {
                    status: queueItem.status,
                    message: '',
                    data: queueItem.activities
                },
                remainItems: pendiengItems
            });
        } catch (err) {
            // Catch any error on scrapping proccess
            // Store log proccess
            queueItem.activities = queueItem.activities.concat( err );
            result.status = 'failed';
            result.message = 'Scrape error';
            queueItem.status = 'failed';
            // Setup finished datetime
            queueItem.finished_at = new Date;
            // Save queue item
            queueItem.save();
            // Finish proccess with the result, maybe we should send a notificaion email
            resolve({
                currentItem: queueItem,
                result: result,
                remainItems: pendiengItems
            });
        }
        
    });

}

/**
 * @description This function takes one pending item in queue and proccess it
 *
 * @param {Object} cn - Conciliacion object wich should be proccessed
 * 
 * @returns {Object} - Should return a result object
 */
exports.doConciliacion = async function( cn ) {

    // Finish proccess if no param is received
    if ( !cn )
        return;

    // Get user from the DB
    let userData = await User.findById(cn._user);
    // Get SICA data from DB
    let sicaData = await Sica.findById(cn._sica);
    // Sort SICA data to be proccessed
    sicaData = proccessSicaData(sicaData);
    // Sort insurance data from files
    let insuranceData = proccessQualitasData(scrapper.readFilesQualitas(cn))
    // Match sica with insurance data
    let mergedData = mergeSicaInsurance( sicaData, insuranceData );
    // Set model object to store results
    let conciliacionResult = new ConciliacionResult({
        data: mergedData,
        _conciliacion: cn._id,
        _tenant: cn._tenant,
        filename: 'qualitas_export_' + moment().format('YYYY-MM-DD') + '_' + new Date().getTime() + '.xlsx'
    });

    // Define path to store results
    let basePath = './downloads/' + cn._id + '/';
    // Define local variable with filename
    let fileName = conciliacionResult.filename;

    // Create base folder if don't exists, it happens when 0 agents where success
    if (!fs.existsSync(basePath))
        fs.mkdirSync(basePath, { recursive: true });

    // Save conciliacion result
    await conciliacionResult.save();


    // Set conciliacion status to proccessed
    cn.status = 'proccessed';

    // Save conciliacion data
    await cn.save();

    // Define object for excel generation, the base is from the conciliacion result
    let mailData = _.cloneDeep(conciliacionResult.data).map(el => {

        // Define temporary object to sort data
        let tmpEl = {};
        tmpEl['moneda'] = (el.sica && el.sica['Moneda']) ? el.sica['Moneda'] : (el.insurance ? el.insurance['divida'] : '');
        tmpEl['cve_agente'] = (el.sica && el.sica['CAgente']) ? Number(el.sica['CAgente']) : (el.insurance) ? Number(el.insurance['agente']) : '';
        tmpEl['agente_desde'] = (el.sica && el.sica['FDesde']) ? el.sica['FDesde'] : '';
        tmpEl['agente_poliza'] = el.sica ? el.sica['Documento'] : '';
        tmpEl['agente_endoso'] = el.sica ? el.sica['Endoso'] : '';
        tmpEl['agente_periodo'] = el.sica ? el.sica['Periodo'] : '';
        tmpEl['agente_serie'] = el.sica ? el.sica['Serie'] : '';
        tmpEl['agente_importe'] = el.sica ? el.sica['PrimaNeta'] : 0;
        tmpEl['agente_comisiones'] = el.sica ? el.sica['total'] : 0;
        tmpEl['ins_poliza'] = el.insurance ? el.insurance['poliza'] : '';
        tmpEl['ins_endoso'] = el.insurance ? el.insurance['endoso'] : '';
        tmpEl['ins_periodo'] = el.insurance ? el.insurance['serie'] : '';
        tmpEl['ins_importe'] = el.insurance ? el.insurance['totalImporte'] : 0;
        tmpEl['ins_comisiones'] = el.insurance ? el.insurance['totalComisiones'] : 0;
        tmpEl['ins_fechas'] = el.insurance ? el.insurance['periodo'] : 'N/A';
        tmpEl['status'] = el.status;
        tmpEl['dif_importe'] = tmpEl['ins_importe'] - tmpEl['agente_importe'];
        tmpEl['dif_comisiones'] = tmpEl['ins_comisiones'] - tmpEl['agente_comisiones'];
        // Return temporary objecto
        return tmpEl;
    });

    // Define columns for the report heading
    let columns = [
        {
            header: "Moneda",
            key: 'moneda',
            width: 10
        },
        {
            header: "Agente",
            key: 'cve_agente',
            width: 10
        },
        {
            header: "Póliza	",
            key: 'agente_poliza',
            width: 13
        },
        {
            header: "Endoso Estado de Cuenta",
            key: 'ins_endoso',
            width: 12
        },
        {
            header: "Endoso Agente",
            key: 'agente_endoso',
            width: 12
        },
        {
            header: "Inicio Vigencia Recibo",
            key: 'agente_desde',
            width: 14
        },
        {
            header: "Serie del Recibo",
            key: 'agente_serie',
            width: 10
        },
        {
            header: "Periodo del Recibo",
            key: 'agente_periodo',
            width: 10
        },
        {
            header: "Prima Estado de Cuenta",
            key: 'agente_importe',
            width: 13
        },
        {
            header: "Prima del Agente",
            key: 'ins_importe',
            width: 14
        },
        {
            header: "Diferencia de Prima",
            key: 'dif_importe',
            width: 14
        },
        {
            header: "Comisión Estado de Cuenta",
            key: 'ins_comisiones',
            width: 16
        },
        {
            header: "Comisión Agente",
            key: 'agente_comisiones',
            width: 16
        },
        {
            header: "Diferencia Comisión",
            key: 'dif_comisiones',
            width: 12
        },
        {
            header: "Estatus",
            key: 'status',
            width: 18
        },
        {
            header: "Periodo",
            key: 'ins_fechas',
            width: 38
        }
    ];

    // Get periodos from the layout data to setup in the excel titles
    let periodos = mailData.map(el => el.ins_fechas);
    // Get unique elements (do not repeat)
    periodos = _.uniq(periodos);
    // If some period is not available, remove it, and convert to a readeable string
    periodos = periodos.filter(el => el != 'N/A').map(el => el.replace('PERIODO DEL ', ''));
    // Sort periodos asc
    periodos = _.sortBy(periodos);
    // Setup creation date for the xlsx results
    let fecha = moment(conciliacionResult.created_at).format("dddd, MMMM DD YYYY, hh:mm:ss a");
    // Capitalize date format
    fecha = fecha.charAt(0).toUpperCase() + fecha.slice(1);

    // Define excel titles
    let titles = {
        aseguradora: 'Aseguradora: Qualitas Periodos conciliados: ' + periodos.join(', '),
        empresa: 'Sistema de conciliaciones de Creatsol',
        usuario: userData.firstname + ' ' + userData.lastname,
        fecha: fecha
    }

    // Generate excel from the service
    xlsxConciliacion.exportQualitasExcel(mailData, basePath + fileName, columns, titles);



    // Define email props
    var options = {
        subject: 'Conciliación completada',
        recipients: {},
        template: 'protec-conciliacion-finish',
        attachment: [basePath + fileName]
    }
    // Define email variables for current user
    options.recipients[userData.email] = {
        'id': cn._id,
        'name': userData.firstname + ' ' + userData.lastname
    };

    // Set some timeout while xlsx is generated
    setTimeout(() => {
        // Send email
        mailing.send(options, function (mailResult) {});
    }, 5000)
    
    // Return merged data (sica and insurance)
    return mergedData;
}


/**
 * @description This function receives SICA data and generate a sorted data to match with the insurance (each item should include 2 keys to make the match)
 *
 * @param {Object} sicaData - SICA Data as was stored in the database
 * 
 * @returns {Array} - Should return an array of sorted items
 */
const proccessSicaData = function (sicaData) {
    // If no data, return empty array
    if (!sicaData || !sicaData.data || !sicaData.data.length) {
        return [];
    }
    // Define initial object
    let proccessed = {};
    // Walk each item fron the sica data
    sicaData.data.forEach(item => {
        // Primary Index KEY for this insurance is -> Documento + Endoso + Serie
        let docKey = normalizePoliza(item.Documento) + '-' + nomalizeEndoso(item.Endoso) + '-' + nomalizeSerie(item.Serie);
        // Secondary Index KEY for this insurance is -> Documento + Serie
        let secondKey = normalizePoliza(item.Documento) + '-' + nomalizeSerie(item.Serie) + '-';
        
        // If no primary key exists in the results, create it
        // This works to group items
        if (!proccessed[docKey]) {
            proccessed[docKey] = {
                docKey: docKey,
                secondKey: secondKey,
                FDesde: item.FDesde,
                Moneda: item.Moneda,
                NombreGerencia: item.NombreGerencia,
                CiaAbreviacion: item.CiaAbreviacion,
                CAgente: item.CAgente,
                EjecutNombre: item.EjecutNombre,
                NombreCompleto: item.NombreCompleto,
                Documento: item.Documento,
                Endoso: item.Endoso,
                Periodo: item.Periodo,
                Serie: item.Serie,
                PrimaNeta: item.PrimaNeta,
                total: 0,
                items: []
            };
        }
        // Insert current row into defined DocKey
        proccessed[docKey].items.push({
            FStatus: item.FStatus,
            Status_TXT: item.Status_TXT,
            Serie: item.Serie,
            TCPagoF: item.TCPagoF,
            TCom: item.TCom,
            ImportePend_MXN: item.ImportePend_MXN,
            ImportePendXMon: item.ImportePendXMon,
            Nliquidacion: item.Nliquidacion
        });
        // For SICA, commisiones are stored in 'total' prop, and are accumulative
        proccessed[docKey].total = Number(proccessed[docKey].total) + Number(item.ImportePendXMon);
        // Setup Number decimal size
        proccessed[docKey].total = Number(proccessed[docKey].total.toFixed(2));
    })

    // Return grouped values
    return Object.values(proccessed);
}

/**
 * @description This function receives INSURANCE data and generate a sorted data to match with the SICA data (each item should include 2 keys to make the match)
 *
 * @param {Array} insuranceData - INSURANCE Data from the scrapped files, already files converted to json
 * 
 * @returns {Array} - Should return an array of sorted items
 */
function proccessQualitasData(qData) {

    // If no data, return empty array
    if (!qData || !qData.length) {
        return [];
    }


    let proccessed = {};
    // Walk each item ( each agent )
    qData.forEach(file => {
        // Walk each file
        file.forEach(item => {
            // PRIMARY Index KEY is poliza + endoso + serie, the same as SICA
            let docKey = item.poliza + '-' + nomalizeEndoso(item.endoso) + '-' + nomalizeSerie(item.serie);
            // SECONDARY Index KEY is poliza + serie, the same as SICA
            let secondKey = item.poliza + '-' + nomalizeSerie(item.serie) + '-';

            // CUANDO LA POLIZA ES 00000, EL ENDOSO ES 0, Y NO TIENE SERIE, se requiere crear un docKey nuevo para no agrupar estos registros
            // Este docKey no se encontrará en SICA y por default tendrá el valor de "No encontrado en agente"
            if (docKey == '0000000000-0-N/A') {
                docKey = item.poliza + '-' + nomalizeEndoso(item.endoso) + '-' + nomalizeSerie(item.serie) + '-' + item.agente + '-' + item.periodo;
            }

            // Create default item if not exists
            if (!proccessed[docKey]) {
                proccessed[docKey] = {
                    docKey: docKey,
                    secondKey: secondKey,
                    dia: item.dia,
                    poliza: item.poliza,
                    endoso: item.endoso,
                    recibo: item.recibo,
                    serie: item.serie,
                    remesa: item.remesa,
                    cve: item.cve,
                    concepto: item.concepto,
                    totalImporte: 0,
                    totalComisiones: 0,
                    periodo: item.periodo,
                    agente: item.agente,
                    items: []
                };
            }
            // Insert current row into defined DocKey
            proccessed[docKey].items.push({
                importe: item.importe,
                comis: item.comis,
                iva_pag: item.iva_pag,
                isr_r: item.isr_r,
                iva_r: item.iva_r,
                cargo: item.cargo,
                abono: item.abono,
            });

            
            // For Qualitas, the "importe" is accumulative
            proccessed[docKey].totalImporte = Number(proccessed[docKey].totalImporte) + Number(item.importe);
            proccessed[docKey].totalImporte = Number(proccessed[docKey].totalImporte.toFixed(2));
            // For Qualitas, the comision is accumulative
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones) + Number(item.comis);
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones.toFixed(2));

        });
    })

    // Return values
    return Object.values(proccessed);
}

const mergeSicaInsurance = function( sicaData, insuranceData ) {
    // Now merge data (sica with insurance)
    // Start with SICA
    let newData = [];
    let secondData = [];
    
    sicaData.forEach(s => {
        delete s['items'];
        newData.push( { sica: s } );
    })

    
    if (!Array.isArray(insuranceData))
        insuranceData = [];
    // Continue with Insurance
    insuranceData.forEach(s => {
        delete s['items'];
        // Find by docKeys, insert or update
        // Valida tener igual el primer docKey (poliza+endoso+periodo) ó tener el segundo docKey (poliza+periodo) e igual importe
        let indexKey = newData.findIndex( el => el.sica.docKey == s.docKey || (el.sica.secondKey == s.secondKey && differenceIsTolerable(s.totalComisiones, el.sica.total, 2) ) )
        if (indexKey !== -1 ) {
            newData[indexKey].insurance = s;
        } else {
            secondData.push( { insurance: s } );
        }
    });

    newData = newData.concat( secondData );
    
    // Compare items
    newData.forEach( (item,s) => {

        let divisa = 'MXN';
        if ( (newData[s].sica && newData[s].sica.Moneda && newData[s].sica.Moneda.toLowerCase().includes('dólar')) ) {
            divisa = 'USD';
        }
        if (newData[s].sica && newData[s].insurance) {
            // Los importes son iguales en ambos registros o tienen una tolerancia del 2%
            if (newData[s].insurance.totalComisiones == newData[s].sica.total || differenceIsTolerable(newData[s].insurance.totalComisiones, newData[s].sica.total, 2)) {
                newData[s].status = 'Importe Correcto ' + divisa;
            } else {
                // Los importes son diferentes
                newData[s].status = 'Importes Incorrectos ' + divisa;
            }
            // El endoso es diferente, no se validan montos
            if ( nomalizeEndoso(newData[s].insurance.endoso) != nomalizeEndoso(newData[s].sica.Endoso) ) {
                newData[s].status = 'Diferente endoso ' + divisa;
            }
        } else {
            // No se encontró en el reporte sica
            if (!newData[s].sica) {
                newData[s].status = 'No encontrado en el agente ' + divisa;
            }
            // No se encontró en el estado de cuenta
            if (!newData[s].insurance) {
                newData[s].status = 'No encontrado en la aseguradora ' + divisa;
            }
        }
    });

    return newData;
}


// Normalize serie or periodo
function nomalizeSerie(serie) {
    serie = String(serie);
    serie = serie.split('/');
    serie = serie.map(el => Number(el));
    return (serie.length && serie[0]) ? serie[0] : 'N/A';
}

// Normalize poliza
function normalizePoliza(poliza) {
    if (poliza) {
        let poliza_array = String(poliza).split('-');
        if ( poliza_array.length > 1 ) {
            return poliza_array[1];
        }
    }
    return poliza;
}
// Normalize endoso
function nomalizeEndoso(endoso) {
    if (endoso) {
        /*
        let endoso_array = String(endoso).split('-');
        if ( isNaN( Number(endoso_array.pop()) ) ) {
            endoso = endoso_array.pop();    
        } else {
            endoso = Number(endoso_array.pop());
        }*/
    } else {
        endoso = 0;
    }   
    return endoso;
}

// Function that validates 2 numbers with some percent tolerance
function differenceIsTolerable(a, b, percent) {
    // Get difference between 2 numbers
    let diff = Math.abs(a - b);
    // Convert difference to percent, depending wich number is bigger
    let diffPercent = (a > b) ? ((100 / a) * diff) : ((100 / b) * diff);

    return Math.abs(diffPercent) <= percent;

}


-8.6 -136.29