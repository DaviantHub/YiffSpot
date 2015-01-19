var express = require('express');
var app     = express();
var server  = require('http').createServer(app);
var io      = require('socket.io')(server);
var string  = require('string');
var port    = process.env.PORT || 3000;

app.enable('trust proxy');

// Routes
app.use('/assets', express.static(__dirname + '/public/assets'));

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/humans.txt', function(req, res) {
  res.sendFile(__dirname + '/public/humans.txt');
});

var activeServer = server.listen(port);

// Chat Server
var pendingUsers  = [];
var clients       = {};
var usersOnline   = 0;

/**
 * Handles the connection of a user.
 */
io.sockets.on('connection', function(socket)
{
  clients[socket.id] = socket;

  usersOnline++;

  io.sockets.emit('update user count', usersOnline);

  console.log('User Connected! Total Users Online: %d', usersOnline);

  /**
   * Handles connecting two users together for a yiffing session.
   * @param  Object preferences The yiffing preferences of the user.
   */
  socket.on('find partner', function (preferences) {
    // Delete any existing match   
    if (socket.partner) {
      socket.broadcast.to(socket.partner.socketId).emit('partner disconnected');

      // Disconnect user from partner.
      delete clients[socket.partner.socketId].partner;

      // Disconnect partner from user.
      delete socket.partner;
    }

    var user = {
      socketId: socket.id,
      info: preferences
    };
    var partner;
    var partnerSocket;

    // If user submitted any blank values, do not search for anything.
    if(user.info[0].gender === '' || user.info[1].species === '' || !user.info[3].matchGender ||
      !user.info[4].matchSpecies || !user.info[2].kinks) {
      return false;
    }

    // Look for a partner to yiff with in the list of pending users
    for (var i = 0; i < pendingUsers.length; i++) {
      var tmpUser = pendingUsers[i];

      // Make sure our previous partner is not our new partner and is not ourselves
      if (socket.partner != tmpUser && socket.id != tmpUser.socketId) {

        // Check if user and partner are interested in each other's genders.
        if((user.info[3].matchGender.indexOf(tmpUser.info[0].gender) !== -1 || user.info[3].matchGender[0] == 'any') &&
          (tmpUser.info[3].matchGender.indexOf(user.info[0].gender) !== -1 || tmpUser.info[3].matchGender[0] == 'any')) {

          // Check if user and partner are capable on species preferences.
          if((user.info[4].matchSpecies.indexOf(tmpUser.info[1].species) !== -1 || user.info[4].matchSpecies[0] == 'any') &&
            (tmpUser.info[4].matchSpecies.indexOf(user.info[1].species) !== -1 || tmpUser.info[4].matchSpecies[0] == 'any')) {

            // Check if user and partner share at least one similiar kink.
            if((user.info[2].kinks[0] == 'any' || tmpUser.info[2].kinks[0] == 'any') ||
                similiarKinks(user.info[2].kinks, tmpUser.info[2].kinks, 1)) {

              // Get the socket client for this partner
              partnerSocket = clients[tmpUser.socketId];

              // Remove the partner we found from the list of users looking for a partner
              pendingUsers.splice(i, 1);

              // If the partner we found exists / hasn't disconnected
              if (partnerSocket) {
                partner = tmpUser;

                socket.emit('partner connected', {
                  gender: partner.info[0].gender,
                  species: partner.info[1].species,
                  kinks: partner.info[2].kinks.join(", ")
                });

                break;
              }
            }
          }
        }
      }
    }

    // User found a partner
    if (partner) {
      // Match user and partner as yiffing partners
      socket.partner = partner;
      partnerSocket.partner = user;

      // Remove user and partner from pending users
      socket.inlist = false;
      partnerSocket.inlist = false;

      // Inform partner of match
      socket.broadcast.to(partner.socketId).emit('partner connected', {
        gender: user.info[0].gender,
        species: user.info[1].species,
        kinks: user.info[2].kinks.join(", ")
      });
    } else {
      // Add user to pending users list
      if (!socket.inlist) {
        socket.inlist = true;
        pendingUsers.push(user);
      }

      // Inform the user that the system is still looking for a match
      socket.emit('no match');
    }
  });


  /**
   * Handles sending a message to the user's partner.
   * @param  String message The message to send.
   */
  socket.on('send message', function(message) {
    var partner = socket.partner;
    var msg = string(message).stripTags().s;

    if(!partner)
      return false;

    socket.broadcast.to(partner.socketId).emit('receive message', { message: msg });
  });


  /**
   * Handles the disconnection of a user.
   */
  socket.on('disconnect', function() {
    var partner = socket.partner;

    // Check if user has a partner
    if (partner) {
      // Disconnect user from partner.
      delete clients[partner.socketId].partner;

      socket.broadcast.to(partner.socketId).emit('partner disconnected');
    }

    // Remove disconnected user from clients list
    delete clients[socket.id];

    usersOnline--;

    io.sockets.emit('update user count', usersOnline);

    console.log('User Disconnected! Total Users Online: %d', usersOnline);
  });
});

/**
 * Checks if the user and partner share a number of similiar kinks.
 * @param  Object userKinks     The user's kink preferences.
 * @param  Object partnerKinks  The partner's kink preferences.
 * @param  Integer similiarities The number of similar kinks to have to give a valid result.
 * @return Boolean
 */
function similiarKinks(userKinks, partnerKinks, similarities) {
  var similar = 0;

  for (var i = 0; i < userKinks.length; i++) {
    if (partnerKinks.indexOf(userKinks[i]) !== -1)
      similar++;

    if (similar >= similarities)
      return true;
  }

  return false;
}

console.log('YiffSpot is online and listening on port %d.', port);
