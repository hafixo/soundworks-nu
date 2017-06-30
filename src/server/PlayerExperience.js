import * as soundworks from 'soundworks/server';
import * as Nu from './Nu';

// required in initAudioFileTree():
const dirTree = require('directory-tree');
const fs = require('fs');

// server-side experience.
export default class PlayerExperience extends soundworks.Experience {
  constructor(clientType) {
    super(clientType);

    // require services
    this.checkin = this.require('checkin');
    this.sharedConfig = this.require('shared-config');
    this.sharedConfig.share('setup', 'player'); // share `setup` entry to players
    this.sharedConfig.share('socketIO', 'player'); // share `socketIO` entry to players
    this.params = this.require('shared-params');
    this.audioBufferManager = this.require('audio-buffer-manager');
    this.syncScheduler = this.require('sync-scheduler');
    this.sync = this.require('sync');
    this.osc = this.require('osc');
    var protocol = [ 
      { channel: 'nuStream', type: 'Float32' },
      { channel: 'nuRoomReverb', type: 'Float32' },
      { channel: 'nuPath', type: 'Float32' },
      { channel: 'nuOutput', type: 'Float32' },
      ];
    this.rawSocket = this.require('raw-socket', { protocol: protocol });

    // bind methods
    this.checkinController = this.checkinController.bind(this);

    // local attributes
    this.playerMap = new Map();
    this.coordinatesMap = new Map();
    this.controllerMap = new Map();
  }

  start() {
    // init Nu modules
    Object.keys(Nu).forEach( (nuClass) => {
      this['nu' + nuClass] = new Nu[nuClass](this);
    });
    // init audio file json description for audioBufferManager
    this.initAudioFileTree();
  }

  enter(client) {
    super.enter(client);

    switch (client.type) {
      case 'player':

        // update local attributes
        this.playerMap.set( client.index, client );

        // update nu modules
        Object.keys(Nu).forEach( (nuClass) => {
          this['nu' + nuClass].enterPlayer(client);
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

        // update Nu modules
        Object.keys(Nu).forEach( (nuClass) => {
          this['nu' + nuClass].exitPlayer(client);
        });

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

  // automatically update audioFile.js (shared client) file to describe the content of the public/sounds directory
  // (flattened), imported in client to use with the audioBufferLoader. Allows for name-based audio files
  // definition in MaxMSP (rather than with numbers)
  initAudioFileTree(){
    // extract directory audio files to tree
    const tree = {};
    const filteredTree = dirTree('./public/sounds/', { extensions: /\.wav|\.mp3/ }, (item, path) => { 
      // assign elmt to tree (reduce structure to zero-depth tree for easy access)
      let name = item.name.replace(' ', '_').split('.')[0];
      tree[name] = item.path.replace('public/', '');
    });
    // write flattened tree in audioFiles.js
    let str = "export default " + JSON.stringify(tree);
    fs.writeFile('./src/client/shared/' + 'audioFiles.js', str, (err) => {
        if(err) return console.log(err);
    });
  }

}