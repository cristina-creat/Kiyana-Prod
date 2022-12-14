'use strict'

var config = require('config');
const fs = require('fs');
const puppeteer = require('puppeteer');
const utils = require('../utils');
const path = require('path');
const PDFParser = require("pdf2json");
var XLSX = require("xlsx");
var moment = require('moment');
moment.locale('es')
const _ = require('lodash');



/********************
*
*   HDI
*
********************/
// Params:
// new_conciliacion: Conciliacion
// credentials: CredencialHDI
exports.scrapeHDI = function (new_conciliacion, credentials) {

    let logActivities = [];

    let period_date = moment(new_conciliacion.year + '-' + String(new_conciliacion.month).padStart(2, '0') + '-01');
    let period = {
        month: period_date.format('MMMM'),
        month_number: period_date.format('MM'),
        year: period_date.year()
    }

    return new Promise(async (resolve, reject) => {
        let browser;
        let page;

        ////// CONTINUE HERE ---- SEPARATE ON BLOCKS

        // Launching puppetteer
        try {
            console.log("Opening the browser......");
            browser = await puppeteer.launch(config.scrapper.options);

            //let browser = await browserInstance;
            page = await browser.newPage();

            await page.setViewport({ width: 1366, height: 768 });
            
            if ( config.scrapper.service.hdi.timeout )
                page.setDefaultTimeout( config.scrapper.service.hdi.timeout );
            
            logActivities.push({
                act: 'Robot ready',
                status: true
            });
        } catch( err ) {
            logActivities.push({
                act: 'Robot ready',
                status: false
            });
            browser.close();
            reject( logActivities );
            return;
        }

        // Validate Login
        try { 
            await hdiLogin(page, credentials);
            logActivities.push({act: 'Login form', status: true });
        } catch (err) {
            logActivities.push({ act: 'Login form', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

         // Wait for main page ready        
         try {
            console.log(`Wait for login success`);
            await page.waitForSelector('#ctl00_lnkLogOut');
            logActivities.push({ act: 'Inicio de sesión correcto', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Inicio de sesión correcto', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        // GoTo estado de cuenta URL
        try {
            console.log(`Navigate to estado de cuenta`);
            await page.goto(config.scrapper.service.hdi.comisionesUrl);
            // Wait for new page rendered
            console.log(`Wait for page rendered`);
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_rdpFecha_dateInput_text');
            logActivities.push({ act: 'Sección de estado de cuenta', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Sección de estado de cuenta', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        // Download Files
        try {
            
            let urlData = await hdiParseData(page, period.month, period.year, credentials.identifier, new_conciliacion._id);
            logActivities.push({ act: 'Descarga de archivos', status: true, extradata: urlData });
            await page.waitForTimeout(30000);
            console.log(`Files must be downloaded`);

        } catch(err) {
            logActivities.push({ act: 'Descarga de archivos', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        

        // Convert PDF Files
        try {
            
            await hdiTransformPDFToXLSX(new_conciliacion._id, credentials.identifier)
            logActivities.push({ act: 'Convertir archivos PDF', status: true });
            
            console.log(`Files was converted`);

        } catch(err) {
            console.log('error pharsing PDF', err)
            logActivities.push({ act: 'Convertir archivos PDF', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        // Logout
        try {
            await page.$eval('#ctl00_lnkLogOut', el => el.click());
            logActivities.push({ act: 'Cerrar sesión', status: true });
            console.log(`Logged out`);
            await page.waitForTimeout(1000);

        } catch(err) {
            logActivities.push({ act: 'Cerrar sesión', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        browser.close();
        console.log(`Browser instance close`);
        resolve(logActivities);


    });

}

async function hdiLogin(page, credentials) {
    
    let url = config.scrapper.service.hdi.loginUrl;
    console.log(`Navigating to ${url}...`);
    // Navigate to the selected page
    await page.goto(url)

    // Wait for the required DOM to be rendered
    console.log(`Wait for sign in form`);
    await page.waitForSelector('#ctl00_DefaultContent_lgnacceso_UserName');

    // Fill account
    console.log(`Fill account field`);
    await page.$eval('#ctl00_DefaultContent_lgnacceso_UserName', (el, credentials) => el.value = credentials.username, { username: credentials.username });
    // Fill password
    console.log(`Fill password field`);
    await page.$eval('#ctl00_DefaultContent_lgnacceso_Password', (el, credentials) => el.value = credentials.password, { password: credentials.password });
    // Send login form
    console.log(`Click send button`);
    await page.$eval('#ctl00_DefaultContent_lgnacceso_LoginButton', el => el.click());

}

async function hdiParseData(page, selectedMonth, selectedYear, agent_id, request_id) {

    console.log(`Wait for anio selector`);
    await page.waitForSelector('#ctl00_ContentPlaceHolder1_rdpFecha_dateInput_text');

    console.log(`Current year selected`, selectedMonth + ' ' + selectedYear);
    await page.focus('#ctl00_ContentPlaceHolder1_rdpFecha_dateInput_text');
    await page.type('#ctl00_ContentPlaceHolder1_rdpFecha_dateInput_text', selectedMonth + ' ' + selectedYear);
    await page.$eval('#ctl00_ContentPlaceHolder1_rdpFecha_dateInput_text', (el, params) => el.value = params.date, { date: selectedMonth + ' ' + selectedYear });


    console.log(`Click to generate file`);
    await page.focus('#ctl00_ContentPlaceHolder1_btiAceptar');
    await new Promise(resolve => { setTimeout(resolve, 1000) });
    await page.$eval('#ctl00_ContentPlaceHolder1_btiAceptar', el => el.click());

    await new Promise(resolve => { setTimeout(resolve, 3000) });

    // define base path
    let basePath = './downloads/' + request_id + '/' + agent_id

    // Set download behavior
    if (!fs.existsSync(basePath))
        fs.mkdirSync(basePath, { recursive: true });

    await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: basePath
    });

    await new Promise(resolve => { setTimeout(resolve, 5000) });

    // evaluate will run the function in the page context
    const evaluate = await page.evaluate(async (params) => {
        console.log("Params: ", params)
        const link = document.createElement("a");
        link.setAttribute("href", params.url);
        link.setAttribute("download", params.filename);
        document.body.appendChild(link);
        link.click();
        return Promise.resolve(true);
    }, { url: config.scrapper.service.hdi.reporteUrl, filename: agent_id });

    return Promise.resolve({
        urls: basePath
    });
    
}

/**
 * 
 * @param {String} request_id - Request id 
 * @param {String} agent_id - Agent number
 * @returns {Promise<String>} - PDF table data
 */
// Finish promise function
 function hdiTransformPDFToXLSX(request_id, agent_id) {
    return new Promise( (resolve, reject) => {
        const file_pdf = path.join(__dirname, '../../', 'downloads', request_id.toString(), agent_id.toString(), 'output.pdf');
        const file_xlsx = path.join(__dirname, '../../', 'downloads', request_id.toString(), agent_id.toString(), 'output.xlsx');
        if (fs.existsSync(file_pdf)) {
            const pdfParser = new PDFParser();
            pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError) );
            pdfParser.on("pdfParser_dataReady", pdfData => {
                console.log('available data')
                console.log(pdfData)
                try {
                    const table = hdiExctractData(pdfData);
                    const workbook = XLSX.utils.book_new();
                    const worksheet = XLSX.utils.aoa_to_sheet(table);
                    XLSX.utils.book_append_sheet(workbook, worksheet);
                    XLSX.writeFile(workbook, file_xlsx);
                    resolve( file_xlsx )
                } catch( err ) {
                    reject ( err )
                }
            });
            
            pdfParser.loadPDF(file_pdf);
        } else {
            console.log("File path not exists: ", file_pdf);
            reject( "File path not exists: " + file_pdf )
        }
    } );
}

function hdiExctractData(pdf) {
    
        let table_data = [];
        let table_row = -1;
        let rowY;
        let date_regex = new RegExp(/\d*\/\d*\/\d*/gm);
        let letter = new RegExp(/[a-zA-Z]/gm);
        let digit = new RegExp(/\d/gm);

        let moneda = '';

        if ( pdf.formImage )
            pdf = pdf.formImage
        
        
        pdf.Pages.forEach(page => {
            
            page.Texts = _.sortBy( page.Texts, ['y'] );

            let rows = {};

            page.Texts.forEach(text => {
                if ( !rows[ text.y ] ) {
                    rows[ text.y ] = [];
                }
                rows[ text.y ].push( text )
            });

            Object.keys( rows ).forEach( y => {
                rows[y] = rows[y].filter( el => {
                    return (
                        (el.sw == 0.40625 && el.R && el.R[0] && (el.R[0].S == -1)) // Posición en "y" y estilo de fila
                        ||
                        (el.sw == 0.32553125 && el.x == 17.246) // Título Moneda Nacional
                        ||
                        (el.sw == 0.32553125 && el.x == 18.529) // Título Dólares
                    )
                })
            });

            rows = Object.values( rows ).filter ( el => el.length == 1 || el.length > 4 );
            rows = rows.map( r => _.sortBy( r, ['x'] ) ).map( r => r.map( c => c.R[0].T ));


            // Convert rows
            rows = rows.map( r => {
                if ( r.length == 1 ) {
                    // Setup actual currency when length is 1
                    moneda = r[0];
                }
                if (r.length > 1) {
                    // Insert currency at begining
                    r.unshift( moneda );
                    // Decode texts
                    r = r.map( val =>  decodeURIComponent(val) );

                    if (digit.test(r[2]) || r[2].length < 3) {
                        r.splice(2, 0, "");
                    }
                    if (letter.test(r[3]) || r[3].length < 5) {
                        r.splice(3, 0, "");
                    }
                    if (r[5].length > 5) {
                        r.splice(5, 0, "");
                    }
                    if (letter.test(r[6])) {
                        r.splice(6, 0, "");
                    }
                    if (r[7].length != 5) {
                        r.splice(7, 0, "");
                    }
                    if (r[8].length < 2 ) {
                        r.splice(8, 0, "");
                    }
                }
                return r;
            });

            // Remove currency titles
            rows = rows.filter( el => el.length > 1);

            
            table_data = table_data.concat( rows );

            

        });
        table_data = _.sortBy( table_data, [1] );
        return table_data;

}
