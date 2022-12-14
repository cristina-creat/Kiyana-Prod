'use strict'

var config = require('config');

var fs = require('fs');
var _ = require('lodash');
var moment = require('moment');
moment.locale('es')

const common = require('../common');
const scrapper = require('../scrappers/chubb');
var xlsxConciliacion = require('../xlsx_conciliacion');
var mailing = require('../mailing');
const utils = require('../utils');

const User = require('../../models/user');
const { Sica, ConciliacionResult, QueueQuery, Conciliacion } = require('../../models/conciliacion');
const { CredencialChubb } = require('../../models/catalog')

/*
*
*   CHUBB
*
*/
// Function that take one element from the proccess que and execute it
exports.proccessQueue = function () {
    return new Promise(async (resolve, reject) => {
        // Remove running items with more than 5 minutes
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
        await QueueQuery.updateMany({ type: 'Chubb', status: 'running', started_at: { $lte: moment().subtract(5, 'minutes') } }, timeoutData);

        // Find current excecuting items
        let inProccess = await QueueQuery.find({ status: 'running', type: 'Chubb' });
        let pendiengItems = await QueueQuery.countDocuments({ status: 'pending', type: 'Chubb' });

        // If current item running, then return
        if (inProccess && inProccess.length >= config.scrapper.service.chubb.maxQueue) {
            resolve({
                inProccessItem: inProccess,
                remainItems: pendiengItems
            });
            return;
        }

        // Get next element to proccess
        let queueItem = await QueueQuery.findOne({ status: 'pending', type: 'Chubb' }).sort({ created_at: 1 });
        // If one element to proccess is available, redefine list onf pending elements
        if (queueItem) {
            pendiengItems = pendiengItems - 1;
        } else {
            // If no available elements
            resolve({
                currentItem: null,
                result: null,
                remainItems: 0
            });
            return;
        }
        // Define result object result
        let result = {
            status: '',
            message: '',
            data: {}
        };

        // Get credentials of the current item
        let credential = await CredencialChubb.findOne({ identifier: queueItem.identifier });
        
        console.log('Se inicia el procesamiento de CHUBB');

        // Status 1 - Running proccess
        queueItem.activities.push({
            act: 'Proceso iniciado',
            status: true
        });
        
        
        // Finish proccess if no available credentials
        if (!credential) {

            // Status 2 - Buscar credenciales
            queueItem.activities.push({
                act: 'Agente asociado',
                status: false
            });

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
        // Uncomment this when testing is finished
        queueItem.started_at = new Date();
        queueItem.status = 'running';
        queueItem.save();

        let conciliacion = await Conciliacion.findById(queueItem._conciliacion);
        // Finish proccess if no available conciliacion
        if (!conciliacion) {

            // Status 3 - Buscar conciliación asociadada
            queueItem.activities.push({
                act: 'Conciliación asociada',
                status: false
            });

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

        // Define initial excecution time
        queueItem.started_at = new Date;
        try {
            // Success execution block
            let scrapeResult = await scrapper.scraperChubb(conciliacion, credential);
            queueItem.status = 'completed';
            
            queueItem.activities = queueItem.activities.concat( scrapeResult );

            queueItem.finished_at = new Date;
            queueItem.save();

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
            queueItem.activities = queueItem.activities.concat( err );

            // Error execution block
            result.status = 'failed';
            result.message = 'Scrape error';
            queueItem.status = 'failed';
            queueItem.finished_at = new Date;
            queueItem.save();

            resolve({
                currentItem: queueItem,
                result: result,
                remainItems: pendiengItems
            });
        }
        
    });
}



exports.doConciliacion = async function( cn ) {
    // Get User data from DB
    let userDataCHUBB = await User.findById(cn._user);
    // Get SICA data from DB
    let sicaDataCHUBB = await Sica.findById(cn._sica);
    // Sort SICA data to be proccessed
    sicaDataCHUBB = proccessSicaData(sicaDataCHUBB);
    
    let insuranceDataCHUBB = proccessCHUBBsData(readFilesChubb(cn));

    
    let mergedData = mergeSicaInsurance( sicaDataCHUBB, insuranceDataCHUBB );

    
    let conciliacionResultCHUBB = new ConciliacionResult({
        data: mergedData,
        _conciliacion: cn._id,
        _tenant: cn._tenant,
        filename: 'chubb_export_' + moment().format('YYYY-MM-DD') + '_' + new Date().getTime() + '.xlsx'
    });

    let basePathCHUBB = './downloads/' + cn._id + '/';
    let fileNameCHUBB = conciliacionResultCHUBB.filename;

    // Prevent if folder don't exists, it happens when 0 agents where success
    if (!fs.existsSync(basePathCHUBB))
        fs.mkdirSync(basePathCHUBB, { recursive: true });

    // Uncomment this line
    await conciliacionResultCHUBB.save();



    cn.status = 'proccessed';

    // Uncomment this for product
    await cn.save();


    let mailDataCHUBB = _.cloneDeep(conciliacionResultCHUBB.data).map(el => {



        let tmpEl = {};
        tmpEl['moneda'] = (el.sica && el.sica['Moneda']) ? el.sica['Moneda'] : (el.insurance ? el.insurance['divisa'] : '');
        tmpEl['cve_agente'] = (el.sica && el.sica['CAgente']) ? Number(el.sica['CAgente']) : (el.insurance) ? Number(el.insurance['agente']) : '';
        tmpEl['agente_desde'] = (el.sica && el.sica['FDesde']) ? el.sica['FDesde'] : '';
        tmpEl['agente_poliza'] = (el.sica && el.sica['Documento']) ? el.sica['Documento'] : (el.insurance && el.insurance['poliza'] ? el.insurance['poliza'] : '');
        tmpEl['agente_endoso'] = el.sica ? el.sica['Endoso'] : '';
        tmpEl['agente_periodo'] = el.sica ? el.sica['Periodo'] : '';
        tmpEl['agente_serie'] = el.sica ? el.sica['Serie'] : '';
        tmpEl['agente_importe'] = el.sica ? el.sica['PrimaNeta'] : 0;
        tmpEl['agente_comisiones'] = el.sica ? el.sica['total'] : 0;
        tmpEl['ins_poliza'] = (el.insurance && el.insurance['poliza']) ? el.insurance['poliza'] : '';
        tmpEl['ins_endoso'] = el.insurance ? el.insurance['endoso'] : '';
        tmpEl['ins_periodo'] = el.insurance ? el.insurance['serie'] : '';
        tmpEl['ins_importe'] = el.insurance ? el.insurance['totalImporte'] : 0;
        tmpEl['ins_comisiones'] = el.insurance ? el.insurance['totalComisiones'] : 0;
        tmpEl['ins_fechas'] = el.insurance ? el.insurance['periodo'] : 'N/A';
        tmpEl['status'] = el.status;
        tmpEl['dif_importe'] = tmpEl['ins_importe'] - tmpEl['agente_importe'];
        tmpEl['dif_comisiones'] = tmpEl['ins_comisiones'] - tmpEl['agente_comisiones'];

        return tmpEl;
        //return el;
    });

    let columnsCHUBB = [
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

    let periodosCHUBB = mailDataCHUBB.map(el => el.ins_fechas);
    
    periodosCHUBB = _.uniq(periodosCHUBB);
    periodosCHUBB = periodosCHUBB.filter(el => el != 'N/A').map(el => el.replace('PERIODO DEL ', ''));
    periodosCHUBB = _.sortBy(periodosCHUBB);

    
    let fechaCHUBB = moment(conciliacionResultCHUBB.created_at).format("dddd, MMMM DD YYYY, hh:mm:ss a");
    fechaCHUBB = fechaCHUBB.charAt(0).toUpperCase() + fechaCHUBB.slice(1);


    let titlesCHUBB = {
        aseguradora: 'Aseguradora: CHUBB Periodos conciliados: ' + periodosCHUBB.join(', '),
        empresa: 'Sistema de conciliaciones de Creatsol',
        usuario: userDataCHUBB.firstname + ' ' + userDataCHUBB.lastname,
        fecha: fechaCHUBB
    }

    

    xlsxConciliacion.exportQualitasExcel(mailDataCHUBB, basePathCHUBB + fileNameCHUBB, columnsCHUBB, titlesCHUBB);



    // Send mail
    var optionsCHUBB = {
        subject: 'Conciliación completada',
        recipients: {},
        template: 'protec-conciliacion-finish',
        attachment: [basePathCHUBB + fileNameCHUBB]
    }
    optionsCHUBB.recipients[userDataCHUBB.email] = {
        'id': cn._id,
        'name': userDataCHUBB.firstname + ' ' + userDataCHUBB.lastname
    };

    // Set timeout while saving file
    setTimeout(() => {
        // Uncomment in prod version
        mailing.send(optionsCHUBB, function (mailResult) {
            console.log('mail result', mailResult);
        });
    }, 5000)

    return mergedData;
    
}

// Read XLS files and return as JSON
const readFilesChubb = function (conciliacion) {
    let fileName = 'archivo.xls';
    let mainData = [];
    let cn = conciliacion;
    cn.agents.forEach(ag => {
        if (fs.existsSync('./downloads/' + cn._id + '/' + ag)) {
            fs.readdirSync('./downloads/' + cn._id + '/' + ag).forEach(period_folder => {
                
                // Read priod folder
                
                if ( moment( period_folder, 'YYYY-MM-DD', true ).isValid() ) {
                    
                    // Read excel file
                    let fileData = utils.importExcelFileAsArray('./downloads/' + cn._id + '/' + ag + '/' + period_folder + '/' + fileName);
                    

                    let periodo = period_folder;
                    
                    // Remove first titles line
                    fileData.shift();

                    fileData.unshift(['TipoMov','AgenteId','AseguradoId','ramo','dia','ClaveId','poliza','endoso','recibo','serie','IncisoId','importe','comis','ComisionSobreRecargoMto','Comision2','iva_r','concepto','Ramo','Concepto','Descripcion','Observacion','TmpObsDes','Fecha2']);
                    
                    fileData = utils.arrayToObject(fileData);
                    // Cast to numbers
                    fileData = fileData.map(el => {
                        el.importe = Number(String(el.importe).replace(/,/g, '')) || 0;
                        el.comis = Number(String(el.comis).replace(/,/g, '')) || 0;
                        el.ComisionSobreRecargoMto = Number(String(el.ComisionSobreRecargoMto).replace(/,/g, '')) || 0;
                        el.Comision2 = Number(String(el.Comision2).replace(/,/g, '')) || 0;
                        el.iva_r = Number(String(el.iva_r).replace(/,/g, '')) || 0;
                        el.agente = ag;
                        el.periodo = periodo;
                        return el;
                    });
                    mainData.push(fileData);
                }

            });
        }
    });
    return mainData;
}

// Function that converts SICA data to a merged document
const proccessSicaData = function (sicaData) {

    // If no data, return empty objetc
    if (!sicaData || !sicaData.data || !sicaData.data.length) {
        return {};
    }
    let proccessed = {};
    sicaData.data.forEach(item => {
        // Index KEY is Documento + Endoso + Periodo (Sica incluye el periodo dentro de la serie)
        let docKey = normalizePoliza(item.Documento) + '-' + nomalizeEndoso(item.Endoso) + '-' + nomalizeSerie(item.Serie);
        let secondKey = normalizePoliza(item.Documento) + '-' + nomalizeSerie(item.Serie) + '-';

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
        proccessed[docKey].total = Number(proccessed[docKey].total) + Number(item.ImportePend_MXN); // En el agente SIEMPRE el importe viene en MXN por eso se suma en MXN
        proccessed[docKey].total = Number(proccessed[docKey].total.toFixed(2));
    })

    return Object.values(proccessed);
}

// Function that converts HDI data to a merged document
const proccessCHUBBsData = function (qData) {

    // If no data, return empty objetc
    if (!qData || !qData.length) {
        return {};
    }


    let proccessed = {};
    // Walk each item
    qData.forEach(file => {
        // Walk each file
        file.forEach(item => {
            // Index KEY is ClaveId + poliza + endoso + periodo (En CHUBB el periodo viene en el campo recibo)
            let docKey = normalizeClaveId( item.ClaveId ) + normalizePoliza(item.poliza) + '-' + nomalizeEndoso(item.endoso) + '-' + item.recibo;
            let secondKey = normalizeClaveId( item.ClaveId ) + normalizePoliza(item.poliza) + '-' + item.recibo + '-';


            // Aquí se debería omitir el item que viene nulo

            // Todos los items SIN número de póliza son agrupados con la clave 'N/A-0N/A'
            /*
            // CUANDO LA POLIZA ES undefined, EL ENDOSO ES 0, Y NO TIENE SERIE, se requiere crear un docKey nuevo para no agrupar estos registros
            // Este docKey no se encontrará en SICAS y por default tendrá el valor de "No encontrado en agente"
            if (docKey == 'N/A-0-N/A') {
                docKey = '0-' + nomalizeEndoso(item.endoso) + '-' + nomalizeSerie(item.serie) + '-' + item.agente + '-' + item.dia;
                // console.log( 'suma: ' + Number(item.comis) );
                // console.log( docKey )
            }
            */

            // Create key if not exists
            if (!proccessed[docKey]) {
                proccessed[docKey] = {
                    docKey: docKey,
                    secondKey: secondKey,
                    divisa: item.divisa,
                    dia: item.dia,
                    poliza: normalizeClaveId( item.ClaveId ) + ( item.poliza ? item.poliza : ''),
                    endoso: item.endoso,
                    recibo: item.recibo,
                    serie: item.serie,
                    concepto: item.concepto,
                    totalImporte: 0,
                    totalComisiones: 0,
                    agente: item.agente,
                    ramo: item.ramo,
                    periodo: item.periodo,
                    items: []
                };
            }

            // Create register per item
            proccessed[docKey].items.push({
                importe: item.importe,
                comis: item.comis,
                ComisionSobreRecargoMto: item.ComisionSobreRecargoMto,
                Comision2: item.Comision2
            });

          
            // For CHUBB, the "importe" is accumulative
            proccessed[docKey].totalImporte = Number(proccessed[docKey].totalImporte) + Number(item.importe);
            proccessed[docKey].totalImporte = Number(proccessed[docKey].totalImporte.toFixed(2));
            // For CHUBB, the comision is accumulative
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones) + Number(item.comis) + Number(item.ComisionSobreRecargoMto) + Number(item.Comision2);
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones.toFixed(2));

        });
    })

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
    // Continue with Insurance
    if ( !Array.isArray(insuranceData) ) {
        insuranceData = [];
    }
    insuranceData = insuranceData.filter( el => el.docKey != 'N/A-0-N/A')
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
            divisa = 'USD a MXN';
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
    /*
    // Find data inside SICA and Insurance
    Object.keys(newData).forEach(s => {

        

        newData[s].poliza = s;
        // Hay registro SICA y de seguro
        if (newData[s].sica && newData[s].insurance) {
            // Los importes son iguales en ambos registros o tienen una tolerancia del 2%
            if (newData[s].insurance.totalComisiones == newData[s].sica.total || differenceIsTolerable(newData[s].insurance.totalComisiones, newData[s].sica.total, 2)) {
                newData[s].status = 'Importe Correcto ' + divisa;
            } else {
                // Los importes son diferentes
                newData[s].status = 'Importes Incorrectos ' + divisa;
            }
            // El endoso es diferente, no se validan montos
            if (!newData[s].sica.Endoso)
                newData[s].sica.Endoso = '';
            if (!newData[s].insurance.endoso)
                newData[s].insurance.endoso = '';
            if (newData[s].insurance.endoso != newData[s].sica.Endoso && Number(newData[s].insurance.endoso) != Number(newData[s].sica.Endoso)) {
                newData[s].status = 'Diferente endoso ' + divisa;
            }
            // No hay registro sica o de seguro
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
    */
}

// Normalize ClaveId
const normalizeClaveId = function( claveId ) {
    if ( !claveId )
        return '';
    claveId = String(claveId).trim();
    if ( claveId.length )
        claveId = claveId + ' ';
    return claveId;
}

// Normalize serie or periodo
const nomalizeSerie = function(serie) {
    serie = String(serie);
    serie = serie.split('/');
    serie = serie.map(el => Number(el));
    return (serie.length && serie[0]) ? serie[0] : 'N/A';
}

// Normalize poliza
const normalizePoliza = function(poliza) {
    if ( !poliza )
        return 'N/A';
    return poliza;
}
// Normalize endoso
const nomalizeEndoso = function(endoso) {
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