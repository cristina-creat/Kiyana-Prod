'use strict'

var config = require('config');

/***************************************
 *
 *
 *	Testing function
 *
 *
 ***************************************/
exports.test = async function(req, res, next) {
   res.send()
    return;
    /*
    var soap = require('soap');
    var moment = require('moment');
    var url = 'http://200.78.173.245:82/IsTimeWS.asmx?WSDL';
    
    soap.createClient(url, function(err, client) {
        
        var today = moment().add(1,'week');
        var args = {
            clave: 'CIS0000671',
            horario: 'A3',
            semana: today.format('w'),
            anio: today.format('YYYY')
        };
        res.send('ok');
        
        client.HorarioEmpleado(args, function(error, result) {
            res.send({
                result: result,
                error: error,
                err: err
            })
        });
        
        
    });
    */

    /*
    const fs = require('fs');
    if (fs.existsSync(config.firebase.default.apn.token.key)) {
        //file exists
        console.log( 'Existe archivo ' + config.firebase.default.apn.token.key );
    } else {
        console.log( 'No existe archivo ' + config.firebase.default.apn.token.key );
  
    }
    res.send('ok');
    return;
    
    
	var PushNotifications = new require('node-pushnotifications');

	const settings = {
		gcm: {
			id: config.firebase.default.gcm.id,
			phonegap: false
		},
		apn: {
			token: {
				key: config.firebase.default.apn.token.key, // optionally: fs.readFileSync('./certs/key.p8') 
				keyId: config.firebase.default.apn.token.keyId,
				teamId: config.firebase.default.apn.token.teamId
			},
			production: false
		},
		isAlwaysUseFCM: false
	};
	const push = new PushNotifications(settings);

	
	// Multiple destinations 
    var registrationIds = ['cJeC2tjtiXI:APA91bEtI3MatU__6HyVMOoMGtXMSGBBO0Ymy-NAIQXw_Li0HgOC2II4nlmSF7xVX7CtAmaO9pqPaS0ZuRfjnGeOk3JmxcJAtieWK1WcZEQ4eCZxni57-g7frAUq66qDBGTgK7Pw8Qu9']; 

    
	let data = {
        title: 'Hola',
		body: 'Mundo', // REQUIRED 
		icon: "ic_stat_icon_notification"
        //category: 'kasax'
    }
    //console.log(registrationIds);

    
    
    push.send(registrationIds, data).then(
		data => {
			res.send( data );
		}
	).catch(
		err => {
			res.send( err );
		}
	);
	*/
}


/******
 * 
 * get app options
 * 
 */
exports.getAppOptions = function(req, res, next) {
    res.send({
        data: config.options
    })
}


