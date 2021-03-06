// express and sockets setup
var express = require("express");
var http = require('http');
var app = express();
var port = process.env.PORT || '/tmp/fp-nico.sock';

app.use(express.static(__dirname + '/assets'));
app.get('/', function(request, response) {
	response.sendfile('./assets/index.html');
});

app.get('/sina', function(req, res){
    var access_token = req.param('access_token');
    res.send("<script>window.parent.ExternalUI.sina_login_callback('" + access_token + "');</script>");
//    http.get('http://auth.bangbang93.com/sina/info.php?mode=user_info&access_token=' + access_token, function(response){
//        var size = 0;
//        var chunks = [];
//        response.on('data', function(chunk){
//            size += chunk.length;
//            chunks.push(chunk);
//        });
//        response.on('end', function(){
//            var data = Buffer.concat(chunks, size).toString();
////            console.log(data);
//            data = JSON.parse(data);
//            res.send("<script>window.parent.ExternalUI.sina_login_callback('" + data.name + "');</script>");
//        });
//    })
});

app.get('/login_proxy/:access_token', function(req, res) {
    var access_token = req.param('access_token');
    http.get('http://auth.bangbang93.com/sina/info.php?mode=user_info&access_token=' + access_token, function (response) {
        var size = 0;
        var chunks = [];
        response.on('data', function (chunk) {
            size += chunk.length;
            chunks.push(chunk);
        });
        response.on('end', function () {
            var data = Buffer.concat(chunks, size).toString();
//        console.log(data);
            data = JSON.parse(data);
            res.send(data);
        });
    });
});
process.umask('0000');
var io = require('socket.io').listen(app.listen(port));
process.umask('0002');
console.log("Listening on port " + port);

// custom modules
var client_module = require("./client_module");
var pipe_module = require("./pipe_module");

// third party modules
var moment = require('moment');

// services
var state_clean_up_service;
var refresh_client_list_service;
var refresh_client_score_service;

// sockets event listening
io.sockets.on('connection', function (socket) {
	socket.on('register-request', function (data) {
        var new_client = client_module.add_new(data, null);

        if (new_client !== false) {
            var return_package = { client_id : new_client.id, username : new_client.username, clients : client_module.all }
            socket.emit('register-success-response', return_package);
        } else {
            socket.emit('register-failure-response', null);
        }
	});

    socket.on('pipe-request', function (data) {
    	socket.emit('pipe-response', { pipe : pipe_module.get_pipe(data), pipe_id : data } );
    });

    socket.on('pipe-death-counter-request', function (data) {
        var return_package = [];

        for (var i = 0; i < data.length; i++) {
            return_package.push({ index : data[i],
                death_counter : pipe_module.get_pipe(data[i]).death_counter });
        }

        socket.emit('pipe-death-counter-response', return_package);
    });

    //asking for all the birds
    socket.on('sync-request', function(data) {
    	socket.emit('sync-response', client_module.generate_client_package(data));
    }); 

    //game start to initialize game start timestamp for bird
    socket.on('start-game', function(data) {
        if (!client_module.client_exists(data.client_id)) client_module.add_new(data.username, data.client_id);

        if (client_module.client_exists(data.client_id)) client_module.all[data.client_id].start_game_timestamp = new Date().getTime();
    });

    //on bird jump, re-emit
    socket.on('bird-jump', function(data){
    	io.sockets.emit('bird-jumped', data);
    });

    socket.on('bird-death-request', function(data){
        pipe_module.get_pipe(data.client_score).death_counter++;
        var client = client_module.all[data.client_id];
        client.start_game_timestamp = null;
        client.update_state("IDLE");
    	io.sockets.emit('bird-death-response', data.client_id);
    });

    socket.on('client-update', function(data) {
        if (!client_module.client_exists(data.client_id)) client_module.add_new(data.username, data.client_id);

        if (client_module.client_exists(data.client_id)) {
            var client = client_module.all[data.client_id];

            if (typeof data.state !== "undefined") client.update_state(data.state);
            else client.update_state();

            if (typeof data.score !== "undefined") client.update_score(data.score);

//            console.log("STATE: " + client.state);
        }
    });

    refresh_client_list_service = setInterval(function () {
        io.sockets.emit('client-list-response', client_module.all);
    }, 3000);

    refresh_client_score_service = setInterval(function () {
        io.sockets.emit('client-score-response', client_module.all);
    }, 1000);
});

state_clean_up_service = setInterval(client_module.scan_states, 1000);