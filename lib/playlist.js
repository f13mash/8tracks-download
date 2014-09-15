/**
 * Created by f13 on 14/9/14.
 */

var config = require('./config');
var request = require('request');
var _ = require('lodash');
var log = require("log4js").getLogger('[8tracks][auth]');
var read = require('read');
var async = require('async');
var fs = require('fs');
var process = require('child_process');

var waitTime = 45;
var parallelLimit = 5;
var retryLimit = 3;

var headers = {
    'X-Api-Key': config.apiKey,
    'X-Api-Version': config.apiVersion
};

request = request.defaults({
    headers: headers
});

module.exports = function(url, done) {
    url+=".json"
    if(url.indexOf("http://") != 0)
        url = "http://"+url;
    async.waterfall([
        function(cb) {
            async.parallel([
                function(cb) {
                    loadPlaylist(url, function(err, mix) {
                        //log.trace(err, mix.id);
                        return cb(err, mix);
                    });
                },
                function(cb) {
                    fetchPlayToken(function(err, token) {
                        //log.trace(err, token);
                        return cb(err, token);
                    });
                }
            ], function(err, res) {
                if(err) return cb(err);
                return cb(null, res[0], res[1]);
            })
        },
        function(mix, token, cb) {
            playMix(mix, token, function(err, res) {
                return cb(null, mix);
            })
        },
        function(mix, cb) {
            downloadMix(mix, function(err, res) {
                if(!err) log.trace("Playlist downloaded to ", mix.path);
                return cb(err);
            })
        }
    ], function(err) {
        if(err)log.error("Error while downloading", err);
        return done(err);
    })
}

function loadPlaylist(url, done) {
    log.trace("url : ", url);
    async.waterfall([
        function(cb) {
            request.get(url, function(err, res, data) {
                if(err) return cb(err);
                return cb(null, data);
            });
        },
        function(data, cb) {
            var mix = new Mix(JSON.parse(data));
            return cb(null, mix)
        }
    ], function(err, res) {
        if(err) {log.error("error while loading mix data"); if(done) return done(err); else return;}
        if(done)
            return done(null, res);
    })
}


function fetchPlayToken(done) {
    async.waterfall([
        function(cb) {
            request.get(config.api.playtoken, function(err, res, body) {
                if(err) return cb(err);
                return cb(null, body);
            });
        },
        function(body, cb) {
            var data = JSON.parse(body);
            if(_.has(data, 'play_token')) {
                return cb(null, data['play_token']);
            }
            else {
                return cb(new Error("missing play_token "+data));
            }
        }
    ], function(err, play_token) {
        if(err) {log.error("error while fetching play token.", err); if(done) return done(err); else return;}
        if(done) return done(null, play_token);
    })
}

function playMix(mix, token, done) {
    async.waterfall([
        function(cb) {
            var playUrl = config.api.playmix.replace('<TOKEN>', token).replace('<MIXID>', mix.id);
            log.trace("play url", playUrl);
            request.get(playUrl, function(err, res, body) {
                if(err) return cb(err);
                var data = JSON.parse(body);
                //log.trace(data);
                mix.addTrack(new Track(data.set.track));
                log.trace("track : ", mix.cnt+". "+data.set.track.name);
                return cb(null);
            })
        },
        function(cb) {
            var skipMixCB = function(err, isLast) {
                if(err) return cb(err);
                if(isLast)
                    return cb(err);
                return skipMix(mix, token, skipMixCB);
            }
            skipMix(mix, token, skipMixCB);
        }
    ], function(err) {
        if(err) log.error("error while playing mix", err);
        return done(err);
    })
}

function skipMix(mix, token, done) {
    var nextUrl = config.api.nextmix.replace('<TOKEN>', token).replace('<MIXID>', mix.id);

    var skipUrl = config.api.skipmix.replace('<TOKEN>', token).replace('<MIXID>', mix.id);
    //log.trace("call for skip", nextUrl);
    request.get(nextUrl, function(err, res, body) {
        if(err) return done(err);
        var data = JSON.parse(body);
        if(_.has(data, 'set')) {
            mix.addTrack(new Track(data.set.track));
            log.trace("track : ", mix.cnt+". "+data.set.track.name);

            return done(null, data.set.at_last_track)
        }
        else {
            log.trace("waiting for 45 secs...");
            //return done(null, true);
            setTimeout(function() {
                return done(null, false);
            }, waitTime * 1000);
        }
    })
}

function downloadMix(mix, done) {
    log.trace(config.dir, mix.name);
    mix.path = require('path').join(config.dir, mix.name);

    require('mkdirp')(mix.path, function(err) {
        if(err)
            return done(err);
        async.mapLimit(mix.tracks, parallelLimit, function(track, cb) {
            log.trace("Downloading ", track.name +" | "+track.performer);
            var retries = 0;
            var handler = function(err, res) {
                if(err) {
                    if(retries++ < retryLimit) return trackDownload(track, mix.path, handler);
                    else return cb(err);
                }
                else {
                    if(res)
                        return cb(null, track);
                    else
                    if(retries++ < retryLimit) return trackDownload(track, mix.path, handler);
                    else return cb(new Error("Track : "+track.name+" download failed."));
                }
            };
            trackDownload(track, mix.path, handler);
        }, function(err, res) {
            return done(err, res);
        });
    });
}

function trackDownload(track, mixPath, done) {
    var filePath = require('path').join(mixPath, track.pos+"-"+track.name+"-"+track.performer);
    request.get(track.link).pipe(fs.createWriteStream(filePath+".tmp")).on('error', function(err) {
        log.error(err);
        return done(err);
    }).on('finish', function() {

        var src = (filePath+".tmp").replace(/\ /g, '\\ ');
        var dest = (filePath+".mp3").replace(/\ /g, '\\ ');
        //remove any existing file
        if(fs.existsSync(filePath+".mp3"))
            fs.unlinkSync(filePath+".mp3");

        var p = process.exec("/usr/bin/ffmpeg -i "+src+" "+dest, function(err, stdout, stderr) {
            //log.trace("error", err);
            //log.trace("stdout", stdout);
            //log.trace("stderr", stderr);
        });
        p.on('exit', function(code) {
            fs.unlinkSync(filePath+".tmp");
            log.trace("Download complete : ", filePath+".mp3");
            if(code == 0)
                return done(null, true);
            else
                return done(Error("error while converting to mp3"));
        });
    });
}

function Mix(data) {
    this.data = data;
    this.id = this.data.mix.id;
    this.tracks = [];
    this.cnt = 0;
    this.name = this.data.mix.name.replace(/[^\w\s]/gi, '');
}

Mix.prototype.addTrack = function(track) {
    //log.trace("track : ", track);
    track.pos = ++this.cnt;
    this.tracks.push(track);
}

function Track(data) {
    this.data = data;
    this.link = data.track_file_stream_url;
    this.name = data.name.replace(/[^\w\s]/gi, '');
    this.performer = data.performer.replace(/[^\w\s]/gi, '');
    this.pos = -1;
}