'use strict'

var config = require('config');

var fs = require('fs');
var _ = require('lodash');
var moment = require('moment');
moment.locale('es')

const common = require('../common');
const scrapper = require('../scrappers/gmx');
var xlsxConciliacion = require('../xlsx_conciliacion');
var mailing = require('../mailing');
const utils = require('../utils');

const User = require('../../models/user');
const { Sica, ConciliacionResult, QueueQuery, Conciliacion } = require('../../models/conciliacion');
const { CredencialGMX } = require('../../models/catalog')

/*
*
*   GMX
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
        await QueueQuery.updateMany({ type: 'GMX', status: 'running', started_at: { $lte: moment().subtract(5, 'minutes') } }, timeoutData);

        // Find current excecuting items
        let inProccess = await QueueQuery.find({ status: 'running', type: 'GMX' });
        let pendiengItems = await QueueQuery.countDocuments({ status: 'pending', type: 'GMX' });

        // If current item running, then return
        if (inProccess && inProccess.length >= config.scrapper.service.gmx.maxQueue) {
            resolve({
                inProccessItem: inProccess,
                remainItems: pendiengItems
            });
            return;
        }

        // Get next element to proccess
        let queueItem = await QueueQuery.findOne({ status: 'pending', type: 'GMX' }).sort({ created_at: 1 });
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
        let credential = await CredencialGMX.findOne({ identifier: queueItem.identifier });
        
        console.log('Se inicia el procesamiento de GMX');

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
            // // Success execution block
            let scrapeResult = await scrapper.scraperGMX(conciliacion, credential);
            queueItem.status = 'completed';
            
            queueItem.activities = queueItem.activities.concat( scrapeResult );

            queueItem.finished_at = new Date;
            queueItem.save();
            console.log("volvio al service");
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
//     // Get User data from DB
    let userDataGMX = await User.findById(cn._user);
//     // Get SICA data from DB
   let sicaDataGMX = await Sica.findById(cn._sica);
   const month = Number(cn.month) - 1;
   const year = Number(cn.year);
   const starDate = moment(new Date(year, month, "01")).startOf('month').format('DD/MM/YYYY');
   const endDate = moment(new Date(year, month, "01")).endOf('month').format('DD/MM/YYYY');
   const monthConciliacion = Number(cn.month);
   const DateNow = moment().format('DD/MM/YYYY');
   const monthNow = moment().format('MM');
   const yearNOw = moment().year();


   let PeriodoConciliacion= (starDate + " - " + endDate);


   if((monthNow==monthConciliacion) && (year==yearNOw))
   { 
     PeriodoConciliacion= (starDate + " - " + DateNow);

   }

    sicaDataGMX = proccessSicaData(sicaDataGMX);  
   let insuranceDataGMX = proccessGMXData(readFilesGMX(cn));
   
  
   let mergedData = mergeSicaInsurance( sicaDataGMX, insuranceDataGMX );

    let conciliacionResultGMX = new ConciliacionResult({
        data: mergedData,
        _conciliacion: cn._id,
        _tenant: cn._tenant,
        filename: 'GMX_export_' + moment().format('YYYY-MM-DD') + '_' + new Date().getTime() + '.xlsx'
    });

     let basePathGMX= './downloads/' + cn._id + '/';
     let fileNameGMX = conciliacionResultGMX.filename;

    // Prevent if folder don't exists, it happens when 0 agents where success
    if (!fs.existsSync(basePathGMX))
        fs.mkdirSync(basePathGMX, { recursive: true });

    // Uncomment this line
    await conciliacionResultGMX.save();
  


     cn.status = 'proccessed';

//     // Uncomment this for product
     await cn.save();
     

     let mailDataGMX = _.cloneDeep(conciliacionResultGMX.data).map(el => {

       
    
        let tmpEl = {};
        

          tmpEl['moneda'] = (el.sica && el.sica['Moneda']) ? el.sica['Moneda'] : (el.insurance ? el.insurance['moneda'] : '');
         tmpEl['cve_agente'] = (el.sica && el.sica['CAgente']) ? Number(el.sica['CAgente']) : (el.insurance) ? Number(el.insurance['agente']) : '';
         //tmpEl['agente_desde'] = (el.sica && el.sica['FDesde']) ? el.sica['FDesde'] : '';
        //  const date = new Date(el.insurance['startDate']);
        //  console.log(date);
         tmpEl['agente_desde'] =  (el.sica && el.sica['FDesde']) ? el.sica['FDesde'] : (el.insurance) ? el.insurance['startDate'] : '';
       
         tmpEl['agente_poliza'] = (el.sica && el.sica['Documento']) ? el.sica['Documento'] : (el.insurance && el.insurance['poliza'] ? el.insurance['poliza'] : '');
         tmpEl['agente_endoso'] = el.sica ? el.sica['Endoso'] : '';
        // tmpEl['agente_periodo'] = el.sica ? el.sica['Periodo'] : '';
         tmpEl['agente_periodo'] = (el.sica && el.sica['Periodo']) ? el.sica['Periodo'] : (el.insurance) && el.insurance['recibo'] ? el.insurance['recibo'] : '';
         tmpEl['agente_serie'] = el.sica ? el.sica['Serie'] : '';
         
         tmpEl['agente_importe'] = el.sica ? el.sica['PrimaNeta'] : 0;
         tmpEl['agente_comisiones'] = el.sica ? el.sica['total'] : 0;
         tmpEl['ins_poliza'] = (el.insurance && el.insurance['poliza']) ? el.insurance['poliza'] : '';
         tmpEl['ins_endoso'] = el.insurance ? el.insurance['endoso'] : '';
         tmpEl['ins_periodo'] = el.insurance ? el.insurance['recibo'] : '';
         tmpEl['ins_importe'] = el.insurance ? el.insurance['PrimaNeta'] : 0;
         tmpEl['ins_comisiones'] = el.insurance ? el.insurance['totalImporteCom'] : 0;
         tmpEl['ins_fechas'] =  PeriodoConciliacion;
      
         tmpEl['status'] = el.status;
         tmpEl['dif_importe'] = tmpEl['ins_importe'] - tmpEl['agente_importe'];
        tmpEl['dif_comisiones'] = tmpEl['ins_comisiones'] - tmpEl['agente_comisiones'];
   // console.log(tmpEl);

      return tmpEl;
         //return el;
     });
     let columnsGMX = [
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
            key: 'ins_importe',
            width: 13
        },
        {
            header: "Prima del Agente",
            key: 'agente_importe',
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
      let periodos = mailDataGMX.map(el => el.ins_fechas);
      // Get unique elements (do not repeat)
      periodos = _.uniq(periodos);
      // If some period is not available, remove it, and convert to a readeable string
      periodos = periodos.filter(el => el != 'N/A').map(el => el.replace('PERIODO DEL ', ''));
      // Sort periodos asc
      periodos = _.sortBy(periodos);
      // Setup creation date for the xlsx results
      let fecha = moment(conciliacionResultGMX.created_at).format("dddd, MMMM DD YYYY, hh:mm:ss a");
      // Capitalize date format
      fecha = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  
      // Define excel titles
      let titles = {
          aseguradora: 'Aseguradora: GMX Periodos conciliados: ' + periodos.join(', '),
          empresa: 'Sistema de conciliaciones de Creatsol',
          usuario: userDataGMX.firstname + ' ' + userDataGMX.lastname,
          fecha: fecha
      }
  
      // Generate excel from the service
      xlsxConciliacion.exportQualitasExcel(mailDataGMX, basePathGMX + fileNameGMX, columnsGMX, titles);
  


    // Send mail
    var optionsGMX = {
        subject: 'Conciliación completada',
        recipients: {},
        template: 'protec-conciliacion-finish',
        attachment: [basePathGMX + fileNameGMX]
    }
    optionsGMX.recipients[userDataGMX.email] = {
        'id': cn._id,
        'name': userDataGMX.firstname + ' ' + userDataGMX.lastname
    };

    // Set timeout while saving file
    setTimeout(() => {
        // Uncomment in prod version
        mailing.send(optionsGMX, function (mailResult) {
            console.log('mail result', mailResult);
        });
    }, 5000)

    return mergedData;
    
}

// Read XLS files and return as JSON
const readFilesGMX = function (conciliacion) {
   
    let fileName = 'archivo.xls';
    let mainData = [];
    let cn = conciliacion;
  
    cn.agents.forEach(ag => {
        if (fs.existsSync('./downloads/' + cn._id + '/'  + ag))
         {  
            fs.readdirSync('./downloads/' + cn._id + '/' + ag).forEach(file => {
               
                // Read priod folder
                
                // if ( moment( period_folder, 'YYYY-MM-DD', true ).isValid() ) {
                   ///  console.log("******entrooooo" + cn) ;
                //     Read excel file
                     let fileData = utils.importExcelFileAsArray('./downloads/' + cn._id + '/'+ ag + '/'  + file);
                    

                //     let periodo = period_folder;
                 
                //     // Remove first titles line
                    fileData.shift();
                
//console.log("******this is tthe periodo" + fileData);
                    fileData.unshift(['CODIGO_AGENTE','NOMBRE_AGENTE','COD_SUC','SUCURSAL',
                    'RAMO','RAMO_COMENRCIAL','POLIZA','RENOVACION','ENDOSO','RECIBO','MONEDA','FECHA_COBRANZA','FECHA_EMISION','VIGENCIA_DESDE','VIGENCIA_HASTA','TIPO_CAMBIO','PRIMA_NETA','COMISION_TOTAL','NOMBRE ASEGURADO']);
                    
                     fileData = utils.arrayToObject(fileData);
                    
                    // Cast to numbers
                    fileData = fileData.map(el => {
                        //el.importe = Number(String(el.importe).replace(/,/g, '')) || 0;
                        //el.comis = Number(String(el.comis).replace(/,/g, '')) || 0;
                        //el.ComisionSobreRecargoMto = Number(String(el.ComisionSobreRecargoMto).replace(/,/g, '')) || 0;
                        //el.Comision2 = Number(String(el.Comision2).replace(/,/g, '')) || 0;
                        //el.iva_r = Number(String(el.iva_r).replace(/,/g, '')) || 0;
                        el.CODIGO_AGENTE = ag;
                        //el.periodo = periodo;
                        return el;
                    });
                    mainData.push(fileData);
               

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
     
        
        let docKey = normalizePoliza(item.Documento);
       //  let docKey = normalizePoliza(item.Documento) + '-' + nomalizeEndoso(item.Endoso) + '-' + nomalizeSerie(item.Serie);
        // let secondKey = normalizePoliza(item.Documento) + '-' + nomalizeSerie(item.Serie) + '-';
        //    console.log( "docKey = " + docKey);
        //    console.log( "secondKey = " + secondKey); 
     

        if (!proccessed[docKey]) {
           
            proccessed[docKey] = {
                
                docKey: docKey,
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
const proccessGMXData = function (qData) {
    
    // If no data, return empty objetc
    if (!qData || !qData.length) {
        return {};
    }

    
    let proccessed = {};
    // Walk each item
    qData.forEach(file => {
        // Walk each file
       // console.log(file);
        file.forEach(item => {
            

            let docKey = "0" + item.COD_SUC + '-' + "0" + item.RAMO + '-' + + "0" + normalizePoliza(item.POLIZA) + '-' + nomalizeEndoso(item.ENDOSO) + '-' + "0" + + item.RECIBO;
     

            // Create key if not exists
            if (!proccessed[docKey]) {
                proccessed[docKey] = {
                    docKey: docKey,
                    startDate: item.VIGENCIA_DESDE,
                    moneda: item.MONEDA,
                    poliza: ("0" + item.COD_SUC + '-' + "0" + item.RAMO + '-' + + "0" + normalizePoliza(item.POLIZA) + '-' + nomalizeEndoso(item.ENDOSO) + '-' + "0" + + item.RECIBO),
                    endoso: item.ENDOSO,
                    recibo: item.RECIBO,
                    totalImporteCom: 0,
                    PrimaNeta:0,
                    agente: item.CODIGO_AGENTE,
                    ramo: item.RAMO,
                    periodo: item.RECIBO,
                    items: []
                };
            }
             


            // Create register per item
            // proccessed[docKey].items.push({
            //     comisionTotal: item.COMISION_TOTAL,
            //    // comis: item.comis,
            //    // ComisionSobreRecargoMto: item.ComisionSobreRecargoMto,
            //     //Comision2: item.Comision2
            // });

         
            // For gmx, the "importe" is accumulative
           proccessed[docKey].totalImporteCom = Number(proccessed[docKey].totalImporteCom) + Number(item.COMISION_TOTAL);
           proccessed[docKey].totalImporteCom = Number(proccessed[docKey].totalImporteCom.toFixed(2));
            // For gmx, the comision is accumulative
            proccessed[docKey].PrimaNeta = Number(proccessed[docKey].PrimaNeta) + Number(item.PRIMA_NETA) ;
            proccessed[docKey].PrimaNeta = Number(proccessed[docKey].PrimaNeta.toFixed(2));
           

        });
    })

    return Object.values(proccessed);
}

 const mergeSicaInsurance = function( sicaData, insuranceData ) {
   
    //console.log("info sicas --->");
    // console.log(sicaData[0]);
    // console.log(sicaData[1]);

   //Now merge data (sica with insurance)
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
        let indexKey = newData.findIndex( el => el.sica.docKey == s.docKey && differenceIsTolerable(s.totalImporteCom, el.sica.total, 2) )
       
        // console.log(sicaData[0]);
        // console.log(insuranceData[5]);
       // console.log(indexKey);


        if (indexKey !== -1 ) {
            newData[indexKey].insurance = s;
        } else {
            secondData.push( { insurance: s } );
        }
    });

    newData = newData.concat( secondData );
    
    // Compare items
    newData.forEach( (item,s) => {
        // console.log("info sicas -->");
        // console.log(sicaData[2]);

      
         
      //  console.log(newData[s].sica)
        let divisa = 'MXN';
        if ( (newData[s].sica && newData[s].sica.Moneda && newData[s].sica.Moneda.toLowerCase().includes('dólar')) ) {
            divisa = 'USD a MXN';
        } 
        // console.log("********************************************+");
        // console.log("entrooo insurance");
        // console.log(newData[s].insurance)
        // console.log("entrooo sica");
        //   console.log(newData[s].sica)
        // console.log("info insurance -->" );
        //     console.log(newData[s].insurance);
        //     console.log("info sica -->");
        //     console.log(newData[s].sica);

        if (newData[s].sica && newData[s].insurance) {
       
            
            // Los importes son iguales en ambos registros o tienen una tolerancia del 2%
            if (newData[s].insurance.totalImporteCom == newData[s].sica.total || differenceIsTolerable(newData[s].insurance.totalImporteCom, newData[s].sica.total, 2)) {
                newData[s].status = 'Importe Correcto ' ;///+ divisa;
                ///console.log("entro importe correcto")
               
            } else {
                // Los importes son diferentes
                newData[s].status = 'Importes Incorrectos ' ;
               // console.log("entro importe no correcto")
            }
            // El endoso es diferente, no se validan montos
            if ( nomalizeEndoso(newData[s].insurance.ENDOSO) != nomalizeEndoso(newData[s].sica.Endoso) ) {
                newData[s].status = 'Diferente endoso ';
            }
        } else {
            
            // No se encontró en el reporte sica
            if (!newData[s].sica) {
             
                newData[s].status = 'No encontrado en el agente ';
            }
            // No se encontró en el estado de cuenta
            if (!newData[s].insurance) {
            
                newData[s].status = 'No encontrado en la aseguradora ';
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
        endoso = "00000";
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