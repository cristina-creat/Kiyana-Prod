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
*   GNP
*
********************/
// Params:
// new_conciliacion: Conciliacion
// credentials: CredencialGMX

exports.scraperGNP = function (new_conciliacion, credentials) {

    let logActivities = [];

    // let period_date = moment(new_conciliacion.year + '-' + String(new_conciliacion.month).padStart(2, '0') + '-01');
    // let period = {
    //     month: period_date.format('MMMM'),
    //     month_number: period_date.format('MM'),
    //     year: period_date.year()
    // }
    // console.log("Opening the period_date......" + period_date);
    return new Promise(async (resolve, reject) => {
        
        let browser;
        let page;

        // Launching puppetteer
        try {
            console.log("Opening the browser......");
            browser = await puppeteer.launch(config.scrapper.options);

            //let browser = await browserInstance;
            page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            
            if ( config.scrapper.service.gmx.timeout )
                page.setDefaultTimeout( config.scrapper.service.gmx.timeout );
            
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
            await GNPLogin(page, credentials);         
            logActivities.push({act: 'Login form', status: true });
            await page.waitForTimeout(3000);
        } catch (err) {
            logActivities.push({ act: 'Login form', status: false });
            browser.close();
            reject( logActivities );
            return;
        }
     
        //GoTo comisiones URL
        try {

            console.log(`Navigate to comisiones`);
            await page.goto(config.scrapper.service.gmx.comisionesUrl);
            // Wait for new page rendered
            console.log(`Wait for page rendered`);
            await page.click('#ContentPlaceHolder1_RbPagada');        
            //Make start and end date for period selected             
            const month = Number(new_conciliacion.month) - 1;
            const year = Number(new_conciliacion.year);
            const starMonth = moment(new Date(year, month, "01")).startOf('month').format('DD/MM/YYYY');
            const endMonth = moment(new Date(year, month, "01")).endOf('month').format('DD/MM/YYYY');
            await page.$eval('#ContentPlaceHolder1_txtDate', (el, value) => el.value = value, starMonth);
            await page.$eval('#ContentPlaceHolder1_txtfeven', (el, value) => el.value = value, endMonth);
      
        } catch(err) {
            logActivities.push({ act: 'Sección de comisiones', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        // Download Files
        try {

            console.log(`Download Files******` );   
            if (!fs.existsSync('./downloads/' + new_conciliacion._id + '/' + credentials.identifier))
            fs.mkdirSync('./downloads/' + new_conciliacion._id + '/' + credentials.identifier, { recursive: true });
            //indicate to the path for save
            await page._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: './downloads/' + new_conciliacion._id + '/' + credentials.identifier
            });
            //generate the report
            await page.click('#ContentPlaceHolder1_BtnGenerarRp');
            logActivities.push({ act: 'Sección de comisiones', status: true });
            await page.waitForTimeout(2000);
            console.log(`Files must be downloaded`);

        } catch(err) {
            logActivities.push({ act: 'Descarga de archivos', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

            
           //Wait to finish the session   
        try {
            let logoutUrl = config.scrapper.service.gmx.logoutUrl;
            await page.goto(logoutUrl);
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

async function GMXLogin(page, credentials) {
    
    let url = config.scrapper.service.gmx.loginUrl;
    // Go to page
    console.log('Go to page');
    await page.goto(url);
    //Select form and fill inputs to login.
    console.log('Select input');
    await page.waitForSelector('#txtUsuario');
    //Fill user
    console.log('Fill Input',credentials.username);
    await page.$eval('#txtUsuario', (el, credentials) => el.value = credentials.username, { username: credentials.username });
    //Fill password
    console.log('Fill Input',credentials.password);
    await page.$eval('#txtContrasenia', (el, credentials) => el.value = credentials.password, { password: credentials.password });
    // Click button and go to next page
    console.log('Click button');
    await page.$eval('#btnIniciarSesion', el => el.click());
   
    
}


