/**
 * Created by f13 on 12/9/14.
 */
var path = require('path');
var _ = require('lodash');
var log = require("log4js").getLogger('[8tracks][config]');

var CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
log.debug("config : ", CONFIG_FILE);

var nconf = require('nconf')
    .file({file: CONFIG_FILE});

module.exports = nconf.stores.file.store;
module.exports.get = function(key){ return nconf.get(key);};
module.exports.set = function(key, val) {
    nconf.set(key, val);
    nconf.save(function(err) {
        if(err) return log.error(err);
        else return log.debug("config saved successfully");
    });
};