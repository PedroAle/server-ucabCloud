// ******* VARIABLES GLOBALES DEL SERVIDOR ********* //
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server); // Abro el socket escuchando dentro del servidor
var _ = require('lodash');
var fs = require('fs-extra');
var json_users = JSON.parse(fs.readFileSync('users_registered.json'));
var json_files = JSON.parse(fs.readFileSync('files_uploaded.json'));
var input_iniciar_partida = process.stdin;
input_iniciar_partida.setEncoding('utf-8'); // Permites caracteres especiales
// ******* VARIABLES GLOBALES DEL SERVIDOR ********* //

app.set('port', 3000);

var clientes = []; // Arreglo donde se encontraran todos los clientes conectados

// Usuario actual
var currentUser = {
    firsname: "",
    lastname: "",
    name: "",
    password: ""
};

var currentFile = {
    name: "",
    type: "",
    folder: "",
    username: ""
}

var files = {}, 
    struct = { 
        name: null, 
        type: null, 
        size: 0, 
        data: []
    };

(function () {
  "use strict";

  var fs = require('fs')
    , util = require('util')
    ;

  fs.copy = function (src, dst, cb) {
    function copy(err) {
      var is
        , os
        ;

      if (!err) {
        return cb(new Error("File " + dst + " exists."));
      }

      fs.stat(src, function (err) {
        if (err) {
          return cb(err);
        }
        is = fs.createReadStream(src);
        os = fs.createWriteStream(dst);
        util.pump(is, os, cb);
      });
    }

    fs.stat(dst, copy);
  };

  fs.move = function (src, dst, cb) {
    function copyIfFailed(err) {
      if (!err) {
        return cb(null);
      }
      fs.copy(src, dst, function(err) {
        if (!err) {
          // TODO 
          // should we revert the copy if the unlink fails?
          fs.unlink(src, cb);
        } else {
          cb(err);
        }
      });
    }

    fs.stat(dst, function (err) {
      if (!err) {
        return cb(new Error("File " + dst + " exists."));
      }
      fs.rename(src, dst, copyIfFailed);
    });
  };
}());

io.on('connection', function (socket) {
  io.emit('this', { will: 'be received by everyone'});

  socket.on('private message', function (from, msg) {
    console.log('I received a private message by ', from, ' saying ', msg);
  });

  socket.on('disconnect', function () {
    io.emit('user disconnected');
  });
});

