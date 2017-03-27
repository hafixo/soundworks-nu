/**
 * NuGrain: Granular synthesis (based on soundworks-shaker). An audio track is segmented
 * and segments are sorted by loudness. Segments are afterwards playing in a sequencer, 
 * the current active segment being selected based on shaking energy or OSC client sent 
 * energy.
 **/

import NuBaseModule from './NuBaseModule'

export default class NuGrain extends NuBaseModule {
  constructor(soundworksServer) {
    super(soundworksServer, 'nuGrain');

    // local attributes
    this.params = { 
      gain: 1.0, 
      audioFileId: 0, 
      enable: 0, 
      override: 1.0, 
      energy: 0, 
      randomVar: 1, 
      engineParams: {} 
    };

  }

  // reset granular engine on client's side (required e.g. to set tempo)
  reset(){
    // re-route to clients
    this.soundworksServer.broadcast( 'player', null, this.moduleName, ['reset'] );
  }  

  /**
  * had to redefine the enterPlayer method here to send a "reset" message once
  * all initial parameters were sent, to make sure the granular engine of the 
  * new player will indeed take into account said parameters
  **/
  enterPlayer(client){
    // send to new client information regarding current groups parameters
    Object.keys(this.params).forEach( (key) => {
      this.soundworksServer.send(client, this.moduleName, [key, this.params[key]] );
    });
    // reset granular engine to take preset values into account
    this.soundworksServer.send( client, this.moduleName, ['reset'] );
  } 

}

