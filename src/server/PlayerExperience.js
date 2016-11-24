import * as soundworks from 'soundworks/server';

import RawSocketStreamer from './RawSocketStreamer';
import NuRoomReverb from './NuRoomReverb';
import NuGroups from './NuGroups';
import NuPath from './NuPath';
import NuLoop from './NuLoop';

const server = soundworks.server;

// server-side 'player' experience.
export default class PlayerExperience extends soundworks.Experience {
  constructor(clientType) {
    super(clientType);

    // require services
    this.checkin = this.require('checkin');
    this.sharedConfig = this.require('shared-config');
    this.sharedConfig.share('setup', 'player'); // share `setup` entry to ... (crashes else)
    this.sharedConfig.share('socketIO', 'player'); // share `setup` entry to ... (crashes else)
    this.params = this.require('shared-params');
    this.sync = this.require('sync');
    this.osc = this.require('osc');

    // bind methods
    this.initOsc = this.initOsc.bind(this);
    this.checkinController = this.checkinController.bind(this);

    // local attributes
    this.playerMap = new Map();
    this.coordinatesMap = new Map();
    this.controllerMap = new Map();
  }

  start() {

    // setup dedicated websocket server (to handle IR msg: avoid to flood main communication socket)
    this.rawSocketStreamer = new RawSocketStreamer(8080);

    // init Nu modules
    this.nuRoomReverb = new NuRoomReverb(this);
    this.nuGroups = new NuGroups(this);
    this.nuPath = new NuPath(this);
    this.nuLoop = new NuLoop(this);

    // init OSC callbacks
    this.initOsc();
  }

  enter(client) {
    super.enter(client);

    switch (client.type) {
      case 'player':

        // update local attributes
        this.playerMap.set( client.index, client );
        this.params.update('numPlayers', this.playerMap.size);

        // update nu modules
        this.nuRoomReverb.enterPlayer(client);
        this.nuGroups.enterPlayer(client);
        this.nuPath.enterPlayer(client);
        this.nuLoop.enterPlayer(client);

        // msg callback: receive client coordinates 
        // (could use local service, this way lets open for pos estimation in client in the future)
        this.receive(client, 'coordinates', (xy) => {
          this.coordinatesMap.set( client.index, xy );
          // update client pos in osc client
          this.osc.send('/nuMain/playerPos', [client.index, xy[0], xy[1]] );
        });

        break; 

      case 'controller':

        // add controller to local map (not using checkin for controllers)
        let clientId = this.checkinController(client);
        // indicate to OSC that controller 'client.index' is present
        this.osc.send('/nuController', [clientId, 'enterExit', 1]);
        // direct forward to OSC
        this.receive(client, 'osc', (header, args) => {
          // append controller index to msg
          let clientId = this.controllerMap.get(client);
          args.unshift(clientId);
          // forward to OSC
          this.osc.send(header, args);
        });

        break;
    }
  }

  exit(client) {
    super.exit(client);

    switch (client.type) {
      case 'player':

        // update local attributes
        this.playerMap.delete( client.index );
        this.coordinatesMap.delete( client.index );
        this.params.update('numPlayers', this.playerMap.size);
        // update modules
        this.nuPath.exitPlayer(client);
        // close client-associated socket
        this.rawSocketStreamer.close( client.index );
        // update osc mapper
        this.osc.send('/nuMain/playerRemoved', client.index );

        break;

      case 'controller':

        // update osc
        let clientId = this.controllerMap.get(client);
        this.osc.send('/nuController', [clientId, 'enterExit', 0]);
        // update local attributes
        this.controllerMap.delete(client);

        break;
    }    
  }

  // equivalent of the checkin service (to avoid using checkin on controllers and screwing players numbering)
  checkinController(client){
    let clientId = this.controllerMap.get(client);
    // if already defined, simply return clientId
    if( clientId !== undefined ){ return clientId; }
    // get occupied IDs
    let indexArray = Array.from( this.controllerMap, x => x[1] );
    clientId = -1; let testId = 0;
    while( clientId == -1 ){
      if( indexArray.indexOf(testId) == -1 )
        clientId = testId;
      testId += 1;
    }
    // store new client index
    this.controllerMap.set(client, clientId);
    // send client index to client
    this.send(client, 'checkinId', clientId);
    // return Id
    return clientId
  }

  // ------------------------------------------------------------------------------------------------
  // OSC Methods
  // ------------------------------------------------------------------------------------------------

  initOsc(){  

    // osc related binding
    this.updateRequest = this.updateRequest.bind(this);

    // general router towards internal functions when msg concerning the server (i.e. not player) is received
    this.osc.receive('/server', (msg) => {
      console.log(msg);
      // shape msg into array of arguments      
      let args = msg.split(' ');

      // check if msg concerns current Nu module
      if (args[0] !== 'nuMain') return;
      else args.shift();

      // call function associated with first arg in msg
      let functionName = args.shift();
      this[functionName](args);
    });  

    // automatically transfer player osc message 
    this.osc.receive('/player', (msg) => {
      let args = msg.split(' ');
      let moduleName = args.shift();
      this.broadcast('player', null, moduleName, args);
    });

    // send OSC client msg when server started 
    // (TOFIX: delayed in setTimeout for now because OSC not init at start.)
    setTimeout( () => { 
            // sync. clocks
      const clockInterval = 0.1; // refresh interval in seconds
      setInterval(() => { this.osc.send('/nuMain/clock', this.sync.getSyncTime()); }, 1000 * clockInterval);
    }, 1000);

  }

  updateRequest(){
    // send back players position at osc client request
    this.coordinatesMap.forEach((item, key)=>{
      this.osc.send('/nuMain/playerPos', [key, item[0], item[1]] );
    });
  }

}