// Pull de eventos que se ejecutaran dentro del socket
io.on('connection', function (socket) {

    var verified = {
        authorized: false,
        name: ""
    }

    var length_clients = Object.keys(socket.nsp.server.eio.clients).length;

    /*****************************************************************
    *     Socket para manejar el inicio de sesión de un usuario      *
    ******************************************************************/
    socket.on('USER_LOGIN', function (data) {

        currentUser = _.filter(json_users.users, function (user) {
            return user.name === data.name;
        })[0];

        if (!currentUser) {
            console.log("El usuario no se encuentra registrado.");
            /* verified.authorized = false;
            socket.emit('USER_LOGGED', verified); */
        }else if (currentUser.password === data.password) {
            console.log("Se conecto");
            socket.emit('USER_LOGGED', data);

        } // Los passwords son diferentes, no se pudo loguear
        else {
            console.log("El password recibido es incorrecto.");
            /* socket.emit('USER_LOGGED', verified); */
        }
    });


    /*****************************************************************
    *     Socket para manejar el registro de sesión de un usuario    *
    ******************************************************************/
    socket.on('USER_REGISTER', function (data) {
        currentUser = _.filter(json_users.users, function (user) {
            return user.name === data.name;
        })[0];

        if (!currentUser) {
            json_users.users.push(data);
            var stringify = JSON.stringify(json_users);
            fs.mkdir('cloud/' + data.name, function(e){});
            fs.writeFile('users_registered.json', stringify, function (err) {
                if (err) {
                    console.log("Ocurrio un error guardando el usuario en el JSON");
                }
                console.log("El usuario fue registrado exitosamente.");
            })
            socket.emit("USER_REGISTERED", data);
        }
        else {
            console.log("El usuario ", data.name, " ya se encuentra registrado.");
        }
    });

    /*****************************************************************
    *     Socket para manejar el cierre de sesión de un usuario      *
    ******************************************************************/
    socket.on("USER_LOGOUT", function (data) {
        // Quito de las lista de clientes el jugador que se está desconectando
        var _clientes = _.filter(clientes, function (jugador) {
            return jugador.name !== data.name
        });
        // Se quito el usuario de la lista de clientes logueados
        if (_clientes.length < clientes.length) {
            console.log("El usuario", capitalizeFirstLetter(data.name), "cerro sesión exitosamente");
            clientes = _clientes;
            socket.emit("USER_LOGGEDOUT", { "logout": true });
        }
        else {
            socket.emit("USER_LOGGEDOUT", { "logout": false });
        }
    })

    socket.on('upload', (data) => { 

        var myString = data.name;
        var dotPosition = myString.indexOf(".");
        var filename = myString.substring(0, dotPosition);
        var type = myString.substring(dotPosition + 1, myString.length);

        currentFile = _.filter(json_files.files, function (file) {
            return file.name === filename && file.username == data.userName && file.type == type;
        })[0];

        if(!currentFile){
            newFile = {
                name: filename,
                type: type,
                folder: "",
                data: data.data,
                username: data.userName
            }

            json_files.files.push(newFile);
            var stringify = JSON.stringify(json_files);
            fs.writeFile('files_uploaded.json', stringify, function (err) {
                if (err) {
                    console.log("Ocurrio un error guardando el archivo en el JSON");
                }
                socket.emit('getFiles', {username: data.userName, folder: ''})
                console.log("El archivo fue guardado exitosamente.");
            })

            if (!files[data.name]) { 
                files[data.name] = Object.assign({}, struct, data); 
                files[data.name].data = []; 
            }
            
            //convert the ArrayBuffer to Buffer 
            data.data =  Buffer.from(new Uint8Array(data.data)); 
            //save the data 
            files[data.name].data.push(data.data); 
            files[data.name].slice++;
    
            var fileBuffer = Buffer.concat(files[data.name].data); 
                
            fs.writeFile('cloud/' + data.userName + '/' + data.name, fileBuffer, (err) => { 
                
                delete files[data.name]; 
                if (err) return socket.emit('error'); 
                socket.emit('uploaded');
                
            });
        }else {
            console.log("El archivo ", filename, " ya se encuentra guardado.");
        }
        
    });

    socket.on('download', function (data) {

        if(data.folder === ""){
            var file = fs.readFileSync('cloud/' + data.name + '/' + data.filename + '.' + data.type);
            socket.emit('fileReceived', {file: file}, {filename: data.filename, type: data.type});
        } else {
            var file = fs.readFileSync('cloud/' + data.name + '/' + data.folder + '/' + data.filename + '.' + data.type);
            socket.emit('fileReceived', {file: file}, {filename: data.filename, type: data.type});
        }
        
        /* currentFile = _.filter(json_files.files, function (file) {
            return file.name === data.filename && file.username == data.name && file.type == type;
        })[0];
        socket.emit('fileReceived', { name: data.name, data: currentFile.data }) */
        /* console.log("Llegueeeee", __dirname + '/cloud/' + data.name + '/' + data.filename)
        var file = fs.createReadStream( 'cloud/' + data.name + '/' + data.filename /* __dirname + '/cloud/' + data.name + '/' + data.filename *//* ) */
        
    });

    socket.on('folder', function (data) {
        console.log(data.name);
        

        if(data.name !== null){
            currentFile = _.filter(json_files.files, function (file) {
                return file.name === data.name && file.username == data.username && file.type == data.type;
            })[0];

            if(!currentFile){
                newFile = {
                    name: data.name,
                    type: data.type,
                    folder: "",
                    data: data.data,
                    username: data.username
                }

                json_files.files.push(newFile);
                var stringify = JSON.stringify(json_files);
                fs.writeFile('files_uploaded.json', stringify, function (err) {
                    if (err) {
                        console.log("Ocurrio un error creando la carpeta en el JSON");
                    }
                    console.log("La carpeta fue creada exitosamente.");
                    
                })
                fs.mkdir('cloud/' + data.username + '/' + data.name, function(e){});
            } else {
                console.log('La carpeta ya existe');
            }
            socket.emit('uploaded');
        }
        
    })

    socket.on('move', function (data) {

        folderExist = _.filter(json_files.files, function (file) {
                return file.name === data.folder;
        });

        if(folderExist.length > 0){

            result = _.filter(json_files.files, function (file) {
                return file.name != data.name;
            });
          
            json_files.files = result;
            fs.writeFile('files_uploaded.json', JSON.stringify(json_files), function(err){
                if(err) throw err;
            });

            newFile = {
                name: data.name,
                type: data.type,
                folder: data.folder,
                data: data.data,
                username: data.user
            }

            json_files.files.push(newFile);
            var stringify = JSON.stringify(json_files);
            fs.writeFile('files_uploaded.json', stringify, function (err) {
                if (err) throw err;
            });
        }
        
        fs.move('cloud/' + data.user + '/' + data.name + '.' + data.type, 'cloud/' + data.user + '/' + data.folder + '/' + data.name + '.' + data.type, function (err) {
            if (err)
                console.error(err);
        });
        socket.emit('uploaded');
    })

    socket.on('getFiles', function (data) {
        var userFiles = _.filter(json_files.files, function (file) {
            return file.username === data.username && file.folder === '';
        });

        console.log(userFiles)

        if(userFiles.length >= 0){
            console.log("llegue");
            
            socket.emit("userFiles", userFiles);
        }else {
            socket.emit("noFiles");
        }
    });

    socket.on('getFilesFolder', function (data) {
        var userFiles = _.filter(json_files.files, function (file) {
            return file.username === data.user && file.folder === data.folder;
        });

        console.log(userFiles)

        if(userFiles.length >= 0){
            socket.emit("userFilesFolder", userFiles);
        }else {
            socket.emit("noFiles");
        }
    });

    socket.on('deleteFile', function (data) {

        if(data){
            console.log("DATAAAAA", data);
            
           
            
            if(data.type == 'folder'){
                final = _.filter(json_files.files, function (file) {
                    return file.name != data.name && file.folder != data.name;
                });
                
                json_files.files = final;
                fs.writeFile('files_uploaded.json', JSON.stringify(json_files), function(err){
                    if(err) throw err;
                });
                var filePath = 'cloud/' + data.username + '/' + data.name; 
                fs.removeSync(filePath);
            } else {
                result = _.filter(json_files.files, function (file) {
                    return file.name != data.name;
                });
            
                json_files.files = result;
                fs.writeFile('files_uploaded.json', JSON.stringify(json_files), function(err){
                    if(err) throw err;
                });

                if(data.folder === ''){
                    var filePath = 'cloud/' + data.username + '/' + data.name + '.' + data.type; 
                    fs.unlinkSync(filePath);
                } else {
                    var filePath = 'cloud/' + data.username + '/' + data.folder + '/' + data.name + '.' + data.type; 
                    fs.unlinkSync(filePath);
                }
            }
            
            
            
        }
        
    });

    socket.on('getUsers', function (data) {
        var usersOn = _.filter(json_users.users, function (user) {
            return user.name !== data.username;
        });

        if(usersOn.length >= 0){
            socket.emit("usersOn", usersOn);
        }else {
            socket.emit("noFiles");
        }
    });

    socket.on('deleteUser', function (data) {
        var userOn = _.filter(json_users.users, function (user) {
            return user.name !== data.name;
        });

        var filesOn = _.filter(json_files.files, function (file) {
            return file.username !== data.name;
        });

        json_files.files = filesOn;
        fs.writeFile('files_uploaded.json', JSON.stringify(json_files), function(err){
            if(err) throw err;
        });

        json_users.users = userOn;
        fs.writeFile('users_registered.json', JSON.stringify(json_users), function(err){
            if(err) throw err;
        });

        var filePath = 'cloud/'+ data.name; 
        fs.removeSync(filePath);

        console.log(userOn)
        console.log(filesOn)
    })

    /*****************************************************************
    *             Socket para obtener el usuario actual              *
    ******************************************************************/
    socket.on("GET_CURRENT_USER", function () {
        socket.emit("GET_CURRENTED_USER", clientes[clientes.length - 1]);
    })
});

// Levanto el servidor con Express
server.listen(app.get('port'), function () {
    console.log("Server is running on port: ", app.get('port'));
});