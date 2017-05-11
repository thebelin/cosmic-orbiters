// Send the socketio object in here
module.exports = (io) => {

  // Helper for sending to an array of sockets
  const Sender = (sockets, type, data) => sockets.forEach(socket => socket.emit(type, data));

  // Disconnection Routine
  const disconnect = (socket, sCol) => {
    console.log("Disconnected ", sCol);
    if (socket && socket.id && sockets[sCol].length) {
      // Remove the disconnected socket
      sockets[sCol] = sockets[sCol].filter(s => s.id != socket.id);
    }
    Sender(sockets.server, 'disconnection', socket.id);
  };

  // helper for managing the player arrays  
  const Players = {
    // For emitting individual player event data
    sendPlayer: (playerId, data) => {
      let index = this.playerIds.indexOf(playerId);
      if (index != -1) {
        this.playerSockets[index].emit('event', data);
      }
    },

    // Add method
    Add: (player, playerId, socket) => {
      this.players.push(player);
      this.playerIds.push(playerId);
      this.playerSockets.push(socket);
    },

    // Removal method
    Remove: playerId => {
      let index = this.playerIds.indexOf(playerId);
      if (index != -1) {
        this.players.splice(index, 1);
        this.playerIds.splice(index, 1);
        this.playerSockets.splice(index, 1);
      }
    },

    // Reset method
    Reset: () => {
      this.players = [];
      this.playerIds = [];
      this.playerSockets = [];
    }
  };

  // These will contain active sockets which need to be rebroadcast to
  let sockets = {
    // Track each server socket in here, to broadcast updates to
    server: [],

    // Track each admin socket in here, to broadcast updates to
    admin: [],

    // Track each stream socket here, to broadcast streams to
    stream: [],

    // Track each player here, to broadcast personal events to
    player: []
  };

  // The configuration of the current game
  this.currentGame = null;

  // The status of the current game
  this.gameStatus = null;

  // An array of logged in players of the current game
  this.players = [];

  // Their ids in an array
  this.playerIds = [];

  // the player sockets
  this.playerSockets = [];

// server Data
io
  .of('/server')
  .on('connection', socket => {
    // Add this connection to the sockets.server pool
    sockets.server.push(socket);
    console.log("New server %s COUNT: %s", socket.id, sockets.server.length);

    // This is a new connection
    Sender(sockets.admin, 'connection', sockets.server.length);
    
    // Subscribe to disconnect routines
    socket.on('disconnect', () => {
      disconnect(socket, "server");
      Sender(sockets.player, 'game', this.currentGame);
    });

    // Screen share from streaming server
    socket.on('screen', data => {
      Sender(sockets.stream, 'screen', {image: true, buffer: data.toString('base64')});
    });

    // Player event (goes to one player)
    socket.on('event', (playerId, eventType, eventData) => {
      Players.sendPlayer(playerId, {eventType: eventType, eventData: eventData});
    });

    // Game create event (store the game data, and send to all clients)
    socket.on('create', (gameData) => {
      gameData = JSON.parse(gameData);
      Players.Reset();
      this.currentGame = gameData;
      this.gameStatus = "created";

      // Tell all players that no one is logged in to the new game
      Sender(sockets.player, 'players', this.players);
      Sender(sockets.player, 'game', this.currentGame);
      Sender(sockets.admin, 'game', this.currentGame);

      console.log("create game", gameData);
    });
  });

  // Player state data
  io
    .of('/player')
    .on('connection', socket => {
      // This is a new player
      sockets.player.push(socket);

      // This is no longer a player
      socket.on('disconnect', () => {
        let socketId = socket.id.replace("/player#", "");
        Sender(sockets.server, 'playerDisconnect', socketId);
        disconnect(socket, "player");
        Players.Remove(socketId);
        Sender(sockets.player, "players", this.players);
      });
      
      // When the user connects, send them the this.currentGame
      socket.emit("game", this.currentGame);

      // Also send them information about the logged in players
      socket.emit("players", this.players);

      // Handle user login (selected callsign and color)
      socket.on('login', data => {
        let socketId = socket.id.replace("/player#", "");
        console.log("player login data", data);
        Players.Add(data, socketId, socket);

        // Add the user socket id to the data
        data = Object.assign({i: socketId}, data);

        // forward the data to the server
        Sender(sockets.server, 'login', data);

        // Tell all the other players about the new one
        Sender(sockets.player, 'players', this.players);

        // If the game is started, send a start event to the logged in player
        if (this.gameStatus == "started")
          socket.emit("start");
      });
    });

  // Controller data (received from the user, emit to display server)
  io
    .of('/controls')
    .on('connection', socket => {
      // The user pressed a button
      socket.on('button', data => {
        console.log("socket %s button data", socket.id, data);
        // Add the user socket id to the data
        data = Object.assign({i: socket.id.replace("/controls#", "")}, data);

        // forward the button data to the server
        Sender(sockets.server, 'button', data);
      });
    });

  // Stream view
  io
    .of('/stream')
    .on('connection', socket => {
      console.log("new streaming socket", socket.id);
      socket.on('disconnect', () => { disconnect(socket, "stream"); });

      // Add this connection to the sockets.stream pool
      sockets.stream.push(socket);
    });

  // Admin controller
  io
    .of('/secure')
    .on('connection', socket => {
      // Add an admin connection
      sockets.admin.push(socket);

      // Tell the admin the number of connections
      socket.emit('connection', sockets.server.count);

      // Send the admin the current game
      socket.emit('game', this.currentGame);

      // Administrator asked to create the server
      socket.on('create', data => {
        this.gameStatus = "created";
        console.log("admin create", data);
        Sender(sockets.server, 'create', data);
        Sender(sockets.player, 'create', data);
      });

      // Administrator asked to start the server
      socket.on('start', data => {
        this.gameStatus = "started";
        console.log("admin start", data);
        Sender(sockets.server, 'start', data);
        Sender(sockets.player, 'start', data);
      });

      // Admin asked to end the server
      socket.on('end', data => {
        this.gameStatus = "created";
        Sender(sockets.server, 'end', data);
        Sender(sockets.player, 'end', data);
      });
      
      socket.on('kick', data => Sender(sockets.server, 'kick', data));
  });
};