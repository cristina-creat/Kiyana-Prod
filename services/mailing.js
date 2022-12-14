'use strict'

var config = require('config');
var mailgun = require('mailgun-js')({apiKey: config.mailgun.api_key, domain: config.mailgun.domain});
var fs = require('fs');
var path = require('path');

/**
* 
* 
*  Send mail via mailgun
*  params options = { recipients: {email:{var1:value1,var2:value2,...}}, subject: 'string', template: 'mailgun template slug' }
* 
*/

exports.send = function(options, callback) {

  if (!options) {
    return;
  }

  var data = {
    from: config.mailgun.from,
    to: Object.keys( options.recipients ),
    subject: (options.subject) ? options.subject : config.mailgun.default_subject ,
    template: options.template,
    'recipient-variables': JSON.stringify(options.recipients)
  };

  

  if ( options.attachment ) {

    // Filter only existing items
    options.attachment = options.attachment.filter( el => {
      return fs.existsSync(el)
    });

    data.attachment = options.attachment
  }



  /*
  if ( options.recipiens ) {
    Object.keys( options.recipiens ).forEach( key => {
      data[key] = body[key];
    })
  }
  */
  
  mailgun.messages().send(data, function (error, body) {
    console.log(error);
    console.log(body);
  });

}
