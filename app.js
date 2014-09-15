/**
 * Created by f13 on 12/9/14.
 */
ROOT_DIR = __dirname;
var readline = require('readline');
var log = require("log4js").getLogger('[8tracks][app]');

var playlist = require('./lib/playlist');


var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('Playlist url : ');
rl.prompt();

rl.on('line', function(line) {
    playlist(line.trim(), function(err) {
        if(err) return process.exit(1);
        return process.exit(0);
    });
    rl.close();
})