// ******* VARIABLES GLOBALES DEL SERVIDOR ********* //
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var _ = require('lodash');
var fs = require('fs-extra');
var readline = require('readline-sync');
var json_users = JSON.parse(fs.readFileSync('users_registered.json'));
var json_files = JSON.parse(fs.readFileSync('files_uploaded.json'));
var io = require('socket.io-client').connect('http://localhost:3000');
var fs = require('fs');
// ******* VARIABLES GLOBALES DEL SERVIDOR ********* //

users = []

io.on('connect', function(socket){
    getUsuarios()
});

function getUsuarios() {
    io.emit("getUsers", {username: 'admin'});
    io.on('usersOn', data => {
        users = data;
    })
    setTimeout(function(){
        printTable()
        
    }, 1000)  
}

function printTable(){
    console.log("\nN•  Nombre   Apellido  Usuario\n")
    for(let i=0; i<users.length; i++){
        console.log(i + "- ", users[i].firstname + "  " + users[i].lastname + "  " + users[i].name)
    }
    setTimeout(function(){
        deleteUser()
    },1000)
}

function deleteUser(){
    var user = readline.question("\nIndique que usuario desea eliminar: (#) ");
    if (user >= users.length){
        console.log("\nUsuario Inexistente")
        //process.exit()
        deleteUser();
    } else {
        io.emit('deleteUser', {name: users[user].name})
    }
    getUsuarios();
}

