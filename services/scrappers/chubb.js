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
*   CHUBB
*
********************/
// Params:
// new_conciliacion: Conciliacion
// credentials: CredencialCHUBB

exports.scraperChubb = function (new_conciliacion, credentials) {

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

        // Launching puppetteer
        try {
            console.log("Opening the browser......");
            browser = await puppeteer.launch(config.scrapper.options);

            //let browser = await browserInstance;
            page = await browser.newPage();

            await page.setViewport({ width: 1366, height: 768 });
            
            if ( config.scrapper.service.chubb.timeout )
                page.setDefaultTimeout( config.scrapper.service.chubb.timeout );
            
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
            await chubbLogin(page, credentials);
            logActivities.push({act: 'Login form', status: true });
        } catch (err) {
            logActivities.push({ act: 'Login form', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        //When open confirm to close section click on confirm
        try {
            
            page.on('dialog', async dialog => {
                //get alert message
                console.log('Dialog displayed: ' + dialog.message());
                //accept alert
                await dialog.accept();
                logActivities.push({ act: 'Caja de diálogo cerrada', status: true });
            });
        } catch(err) {
            logActivities.push({ act: 'Caja de diálogo cerrada', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        // Wait for main page ready        
        try {
            console.log(`Wait for login success`);
            await page.waitForSelector('#gridAppsContent');
            logActivities.push({ act: 'Inicio de sesión correcto', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Inicio de sesión correcto', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        // GoTo comisiones URL
        try {
            console.log(`Navigate to comisiones`);
            await page.goto(config.scrapper.service.chubb.comisionesUrl);
            // Wait for new page rendered
            console.log(`Wait for page rendered`);
            await page.waitForSelector('#comisionesPagandas');
            logActivities.push({ act: 'Sección de comisiones', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Sección de comisiones', status: false });
            browser.close();
            reject( logActivities );
            return;
        }



        // Download Files
        try {
            
            let urlData = await chubbParseData(page, period.month_number, period.year, credentials.identifier, new_conciliacion._id);
            logActivities.push({ act: 'Descarga de archivos', status: true, extradata: urlData });
            await page.waitForTimeout(10000);
            console.log(`Files must be downloaded`);

        } catch(err) {
            logActivities.push({ act: 'Descarga de archivos', status: false });
            browser.close();
            reject( logActivities );
            return;
        }



        // GoTo dashboard URL to logout
        try {
            console.log(`Navigate to dashboard`);
            await page.goto(config.scrapper.service.chubb.dashboardPage);
            // Wait for new page rendered
            console.log(`Wait for page rendered`);
            await page.waitForSelector('#lbSalir');
            logActivities.push({ act: 'Regresar al dashboard', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Regresar al dashboard', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        // Logout
        try {
            
            await page.$eval('#lbSalir', el => el.click());

            //Wait to finish the session
            await page.waitForSelector('#MainContent_lblAcceso');

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

async function chubbLogin(page, credentials) {
    
    let url = config.scrapper.service.chubb.loginUrl;
    // Go to page
    console.log('Go to page');
    await page.goto(url);
    //Select form and fill inputs to login.
    console.log('Select input');
    await page.waitForSelector('#MainContent_txtCorreo');
    //Fill user
    console.log('Fill Input',credentials.username);
    await page.$eval('#MainContent_txtCorreo', (el, credentials) => el.value = credentials.username, { username: credentials.username });
    //Fill password
    console.log('Fill Input',credentials.password);
    await page.$eval('#MainContent_txtContrasenia', (el, credentials) => el.value = credentials.password, { password: credentials.password });
    // Click button and go to next page
    console.log('Click button');
    await page.$eval('#MainContent_btnLogin', el => el.click());
    
    
}

async function chubbParseData(page, selectedMonth, selectedYear, agent_id, request_id) {
    
    //Path where the file's download
    let path = `./downloads/${request_id}/${agent_id}`
    // Set download behavior
    if (!fs.existsSync(path))
        fs.mkdirSync(path, { recursive: true });

    //Make start and end date for period selected
    const month = Number(selectedMonth) - 1;
    const starMonth = moment(new Date(selectedYear, month, "01")).startOf('month').format('YYYY-MM-DD');
    const endMonth = moment(new Date(selectedYear, month, "01")).endOf('month').format('YYYY-MM-DD');

    //Wait to comisiones page load
    await page.waitForSelector('#bodyUltimasComisiones');
    //Choose period and click
    await page.waitForSelector('.btnDetCom');

    //Selet attribute data-fecha of table
    let data_date = await page.$$eval("#bodyUltimasComisiones tr a.btnDetCom", el => el.map(x => x.getAttribute("data-fecha")));

    //Filter and fill urls array
    let urls = [];
    data_date.forEach(el => {
        let date = el.split('/Date(')
        date = date[1].split(')');
        let data = {
            data: el,
            url: moment(new Date(parseInt(date)).toUTCString()).format('YYYY-MM-DD')
        }
        if (data.url >= starMonth && data.url <= endMonth) {
            urls.push(data);
        }
    });

    //While for select the correct row, open modal and download the xls file
    let index = 0;
    while (index < urls.length) {
        //Send the download file to next directory
        await page._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: path + '/' + urls[index].url
        });
        //Select attribute to click
        let attribute = "a[data-fecha='" + urls[index].data + "']"
        await page.waitForSelector(attribute);
        //Open modal
        console.log('Open Modal')
        await page.$eval(attribute, el => el.click());
        //Wait to modal load.
        await page.waitForSelector('#modalEdoCtaAgentes');
        await page.waitForSelector('.modal.show');
        // Click on export button
        await page.waitForSelector('#btnExpTexto');
        await page.$eval('#btnExpTexto', el => el.click());
        //Wait select on second modal
        await page.waitForSelector('#cmbSeparador');
        //Select excel to download
        await page.select("select#cmbSeparador", "XLS");
        //Download file
        await page.$eval('#btnExportarModal', el => el.click());
        //Close second modal
        await page.$eval('button.close', el => el.click());
        //Wait to modal load.
        await page.waitForSelector('#modalEdoCtaAgentes.modal.show');
        //Close first modal
        await page.$eval('button.close', el => el.click());
        console.log('Closed modals');
        //path of file
        urls[index].url = path + '/' + urls[index].url
        ++index;
        //Await 3 seconds to next modal.
        await page.waitForTimeout(3000);
    }
    //Return urls
    return { urls: urls }
  
}
