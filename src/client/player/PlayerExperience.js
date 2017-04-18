import * as soundworks from 'soundworks/client';

import NuRenderer from './NuRenderer';
import * as Nu from './Nu'

const audioContext = soundworks.audioContext;
const client = soundworks.client;

const viewTemplate = `
  <canvas id='main-canvas' class="background"></canvas>
  <div class="foreground">

    <div class="section-top flex-middle">
      <p id="text1" class="huge">  </p>
    </div>

    <div class="section-center flex-middle">
      <p id="text2" class="small"> </p>
    </div>

    <div class="section-bottom flex-center">
      <p id="text3" class="small soft-blink"> </p>
    </div>
    
  </div>
`;


/*
* The PlayerExperience script defines the behavior of default clients (of type 'player').
* Here it simply imports and instantiate all Nu modules.
*/

export default class PlayerExperience extends soundworks.Experience {
  constructor(assetsDomain, audioFiles) {
    super();

    // require soundworks services
    this.platform = this.require('platform', { features: ['web-audio'] });
    this.params = this.require('shared-params');
    this.sharedConfig = this.require('shared-config');
    this.sync = this.require('sync');
    this.checkin = this.require('checkin', { showDialog: false });
    this.scheduler = this.require('sync-scheduler', { lookahead: 0.050 });
    this.rawSocket = this.require('raw-socket');
    this.loader = this.require('audio-buffer-manager', {
      assetsDomain: assetsDomain,
      files: audioFiles,
    });    
    this.motionInput = this.require('motion-input', {
      descriptors: ['accelerationIncludingGravity', 'deviceorientation', 'energy']
    });

    if( window.location.hash === "#emulate" ) { this.emulateClick(); } 
  }

  init() {
    // init view (GUI)
    this.viewTemplate = viewTemplate;
    this.viewContent = {};
    this.viewCtor = soundworks.CanvasView;
    this.viewOptions = { preservePixelRatio: false };
    this.view = this.createView();
    this.renderer = new NuRenderer(this);
    this.view.addRenderer(this.renderer);
  }

  start() {
    super.start();

    if (!this.hasStarted) {
      this.init();
    }

    this.show();

    // init client position in room
    let coordinates = this.sharedConfig.get('setup.coordinates');
    this.coordinates = coordinates[client.index];
    this.send('coordinates', this.coordinates);

    // init Nu modules
    Object.keys(Nu).forEach( (nuClass) => {
      this['nu' + nuClass] = new Nu[nuClass](this);
    });

    // disable text selection, magnifier, and screen move on swipe on ios
    document.getElementsByTagName("body")[0].addEventListener("touchstart",
    function(e) { e.returnValue = false });

  }

  /** 
  * simulate user click to skip welcome screen (used e.g. for prototyping sessions on laptop)
  * won't work on mobile (need a REAL user input to start audio)
  **/
  emulateClick() {
    // prepare click and gui elmt on which to click
    const $el = document.querySelector('#service-platform');
    const event = new MouseEvent('mousedown', { 'view': window, 'bubbles': true, 'cancelable': true });
    // click if we've got gui elmt
    if( $el !== null ){ $el.dispatchEvent(event); }
    // re-iterate while not started (sometimes, even a click on gui will not start...)
    if( this.coordinates === undefined ){
      setTimeout(() => { this.emulateClick(); console.log('click delayed'); }, 300)
    }
  }
}