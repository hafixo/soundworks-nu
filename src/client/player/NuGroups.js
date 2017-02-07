/**
 * NuGroup: Nu module to assign audio tracks to groups of players
 **/

import NuBaseModule from './NuBaseModule'
import * as soundworks from 'soundworks/client';

const client = soundworks.client;
const audioContext = soundworks.audioContext;

export default class NuGroups extends NuBaseModule {
  constructor(soundworksClient) {
    super(soundworksClient, 'nuGroups');

    // local attributes
    this.groupMap = new Map();
    this.localGain = audioContext.createGain();
    this.localGain.gain.value = 1.0;
    this.localGain.connect( this.soundworksClient.nuOutput.in );

    // binding
    this.onOff = this.onOff.bind(this);
    this.volume = this.volume.bind(this);
    this.localVolume = this.localVolume.bind(this);
    this.linkPlayerToGroup = this.linkPlayerToGroup.bind(this);
    this.loop = this.loop.bind(this);
    this.getGroup = this.getGroup.bind(this);
  }

  paramCallback(name, args){
    let playerId = args.shift();
    // discard if msg doesn't concern current player
    if( playerId !== client.index && playerId !== -1 ){ return; }
    // either route to internal function
    if( this[name] !== undefined )
      if( args.length == 2 ) this[name](args[0], args[1]);
      else this[name](args[0]);
    // or to this.params value
    else
      this.params[name] = args;
  }

  onOff(groupId, value) {

    // get group
    let group = this.getGroup( groupId );

    // stop group (src)
    if( value === 0 ){
        // stop source 
        group.src.stop(0);
        // notify renderer we don't need it anymore
        this.soundworksClient.renderer.disable();
      }
    // start group (src)
    else{
      // get time delay since order to start has been given
      let timeOffset = this.soundworksClient.scheduler.syncTime - value;
      // modulo buffer length for slow / late connected players 
      timeOffset %= group.src.buffer.duration;
      // start source at group time
      group.src.start(audioContext.currentTime, timeOffset);
      // remember start time
      group.startTime = value;
      // schedule loop
      // if( group.src.loop )
      //   group.src.src.onended = () => { 
      //     group.src.start();
      //   };
      // notify parent +1 source here to enable visual feedback on sound amplitude
      this.soundworksClient.renderer.enable();
    }      
  }

  // TODO: a player not in a group shouldn't play its sound as happends now with above on/off
  // function. Rather, only when both on/off and linked are ok should player start to play.
  // this would require a sync. mechanism with groups already started when linked to player.
  linkPlayerToGroup(groupId, value){
    // get group
    let group = this.getGroup( groupId );
    // apply value
    group.linkGain.gain.value = value;
  }

  volume(groupId, value){
    // get group
    let group = this.getGroup( groupId );
    // set group value
    group.gain.gain.value = value;
  }

  localVolume(value){
    // set local value
    this.localGain.gain.value = value;
  }

  time(groupId, value){
    console.log('time function not implemented yet (in NuGroup.js)');
  }

  loop(groupId, value){
    // get group
    let group = this.getGroup( groupId );
    // set group value
    group.src.loop = value;
  }

  getGroup(groupId) {
    // get already existing group
    if( this.groupMap.has(groupId) )
      return this.groupMap.get(groupId);

    // check if audio buffer associated to group exists
    let buffer = this.soundworksClient.loader.audioBuffers.default[groupId];
    if (buffer === undefined) {
      console.warn('required audio file id', groupId, 'not in client index, actual content:', this.soundworksClient.loader.options.files, '-> initializing empty audio source..');
      buffer = audioContext.createBuffer(1, 22050, 44100);
    }

    // create new group
    let group = { time: 0, startTime: 0 };

    // create new audio source 
    group.src = new AudioSourceNode(buffer);

    // create group gain
    group.gain = audioContext.createGain();
    group.gain.gain.value = 0.0;

    // create group-player link gain
    group.linkGain = audioContext.createGain();
    group.linkGain.gain.value = 1.0;    

    // connect graph
    group.src.out.connect(group.gain);
    group.gain.connect(group.linkGain);
    group.linkGain.connect(this.localGain);
    // console.log('connect source', groupId, 'to local gain', this.localGain);
    // store new group in local map
    this.groupMap.set(groupId, group);

    // return created group
    return group;
  }

  fadeGainTo(gainNode, targetValue, fadeTime){
    // reset eventual planned changes
    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    if( fadeTime > 0 ){
      // let currentValue = gainNode.gain.value;
      gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(targetValue, audioContext.currentTime + fadeTime);
      // console.log('fade in / out from', gainNode.gain.value, 'to', targetValue, 'in', fadeTime, 'sec');
    }
    else{
      gainNode.gain.setValueAtTime(targetValue, audioContext.currentTime);
    }
  }

}


class AudioSourceNode {
  constructor(buffer){

    this.out = audioContext.createGain();
    this.out.gain.value = 1.0;

    this.buffer = buffer;
    this.src = this.getNewSource();
    this._loop = 0;

  }

  start(time = 0, offset = 0){
    // stop eventual old source
    this.stop(0);
    // create new source
    this.src = this.getNewSource();
    // start source
    this.src.start(time, offset);
  }

  stop(time = 0){
    try{
      this.src.stop(time);
    }
    catch(e){
      if( e.name !== 'InvalidStateError'){ console.error(e); }
    }
  }

  set loop(value){
    this._loop = value;
    this.src.loop = value;
  }

  get loop(){
    return this._loop;
  }

  getNewSource(){
    // create source
    let src = audioContext.createBufferSource();
    // fill in buffer
    src.buffer = this.buffer;
    // set src attributes
    src.loop = this._loop;
    // connect graph
    src.connect(this.out);
    return src;
  }
}




