'use strict'

var jwt = require('jwt-simple');
var moment = require('moment');
var config = require('config');

exports.createToken = function(token_data) {
    var payload = {
        iat: moment().unix(),
        exp: moment().add( config.token_expire.cant , config.token_expire.range ).unix()
    }
    Object.keys( token_data ).forEach( key => {
        payload[key] = token_data[key];
    })
    return jwt.encode(payload, config.jwt.secret);
}

exports.decodeToken = function(token) {
    var result = {};
    try {
        result = jwt.decode(token, config.jwt.secret);
    } catch (e) {}
    return result;
}

exports.createCustomToken = function(data) {
    data.iat = moment().unix();
    if (!data.exp)
        data.exp = moment().add( config.token_expire.cant, config.token_expire.range ).unix();
    return jwt.encode(data, config.jwt.secret);
}

exports.validateExpiration = function(exp) {
    if (exp <= moment().unix())
        return false;
    return true;
}

// IMPORTANT!!! - Complete function
exports.validateKey = function(token) {
    // Validate token.key is still the same
    return true;
}
