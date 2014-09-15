/**
 * Created by f13 on 12/9/14.
 * Not being used
 */
var config = require('./config');
var request = require('request');
var _ = require('lodash');
var log = require("log4js").getLogger('[8tracks][auth]');
var read = require('read');
var async = require('async');

var session = config.session;
var retries = config.retries;
var headers = {
    'X-Api-Key': config.apiKey,
    'X-Api-Version': config.apiVersion
};

var loginRequest = request.defaults({
    headers: headers
});
var sessionRequest = null;

module.exports.isLoggedin = function() {
    return _.isString(session);
}
module.exports.login = function(done) {
    sessionRequest = null;
    retries = config.retries;
    async.waterfall([
        function(cb) {
            read({prompt: 'Username:'}, function(err, username) {
                return cb(err, username);
            })
        },
        function(username, cb) {
            read({prompt: 'Password:', silent: true}, function(err, password) {
                return cb(err, username, password);
            })
        }
    ], function(err, username, password) {
        if(err) {log.error("Reading from stdin failed"); throw err;}
        return login(username, password, done);
    })
}

function login(username, password, done) {
    loginRequest.post(config.api.login, {
        form: {
            login: username,
            password: password
        }
    }, function(err, response, body) {

        var data = err ? {} : JSON.parse(body);
        //log.debug(err);
        if(err || _.isUndefined(data['logged_in'] || !data['logged_in']) || _.isUndefined((data.user || {}).user_token)) {
            log.debug("login retry : ", retries);
            if(retries-- > 0)
                return login(done);
            log.warn("login failed");
            if(done)
                return done(new Error("Login failed"));
        }
        else {
            session = data['user']['user_token'];
            sessionRequest = loginRequest.defaults({
                headers: {
                    'X-User-Token': session
                }
            });
            //log.debug("session : ", session);
            config.set("session", session);
            if(done)
                done(null, data['logged_in']);
        }

    });
}