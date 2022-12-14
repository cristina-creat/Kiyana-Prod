'use strict'

var config = require('config');

var fs = require('fs');
var _ = require('lodash');
var moment = require('moment');
moment.locale('es')

const common = require('../common');
const scrapper = require('../scrappers/hdi');
var xlsxConciliacion = require('../xlsx_conciliacion');
var mailing = require('../mailing');
const utils = require('../utils');

const User = require('../../models/user');
const { Sica, ConciliacionResult, QueueQuery, Conciliacion } = require('../../models/conciliacion');
const { CredencialHDI } = require('../../models/catalog');


// Function that take one element from the proccess que and execute it
exports.processQueue = function () {
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
        await QueueQuery.updateMany({ type: 'HDI', status: 'running', started_at: { $lte: moment().subtract(5, 'minutes') } }, timeoutData);

        // Find current excecuting items
        let inProccess = await QueueQuery.find({ status: 'running', type: 'HDI' });
        let pendiengItems = await QueueQuery.countDocuments({ status: 'pending', type: 'HDI' });

        // If current item running, then return
        if (inProccess && inProccess.length >= config.scrapper.service.hdi.maxQueue) {
            // if ( true ) {
            resolve({
                inProccessItem: inProccess,
                remainItems: pendiengItems
            });
            return;
        }

        // Get next element to proccess
        let queueItem = await QueueQuery.findOne({ status: 'pending', type: 'HDI' }).sort({ created_at: 1 });
        
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
        let credential = await CredencialHDI.findOne({ identifier: queueItem.identifier });

        console.log('Se inicia el procesamiento de HDI');

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
            let scrapeResult = await scrapper.scrapeHDI(conciliacion, credential)
            
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
    let userDataHDI = await User.findById(cn._user);
    // Get SICA data from DB
    let sicaDataHDI = await Sica.findById(cn._sica);
    // Sort SICA data to be proccessed
    sicaDataHDI = proccessSicaData(sicaDataHDI);
    
    let insuranceDataHDI = proccessHDIsData(readFilesHdi(cn));
    
    let mergedData = mergeSicaInsurance( sicaDataHDI, insuranceDataHDI );

    
    let conciliacionResultHdi = new ConciliacionResult({
        data: Object.values(mergedData),
        _conciliacion: cn._id,
        _tenant: cn._tenant,
        filename: 'hdi_export_' + moment().format('YYYY-MM-DD') + '_' + new Date().getTime() + '.xlsx'
        //filename: 'demo.xlsx'
    });

    let basePathHdi = './downloads/' + cn._id + '/';
    

    // Prevent if folder don't exists, it happens when 0 agents where success
    if (!fs.existsSync(basePathHdi))
        fs.mkdirSync(basePathHdi, { recursive: true });
        
    let fileNameHdi = conciliacionResultHdi.filename;

    // Uncomment this line
    await conciliacionResultHdi.save();



    cn.status = 'proccessed';

    // Uncomment this for product
    await cn.save();


    let mailDataHdi = _.cloneDeep(conciliacionResultHdi.data).map(el => {



        let tmpEl = {};
        tmpEl['moneda'] = (el.sica && el.sica['Moneda']) ? el.sica['Moneda'] : (el.insurance ? el.insurance['divisa'] : '');
        tmpEl['cve_agente'] = (el.sica && el.sica['CAgente']) ? Number(el.sica['CAgente']) : Number(el.insurance['agente']);
        tmpEl['agente_desde'] = (el.sica && el.sica['FDesde']) ? el.sica['FDesde'] : '';
        tmpEl['agente_poliza'] = (el.sica && el.sica['Documento']) ? el.sica['Documento'] : (el.insurance ? el.insurance['poliza'] : '');
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

        return tmpEl;
        //return el;
    });

    let columnsHdi = [
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

    let periodosHdi = mailDataHdi.map(el => el.ins_fechas);
    
    periodosHdi = _.uniq(periodosHdi);
    periodosHdi = _.sortBy(periodosHdi);

    
    let fechaHdi = moment(conciliacionResultHdi.created_at).format("dddd, MMMM DD YYYY, hh:mm:ss a");
    fechaHdi = fechaHdi.charAt(0).toUpperCase() + fechaHdi.slice(1);


    let titlesHdi = {
        aseguradora: 'Aseguradora: HDI Periodos conciliados: ' + periodosHdi.join(', '),
        empresa: 'Sistema de conciliaciones de Creatsol',
        usuario: userDataHDI.firstname + ' ' + userDataHDI.lastname,
        fecha: fechaHdi
    }

    

    xlsxConciliacion.exportQualitasExcel(mailDataHdi, basePathHdi + fileNameHdi, columnsHdi, titlesHdi);



    // Send mail
    var optionsHdi = {
        subject: 'Conciliación completada',
        recipients: {},
        template: 'protec-conciliacion-finish',
        attachment: [basePathHdi + fileNameHdi]
    }
    optionsHdi.recipients[userDataHDI.email] = {
        'id': cn._id,
        'name': userDataHDI.firstname + ' ' + userDataHDI.lastname
    };

    // Set timeout while saving file
    setTimeout(() => {
        // Uncomment in prod version
        
        mailing.send(optionsHdi, function (mailResult) {
            console.log('mail result', mailResult);
        });

    }, 5000)


    return mergedData;
}


// Read XLS files and return as JSON
const readFilesHdi = function (conciliacion) {
    let mainData = [];
    let cn = conciliacion;
    cn.agents.forEach(ag => {
        if (fs.existsSync('./downloads/' + cn._id + '/' + ag)) {
            fs.readdirSync('./downloads/' + cn._id + '/' + ag).forEach(file => {
                if ( file.includes('.xlsx') ) {
                    // Read excel file
                    let fileData = utils.importExcelFileAsArray('./downloads/' + cn._id + '/' + ag + '/' + file);

                    fileData.unshift(['divisa','fecha','ramo','poliza','certificado','endoso','recibo','serie','concepto','base_comision','extra_comision','cesion_comision','modulo_comision','cargo','abono']);

                    fileData = utils.arrayToObject(fileData);
                    
                    // Cast to numbers
                    fileData = fileData.map(el => {
                        if (el.base_comision)
                            el.base_comision = Number(String(el.base_comision).replace(/,/g, ''));
                        if (el.cargo)
                            el.cargo = Number(String(el.cargo).replace(/,/g, ''));
                        if (el.abono)
                            el.abono = Number(String(el.abono).replace(/,/g, ''));
                        el.agente = ag;
                        el.periodo = 'Semana ' + Math.ceil( moment(el.fecha,'DD/MM/YYYY').date()/7 );
                        /*
                        // Agregar IVA cuando la divisa es Dólar y tiene una póliza asignada
                        if ( el.divisa == 'Dólares' && el.poliza ) {
                            el.abono = Number((el.abono * config.scrapper.service.hdi.iva).toFixed(2));
                        }
                        */
                        if ( el.periodo == 'Semana 5' ) {
                            el.periodo = 'Semana 4';
                        }
                        //el.periodo = 'N/A';
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
        // Index KEY is Documento + Endoso + Periodo <- En SICA el periodo viene en el primer bloque de la serie
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
        proccessed[docKey].total = Number(proccessed[docKey].total) + Number(item.ImportePendXMon);
        proccessed[docKey].total = Number(proccessed[docKey].total.toFixed(2));
    })

    return Object.values(proccessed);
}

// Function that converts HDI data to a merged document
const proccessHDIsData = function (qData) {

    // If no data, return empty objetc
    if (!qData || !qData.length) {
        return {};
    }

    let proccessed = {};
    // Walk each item
    qData.forEach(file => {
        // Test remove lines with "Microsot" text
        file = file.filter( it => it.cargo || it.abono || it.fecha );

        // Walk each file
        file.forEach(item => {
            // Index KEY is poliza + certificado + endoso + periodo <- En HDI el periodo viene en el primer bloque de la serie
            let docKey = normalizePoliza(item.poliza) + '-' + nomalizeEndoso(item.endoso) + '-' + nomalizeSerie(item.serie);
            let secondKey = normalizePoliza(item.poliza) + '-' + nomalizeSerie(item.serie) + '-';
            // Si el Doc Key corresponde al pago de DLLS hacia MXN, entonces obtenemos guardamos el valor por separado


            // CUANDO LA POLIZA ES 00000, EL ENDOSO ES 0, Y NO TIENE SERIE, se requiere crear un docKey nuevo para no agrupar estos registros
            // Este docKey no se encontrará en SICAS y por default tendrá el valor de "No encontrado en agente"
            
            // Puede contener los importes en ramo General, o los cambios de divisas (Se hace la separación)
            if (docKey == '0-0-N/A') {
                // DocKey es diferente para acumular los generales
                if ( item.ramo == 'GRAL' ) {
                    docKey = nomalizeEndoso(item.poliza) + '-' + nomalizeEndoso(item.endoso) + '-' + nomalizeSerie(item.serie) + '-' + item.ramo + '-' + item.agente + '-' + item.periodo;
                }
                // DocKey es diferente para extraer las divisas
                if ( item.divisa == 'Moneda Nacional' && item.concepto && item.concepto.toLowerCase().includes('traspaso') ) {
                    docKey = nomalizeEndoso(item.poliza) + '-' + nomalizeEndoso(item.endoso) + '-' + nomalizeSerie(item.serie) + '-' + item.periodo + '-DIVISA';
                    // Original ammount es el valor del dólar (posterior se compara dolar vs MXN)
                    item.original_ammount = Number( common.getSubstring( item.concepto.toLowerCase(), 'traspaso', 'dlls' ) );
                }
                // console.log( 'suma: ' + Number(item.comis) );
                // console.log( docKey )
            }

            // Create key if not exists
            if (!proccessed[docKey]) {
                proccessed[docKey] = {
                    docKey: docKey,
                    secondKey: secondKey,
                    divisa: item.divisa,
                    dia: item.dia,
                    poliza: item.poliza,
                    endoso: item.endoso,
                    recibo: item.recibo,
                    serie: item.serie,
                    concepto: item.concepto,
                    totalImporte: 0,
                    totalComisiones: 0,
                    agente: item.agente,
                    periodo: item.periodo,
                    items: []
                };
            }
            // Create register per item
            // if ( item.ramo == 'GRAL' ) {
            //     console.log( 'divisa', item.divisa )
            // }
            proccessed[docKey].items.push({
                agente: item.agente,
                periodo: item.periodo,
                divisa: item.divisa,
                ramo: item.ramo,
                concepto: item.concepto,
                importe: item.base_comision,
                cargo: item.cargo,
                comis: item.abono,
                original_ammount: item.original_ammount
            });

        });

    });

    // Sumar y procesar
    Object.keys( proccessed ).forEach( docKey => {
        proccessed[docKey].items.forEach( item => {
            // For HDI, the "importe" is accumulative
            proccessed[docKey].totalImporte = Number(proccessed[docKey].totalImporte) + Number(item.importe);
            proccessed[docKey].totalImporte = Number(proccessed[docKey].totalImporte.toFixed(2));
            // For HDI, the comision is accumulative
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones) + Number(item.comis);
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones.toFixed(2));
            // For HDI, remove cargo 
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones) - Number(item.cargo);
            proccessed[docKey].totalComisiones = Number(proccessed[docKey].totalComisiones.toFixed(2));
        });
    });

    delete proccessed['0-0-N/A-Semana 1-DIVISA'];
    delete proccessed['0-0-N/A-Semana 2-DIVISA'];
    delete proccessed['0-0-N/A-Semana 3-DIVISA'];
    delete proccessed['0-0-N/A-Semana 4-DIVISA'];
    delete proccessed['0-0-N/A'];

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
const nomalizeSerie = function(serie) {
    serie = String(serie);
    serie = serie.split('/');
    serie = serie.map(el => Number(el));
    return (serie.length && serie[0]) ? serie[0] : 'N/A';
}

// Normalize poliza
const normalizePoliza = function(poliza) {
    if (poliza) {
        let poliza_array = String(poliza).split('-');
        if ( poliza_array.length > 1 ) {
            return Number(poliza_array[1]);
        }
    }
    return Number(poliza);
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